/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BgProcessOutputViewer — polls `readBgProcessOutput` for a single bg
 * process and renders a monospace scrollback.
 *
 * Polling:
 *  - 1 s cadence while the viewer is mounted and the process is running.
 *  - Stops the moment the process leaves `running` (exit code is final).
 *  - The consumer is expected to unmount us when the modal closes; the
 *    useBgProcesses hook's `pollWhileOpen` handles the cross-cutting case
 *    where the user re-opens the modal on a dead process — we still poll
 *    once to read the buffered output.
 *
 * Stickiness:
 *  - The scroll position auto-tracks the tail while the user is "at the
 *    bottom" (within STICK_THRESHOLD px of the bottom). As soon as they
 *    scroll up, we freeze the tail-follow so they can read history.
 *  - The first paint, and any explicit user scroll to the very bottom,
 *    resume the auto-follow.
 *
 * Memory cap:
 *  - Buffered text is capped at MAX_BUFFER_BYTES (1 MiB). The oldest
 *    chunk is dropped on overflow — the server is the source of truth
 *    for "everything ever written", and this is just the live tail.
 */

import { ipcBridge } from '@/common';
import type { BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const POLL_MS = 1_000;
const STICK_THRESHOLD_PX = 24;
const MAX_BUFFER_BYTES = 1 * 1024 * 1024;
const MAX_BUFFER_CHARS = MAX_BUFFER_BYTES;

type BgProcessOutputViewerProps = {
  remoteAgentId: string;
  process: BgProcessUiInfo;
  /** Test override for the poll cadence. */
  pollIntervalMs?: number;
  /** Forwarded for tests. */
  dataTestId?: string;
};

const isAtBottom = (el: HTMLPreElement): boolean => {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= STICK_THRESHOLD_PX;
};

const BgProcessOutputViewer: React.FC<BgProcessOutputViewerProps> = ({
  remoteAgentId,
  process,
  pollIntervalMs = POLL_MS,
  dataTestId,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState<string>('');
  const [truncated, setTruncated] = useState<boolean>(process.truncated);
  const [status, setStatus] = useState<BgProcessUiInfo['status']>(process.status);
  const [exitCode, setExitCode] = useState<number | undefined>(process.exit_code);

  const offsetRef = useRef<number>(0);
  const stickRef = useRef<boolean>(true);
  const mountedRef = useRef<boolean>(true);
  const preRef = useRef<HTMLPreElement | null>(null);
  const stopPollRef = useRef<(() => void) | null>(null);

  const append = useCallback((chunk: string) => {
    setText((prev) => {
      if (!chunk) return prev;
      const combined = prev + chunk;
      if (combined.length <= MAX_BUFFER_CHARS) return combined;
      // Drop oldest in ~32 KiB slices to avoid chopping mid-codepoint
      // repeatedly on every render.
      const overflow = combined.length - MAX_BUFFER_CHARS;
      const dropAtLeast = Math.max(overflow, 32 * 1024);
      return combined.slice(dropAtLeast);
    });
  }, []);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await ipcBridge.remoteAgent.readBgProcessOutput.invoke({
        id: remoteAgentId,
        pid: process.id,
        offset: offsetRef.current,
      });
      if (!mountedRef.current || !res) return;
      if (res.output) append(res.output);
      offsetRef.current = res.next_offset;
      // The backend can advance the process while we're polling.
      setStatus(res.process.status);
      setTruncated(res.process.truncated);
      setExitCode(res.process.exit_code);
    } catch {
      // Transient network failure — try again next tick. We don't surface
      // a hard error because a polling loop firing every second is too
      // noisy; the next successful poll self-corrects the visible text.
    }
  }, [remoteAgentId, process.id, append]);

  // Manage the poll lifecycle in one effect so unmounting / status changes
  // cleanly tear it down.
  useEffect(() => {
    mountedRef.current = true;
    if (status === 'running') {
      // Fire one immediate read so the panel isn't empty on first paint.
      void fetchOnce();
      const intervalId = setInterval(() => {
        void fetchOnce();
      }, pollIntervalMs);
      stopPollRef.current = () => clearInterval(intervalId);
    } else {
      // One read is still worth it: the server may have buffered more
      // output between the last `bgProcessChanged` push and our mount.
      void fetchOnce();
    }
    return () => {
      mountedRef.current = false;
      stopPollRef.current?.();
      stopPollRef.current = null;
    };
    // We intentionally key the effect on process.id + status so a status
    // change (e.g. running→exited via WS push) restarts the timer with
    // the new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process.id, status, pollIntervalMs]);

  // Stickiness: the user might scroll up to read history. We keep a
  // ref-based "should-stick" flag and only mutate it on explicit user
  // input — never inside the render flow.
  const handleScroll = useCallback((event: React.UIEvent<HTMLPreElement>) => {
    const target = event.currentTarget;
    stickRef.current = isAtBottom(target);
  }, []);

  // Track process transitions: when a `bgProcessChanged` push arrives
  // for THIS process, mirror status into local state so the poll effect
  // can stop.
  useEffect(() => {
    const unsubscribe = ipcBridge.remoteAgent.bgProcessChanged.on((event) => {
      if (!event || event.agent_id !== remoteAgentId) return;
      if (event.process.id !== process.id) return;
      setStatus(event.process.status);
      setTruncated(event.process.truncated);
      setExitCode(event.process.exit_code);
    });
    return () => {
      unsubscribe();
    };
  }, [remoteAgentId, process.id]);

  // Auto-scroll on every text update iff the user is sticky.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = preRef.current;
    if (!el) return;
    // Defer to next frame so the layout has the new height first.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [text]);

  const isEmpty = text.length === 0;
  const emptyText = useMemo(() => t('agent.bgProcess.panel.outputEmpty', { defaultValue: 'No output yet' }), [t]);
  const truncatedText = useMemo(
    () =>
      t('agent.bgProcess.panel.outputTruncated', {
        defaultValue: 'Output truncated. Showing the most recent buffered output.',
      }),
    [t]
  );

  return (
    <div className='flex flex-col gap-6px w-full' data-testid={dataTestId ?? 'bg-process-output-viewer'}>
      <div className='flex items-center justify-between text-12px text-t-secondary'>
        <span data-testid='bg-process-output-status'>
          {t('agent.bgProcess.panel.status.' + status, { defaultValue: status })}
          {status !== 'running' && exitCode !== undefined ? ` · exit ${exitCode}` : ''}
        </span>
        {truncated ? (
          <span data-testid='bg-process-output-truncated' className='text-warning'>
            {truncatedText}
          </span>
        ) : null}
      </div>
      <pre
        ref={preRef}
        onScroll={handleScroll}
        data-testid='bg-process-output-pre'
        className='m-0 px-12px py-8px bg-1 border border-b-light rd-6px text-12px text-t-primary overflow-auto font-mono whitespace-pre-wrap break-words'
        style={{ maxHeight: 360, minHeight: 120, lineHeight: 1.5 }}
      >
        {isEmpty ? <span className='text-t-tertiary'>{emptyText}</span> : text}
      </pre>
    </div>
  );
};

export default BgProcessOutputViewer;
