/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single xterm.js instance bound to a server-side PTY session.
 *
 * The component keeps the underlying `Terminal` alive across visibility
 * changes — we toggle CSS `display` rather than unmounting so scrollback and
 * output buffers survive tab switches (matching VSCode/Cursor behavior).
 *
 * On mount, if the session was recovered from the main process's live list
 * (`restored: true`) we fetch a snapshot of recent output BEFORE subscribing
 * to live events. Any PTY output that arrives in the window between
 * subscribing and writing the snapshot is queued and drained after the
 * snapshot, so no data is lost or duplicated. See `attachReattach` below.
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import type { ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { ipcBridge } from '@/common';
import type { TerminalOutputEvent } from '@/common/types/terminal/terminalTypes';

import { createWriteQueue, type WriteQueue } from './writeQueue';

type Props = {
  session_id: string;
  visible: boolean;
  theme: ITheme;
  fontScale: number;
  disabled: boolean;
  /**
   * When true, fetch a snapshot of recent output from the main process and
   * write it before consuming any live events. Set to true for sessions
   * recovered via `terminal.list` on renderer re-attach.
   */
  restored: boolean;
};

const BASE_FONT_SIZE = 13;
const FONT_FAMILY = "'JetBrains Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const TerminalInstance: React.FC<Props> = ({ session_id, visible, theme, fontScale, disabled, restored }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const fitDebounceRef = useRef<number | null>(null);
  const queueRef = useRef<WriteQueue | null>(null);

  // Mount the terminal once. We re-fit on visibility changes and resizes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: BASE_FONT_SIZE * fontScale,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10_000,
      theme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.loadAddon(new CanvasAddon());
    } catch (error) {
      // CanvasAddon can fail on some Linux GPUs — fall back to DOM renderer silently.
      console.warn('[TerminalInstance] CanvasAddon failed, falling back to DOM:', error);
    }

    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    // Forward keystrokes to the PTY.
    const dataSub = term.onData((data) => {
      void ipcBridge.terminal.write.invoke({ session_id, data });
    });

    // Serialize all writes through a single-flight queue so a flood of PTY
    // events can never accumulate unbounded chunks in xterm's parser. The
    // queue chains writes via xterm's write callback and caps the
    // concatenation buffer at 1MB per write.
    const queue = createWriteQueue((data, cb) => {
      term.write(data, cb);
    });
    queueRef.current = queue;

    // Re-attach ordering: subscribe to live output FIRST so no event is
    // dropped, but route every event into a local reattach buffer instead
    // of straight into xterm while we fetch the snapshot. Once the
    // snapshot lands we drain `reattachBuf` into the main write queue in
    // order, then flip the listener to forward directly. This guarantees:
    //   1. The snapshot's contents are written before any new event the
    //      main process emitted after the snapshot was taken.
    //   2. No event is lost: anything that arrived between subscribe and
    //      snapshot land is appended to the snapshot before drain.
    // For non-restored sessions this is a no-op (no snapshot, events go
    // straight to the queue).
    const reattachBuf: string[] = [];
    let reattachDone = !restored;
    const offOutput = ipcBridge.terminal.output.on((event: TerminalOutputEvent) => {
      if (event.session_id !== session_id) return;
      if (reattachDone) {
        queue.enqueue(event.data);
        return;
      }
      reattachBuf.push(event.data);
    });

    if (restored) {
      void attachReattach({
        session_id,
        reattachBuf,
        onComplete: () => {
          reattachDone = true;
        },
        flush: (chunk) => queue.enqueue(chunk),
      });
    }

    // Watch container size to re-fit + push the new dimensions to the PTY.
    //
    // Debounced: while a layout pane (the left sider or the right
    // ConversationPane) animates its width, this container's width changes on
    // every animation frame. Fitting per-frame reflows the xterm grid and the
    // PTY, which reads as rapid flicker for the full ~300ms slide. Coalescing
    // to a single fit ~120ms after the size stops changing means we fit once,
    // after the animation settles — no flicker, no PTY resize spam.
    const runFit = () => {
      fitDebounceRef.current = null;
      if (!host.isConnected || host.offsetParent === null) return;
      try {
        fit.fit();
      } catch {
        /* terminal may not be visible yet */
      }
      const { cols, rows } = term;
      const last = lastSizeRef.current;
      if (!last || last.cols !== cols || last.rows !== rows) {
        lastSizeRef.current = { cols, rows };
        void ipcBridge.terminal.resize.invoke({ session_id, cols, rows });
      }
    };
    const obs = new ResizeObserver(() => {
      if (!host.isConnected || host.offsetParent === null) return;
      if (fitDebounceRef.current !== null) {
        window.clearTimeout(fitDebounceRef.current);
      }
      fitDebounceRef.current = window.setTimeout(runFit, 120);
    });
    obs.observe(host);
    resizeObsRef.current = obs;

    return () => {
      dataSub.dispose();
      offOutput();
      obs.disconnect();
      resizeObsRef.current = null;
      if (fitDebounceRef.current !== null) {
        window.clearTimeout(fitDebounceRef.current);
        fitDebounceRef.current = null;
      }
      queue.dispose();
      queueRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // We intentionally only mount once per session — subsequent prop changes
    // are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  // Push theme changes into the existing terminal without remounting.
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme = theme;
  }, [theme]);

  // Push font-scale changes; re-fit so dimensions stay aligned.
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return;
    termRef.current.options.fontSize = BASE_FONT_SIZE * fontScale;
    try {
      fitRef.current.fit();
    } catch {
      /* not visible */
    }
  }, [fontScale]);

  // When the panel becomes visible (or the active tab changes to this one),
  // fit + focus so the user can start typing immediately.
  useEffect(() => {
    if (!visible || !termRef.current || !fitRef.current) return;
    // Defer to next frame so layout has settled.
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
      if (!disabled) termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, disabled]);

  return (
    <div
      ref={hostRef}
      className='size-full overflow-hidden'
      style={{
        display: visible ? 'block' : 'none',
        // Promote the terminal (and its xterm canvases) to its own compositor
        // layer + isolate its paint. When a layout pane (left sider / right
        // ConversationPane) animates its width, the main content reflows every
        // frame; without isolation the browser repaints the canvases each
        // frame → visible flicker. On its own layer the terminal is merely
        // re-composited, not repainted.
        transform: 'translateZ(0)',
        contain: 'layout paint',
        backfaceVisibility: 'hidden',
      }}
      aria-hidden={!visible}
    />
  );
};

export default React.memo(TerminalInstance);

type ReattachArgs = {
  session_id: string;
  reattachBuf: string[];
  flush: (chunk: string) => void;
  onComplete: () => void;
};

/**
 * Re-attach ordering helper.
 *
 * Race-free sequence for restoring a session's scrollback:
 *   1. Caller has already subscribed to live output; events land in
 *      `reattachBuf`.
 *   2. We fetch the snapshot from main. The snapshot represents the
 *      main-side view of the ring buffer AT FETCH TIME — anything main
 *      emitted after that point will arrive via the live subscription.
 *   3. We concatenate `snapshot + reattachBuf` and write the combined
 *      blob into xterm. This guarantees chronological order: the snapshot
 *      covers the pre-fetch history, the reattachBuf covers the
 *      subscribe-to-fetch window. No duplicate output (snapshot is from
 *      before our subscription) and no gap (reattachBuf fills the window).
 *   4. After the combined blob is enqueued, the live subscription switches
 *      to forwarding directly to the queue (the next event handler
 *      invocation in the closure no longer pushes to reattachBuf because
 *      we null it out after step 3).
 *
 * If the snapshot RPC fails we log, drop the reattach buffer, and resume
 * live forwarding — the user will see a blank screen until live events
 * catch up, but no event is lost.
 */
async function attachReattach({ session_id, reattachBuf, flush, onComplete }: ReattachArgs): Promise<void> {
  let snapshot: string | null = null;
  try {
    const res = await ipcBridge.terminal.snapshot.invoke({ session_id });
    if (res?.success) {
      snapshot = res.data ?? null;
    } else {
      console.warn('[TerminalInstance] snapshot failed:', res?.msg ?? 'unknown');
    }
  } catch (error) {
    console.warn('[TerminalInstance] snapshot threw:', error);
  }

  // Drain everything we captured between subscribe and snapshot completion.
  const buffered = reattachBuf.join('');
  reattachBuf.length = 0;

  if (snapshot && snapshot.length > 0) {
    flush(snapshot);
  }
  if (buffered.length > 0) {
    flush(buffered);
  }
  // Flip the live listener into direct-queue mode. Anything that arrives
  // after this point bypasses reattachBuf and goes straight to the queue.
  onComplete();
}
