/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Clear, Refresh } from '@icon-park/react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listenTerminalExecEvent } from './terminalEvents';
import { getTerminalTheme } from './terminalTheme';

// Ensure matchMedia exists for xterm in testing or headless environments
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export type TerminalPanelProps = {
  /** Unique project or session ID scoping the terminal session. */
  projectId: string;
  /** Working directory to launch the shell in. */
  cwd?: string;
  /** Whether the terminal panel is currently visible in the UI. */
  visible?: boolean;
};

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ projectId, cwd, visible = true }) => {
  const { t } = useTranslation();
  const terminalId = `terminal-${projectId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [shellInfo, setShellInfo] = useState<string>('');
  const [currentCwd, setCurrentCwd] = useState<string>(cwd || '');
  const [isReady, setIsReady] = useState(false);

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
  );

  // Monitor theme changes
  useEffect(() => {
    const update = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
      if (termRef.current) {
        termRef.current.options.theme = getTerminalTheme(theme === 'dark');
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Initialize terminal and connect to backend PTY
  const initTerminal = useCallback(async () => {
    if (!containerRef.current) return;

    // Dispose existing terminal if present
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: getTerminalTheme(currentTheme === 'dark'),
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    containerRef.current.innerHTML = '';
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    try {
      fitAddon.fit();
    } catch {
      // ignore if dimensions are 0
    }

    const cols = term.cols || 80;
    const rows = term.rows || 24;

    try {
      if (ipcBridge.terminal?.create) {
        const session = await ipcBridge.terminal.create.invoke({
          id: terminalId,
          cwd,
          cols,
          rows,
        });
        setShellInfo(session.shell);
        setCurrentCwd(session.cwd);
      }
      setIsReady(true);
    } catch (err) {
      console.error('[TerminalPanel] Failed to create terminal session:', err);
      term.writeln(`\r\n\x1b[31mFailed to start terminal session: ${String(err)}\x1b[0m\r\n`);
    }

    // Forward user keyboard input to backend
    term.onData((data) => {
      void ipcBridge.terminal?.write?.invoke({ id: terminalId, data });
    });
  }, [terminalId, cwd, currentTheme]);

  // Initial mount
  useEffect(() => {
    void initTerminal();

    // Subscribe to incoming terminal output from backend
    const disposeData = ipcBridge.terminal?.onData?.on
      ? ipcBridge.terminal.onData.on(({ id, data }) => {
          if (id === terminalId && termRef.current) {
            termRef.current.write(data);
          }
        })
      : () => {};

    const disposeExit = ipcBridge.terminal?.onExit?.on
      ? ipcBridge.terminal.onExit.on(({ id, exitCode }) => {
          if (id === terminalId && termRef.current) {
            termRef.current.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
          }
        })
      : () => {};

    return () => {
      disposeData();
      disposeExit();
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [initTerminal, terminalId]);

  // Resize handling with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (!visible) return;
      window.requestAnimationFrame(() => {
        try {
          if (fitAddonRef.current && termRef.current) {
            fitAddonRef.current.fit();
            const cols = termRef.current.cols;
            const rows = termRef.current.rows;
            if (cols > 0 && rows > 0) {
              void ipcBridge.terminal?.resize?.invoke({ id: terminalId, cols, rows });
            }
          }
        } catch {
          // ignore layout transition errors
        }
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible, terminalId]);

  // Refit and focus when tab becomes visible
  useEffect(() => {
    if (visible && fitAddonRef.current && termRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          termRef.current?.focus();
        } catch {
          // ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  // Listen to external execute events (e.g. from chat code block "Run in Terminal")
  useEffect(() => {
    const unlisten = listenTerminalExecEvent(({ command, projectId: targetProjectId }) => {
      // If targetProjectId matches this project or is not specified, run here
      if (targetProjectId && targetProjectId !== projectId) return;

      if (termRef.current) {
        // Send command followed by carriage return
        void ipcBridge.terminal?.write?.invoke({
          id: terminalId,
          data: `${command}\r`,
        });
        termRef.current.focus();
      }
    });
    return unlisten;
  }, [projectId, terminalId]);

  // Action: clear terminal screen
  const handleClear = useCallback(() => {
    if (termRef.current) {
      termRef.current.clear();
      // Also send clear command or Ctrl+L to shell
      void ipcBridge.terminal?.write?.invoke({ id: terminalId, data: '\x0c' });
    }
  }, [terminalId]);

  // Action: restart terminal shell
  const handleRestart = useCallback(async () => {
    try {
      await ipcBridge.terminal?.kill?.invoke({ id: terminalId });
      if (termRef.current) {
        termRef.current.reset();
      }
      await initTerminal();
      Message.success(t('common.restartTerminal', { defaultValue: 'Restarted terminal' }));
    } catch {
      Message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  }, [terminalId, initTerminal, t]);

  const shellBaseName = shellInfo.split(/[/\\]/).pop() || 'terminal';
  const cwdDisplay = currentCwd.split(/[/\\]/).pop() || currentCwd;

  return (
    <div className='flex flex-col h-full w-full min-h-0 bg-1 overflow-hidden' data-testid='sidebar-terminal'>
      {/* Terminal Top Toolbar */}
      <div className='flex items-center justify-between px-12px py-4px border-b border-[var(--bg-3)] flex-shrink-0 bg-2 select-none'>
        <div className='flex items-center gap-6px min-w-0 flex-1' title={`${shellInfo} — ${currentCwd}`}>
          <span className='text-11px font-mono font-medium text-t-primary truncate'>$ {shellBaseName}</span>
          {cwdDisplay && (
            <span className='text-10px font-mono text-t-secondary px-4px py-1px rounded bg-3 truncate max-w-160px'>
              {cwdDisplay}
            </span>
          )}
        </div>
        <div className='flex items-center gap-2px flex-shrink-0'>
          <Tooltip content={t('common.clearTerminal', { defaultValue: 'Clear Terminal' })} mini position='br'>
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary'
              icon={<Clear theme='outline' size='14' />}
              aria-label={t('common.clearTerminal', { defaultValue: 'Clear Terminal' })}
              onClick={handleClear}
              data-testid='terminal-clear-button'
            />
          </Tooltip>
          <Tooltip content={t('common.restartTerminal', { defaultValue: 'Restart Terminal' })} mini position='br'>
            <Button
              type='text'
              size='mini'
              className='flex items-center justify-center text-t-secondary hover:text-t-primary'
              icon={<Refresh theme='outline' size='14' />}
              aria-label={t('common.restartTerminal', { defaultValue: 'Restart Terminal' })}
              onClick={() => void handleRestart()}
              data-testid='terminal-restart-button'
            />
          </Tooltip>
        </div>
      </div>

      {/* Xterm Render Container */}
      <div
        ref={containerRef}
        className='flex-1 w-full min-h-0 p-4px overflow-hidden bg-1 cursor-text'
        onClick={() => termRef.current?.focus()}
        data-testid='terminal-container'
      />
    </div>
  );
};
