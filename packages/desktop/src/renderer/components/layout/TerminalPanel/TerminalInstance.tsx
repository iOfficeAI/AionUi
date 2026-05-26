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
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import type { ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { ipcBridge } from '@/common';
import type { TerminalOutputEvent } from '@/common/types/terminal/terminalTypes';

type Props = {
  session_id: string;
  visible: boolean;
  theme: ITheme;
  fontScale: number;
  disabled: boolean;
};

const BASE_FONT_SIZE = 13;
const FONT_FAMILY = "Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const TerminalInstance: React.FC<Props> = ({ session_id, visible, theme, fontScale, disabled }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

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

    // Listen for PTY output and write it into the terminal.
    const offOutput = ipcBridge.terminal.output.on((event: TerminalOutputEvent) => {
      if (event.session_id !== session_id) return;
      term.write(event.data);
    });

    // Watch container size to re-fit + push the new dimensions to the PTY.
    const obs = new ResizeObserver(() => {
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
    });
    obs.observe(host);
    resizeObsRef.current = obs;

    return () => {
      dataSub.dispose();
      offOutput();
      obs.disconnect();
      resizeObsRef.current = null;
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
      style={{ display: visible ? 'block' : 'none' }}
      aria-hidden={!visible}
    />
  );
};

export default React.memo(TerminalInstance);
