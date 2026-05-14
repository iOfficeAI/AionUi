/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Message, Tooltip, Typography } from '@arco-design/web-react';
import { FullScreen, FolderCode, Refresh } from '@icon-park/react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '@xterm/xterm/css/xterm.css';

type WorkspaceTerminalPanelProps = {
  workspacePath: string;
  visible?: boolean;
};

type TerminalLayoutMode = 'bottom' | 'side' | 'floating';

type TerminalSize = {
  width: number;
  height: number;
};

const STORAGE_PREFIX = 'aionui:workspace-terminal-size:';
const LAYOUT_STORAGE_PREFIX = 'aionui:workspace-terminal-layout:';
const DEFAULT_SIZE: TerminalSize = {
  width: 920,
  height: 420,
};
const MIN_SIZE: TerminalSize = {
  width: 360,
  height: 220,
};
const DEFAULT_LAYOUT_MODE: TerminalLayoutMode = 'bottom';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const readStoredSize = (workspacePath: string): TerminalSize => {
  if (typeof window === 'undefined') return DEFAULT_SIZE;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${workspacePath}`);
    if (!raw) return DEFAULT_SIZE;

    const parsed = JSON.parse(raw) as Partial<TerminalSize>;
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return {
        width: Math.max(MIN_SIZE.width, parsed.width),
        height: Math.max(MIN_SIZE.height, parsed.height),
      };
    }
  } catch (error) {
    console.warn('[WorkspaceTerminalPanel] Failed to read size preference:', error);
  }

  return DEFAULT_SIZE;
};

const readStoredLayoutMode = (workspacePath: string): TerminalLayoutMode => {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT_MODE;

  const raw = window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}${workspacePath}`);
  if (raw === 'bottom' || raw === 'side' || raw === 'floating') {
    return raw;
  }

  return DEFAULT_LAYOUT_MODE;
};

const WorkspaceTerminalPanel: React.FC<WorkspaceTerminalPanelProps> = ({ workspacePath, visible = true }) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startWidth: DEFAULT_SIZE.width,
    startHeight: DEFAULT_SIZE.height,
  });
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [size, setSize] = useState<TerminalSize>(() => readStoredSize(workspacePath));
  const [layoutMode, setLayoutMode] = useState<TerminalLayoutMode>(() => readStoredLayoutMode(workspacePath));

  const persistSize = useCallback(
    (nextSize: TerminalSize) => {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${workspacePath}`, JSON.stringify(nextSize));
      } catch (error) {
        console.warn('[WorkspaceTerminalPanel] Failed to persist size preference:', error);
      }
    },
    [workspacePath]
  );

  const persistLayoutMode = useCallback(
    (nextLayoutMode: TerminalLayoutMode) => {
      try {
        window.localStorage.setItem(`${LAYOUT_STORAGE_PREFIX}${workspacePath}`, nextLayoutMode);
      } catch (error) {
        console.warn('[WorkspaceTerminalPanel] Failed to persist layout preference:', error);
      }
    },
    [workspacePath]
  );

  useEffect(() => {
    persistSize(size);
  }, [persistSize, size]);

  useEffect(() => {
    persistLayoutMode(layoutMode);
  }, [layoutMode, persistLayoutMode]);

  useEffect(() => {
    setSize(readStoredSize(workspacePath));
    setLayoutMode(readStoredLayoutMode(workspacePath));
    terminalRef.current?.dispose();
    terminalRef.current = null;
    fitAddonRef.current = null;
    sessionIdRef.current = null;
    setIsBootstrapping(false);
  }, [workspacePath]);

  const resizeTerminal = useCallback(async () => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const sessionId = sessionIdRef.current;
    const host = terminalHostRef.current;
    if (!terminal || !fitAddon || !sessionId || !host || !visible) return;

    const rect = host.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return;

    try {
      fitAddon.fit();
      if (terminal.cols > 0 && terminal.rows > 0) {
        await ipcBridge.terminal.resize.invoke({
          sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      }
    } catch (error) {
      console.warn('[WorkspaceTerminalPanel] Failed to fit terminal:', error);
    }
  }, [visible]);

  useEffect(() => {
    if (terminalRef.current || !terminalHostRef.current) {
      return;
    }

    const terminal = new XTerm({
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      fontFamily:
        '"SFMono-Regular", "Menlo", "Monaco", "Cascadia Mono", "Segoe UI Mono", "Liberation Mono", monospace',
      fontSize: 13,
      allowTransparency: true,
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#e2e8f0',
        selectionBackground: 'rgba(148, 163, 184, 0.35)',
        black: '#0f172a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#cbd5e1',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#e879f9',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setIsBootstrapping(true);

    let disposed = false;

    const initialize = async () => {
      try {
        const result = await ipcBridge.terminal.createSession.invoke({
          cwd: workspacePath,
          cols: terminal.cols,
          rows: terminal.rows,
        });
        if (disposed) return;
        sessionIdRef.current = result.sessionId;

        const writeUnsub = ipcBridge.terminal.data.on(({ sessionId, data }) => {
          if (sessionId === sessionIdRef.current) {
            terminal.write(data);
          }
        });
        const exitUnsub = ipcBridge.terminal.exit.on(({ sessionId, code, signal }) => {
          if (sessionId !== sessionIdRef.current) return;
          sessionIdRef.current = null;
          terminal.writeln('');
          terminal.writeln(`[process exited with code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}]`);
        });
        unsubscribeRef.current = [writeUnsub, exitUnsub];

        terminal.onData((data) => {
          const sessionId = sessionIdRef.current;
          if (!sessionId) return;
          void ipcBridge.terminal.write.invoke({ sessionId, data });
        });

        requestAnimationFrame(() => {
          void resizeTerminal();
          setIsBootstrapping(false);
        });
      } catch (error) {
        console.error('[WorkspaceTerminalPanel] Failed to bootstrap terminal:', error);
        Message.error(t('conversation.workspace.terminal.openFailed'));
        setIsBootstrapping(false);
      }
    };

    void initialize();

    const observer = new ResizeObserver(() => {
      void resizeTerminal();
    });
    observer.observe(terminalHostRef.current);

    const handleWindowResize = () => {
      void resizeTerminal();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleWindowResize);
      observer.disconnect();
      for (const unsubscribe of unsubscribeRef.current) {
        unsubscribe();
      }
      unsubscribeRef.current = [];
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      fitAddonRef.current = null;

      if (sessionId) {
        void ipcBridge.terminal.dispose.invoke({ sessionId }).catch(() => {});
      }
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [resizeTerminal, workspacePath]);

  useEffect(() => {
    if (!visible) return;
    void resizeTerminal();
  }, [layoutMode, size, resizeTerminal, visible]);

  const shellStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      width: `min(100%, ${size.width}px)`,
      height: `${size.height}px`,
    };

    if (layoutMode === 'side') {
      return {
        ...base,
        width: `min(100%, ${Math.max(size.width, MIN_SIZE.width)}px)`,
        height: '100%',
      };
    }

    if (layoutMode === 'floating') {
      return {
        ...base,
        position: 'absolute',
        right: '12px',
        bottom: '12px',
        zIndex: 10,
        maxWidth: 'calc(100% - 24px)',
        maxHeight: 'calc(100% - 24px)',
      };
    }

    return base;
  }, [layoutMode, size.height, size.width]);

  const handleLayoutModeChange = useCallback((nextLayoutMode: TerminalLayoutMode) => {
    setLayoutMode(nextLayoutMode);
  }, []);

  const resetSize = useCallback(() => {
    setSize(DEFAULT_SIZE);
  }, []);

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
    void resizeTerminal();
  }, [resizeTerminal]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';

    const finish = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current.active || moveEvent.pointerId !== dragStateRef.current.pointerId) return;
      const nextWidth = clamp(
        dragStateRef.current.startWidth + (moveEvent.clientX - dragStateRef.current.startX),
        MIN_SIZE.width,
        Math.max(MIN_SIZE.width, rect.width - 24)
      );
      const nextHeight = clamp(
        dragStateRef.current.startHeight + (moveEvent.clientY - dragStateRef.current.startY),
        MIN_SIZE.height,
        Math.max(MIN_SIZE.height, rect.height - 24)
      );
      setSize({ width: nextWidth, height: nextHeight });
    };

    const handleEnd = (upEvent: PointerEvent) => {
      if (dragStateRef.current.pointerId !== upEvent.pointerId) return;
      finish();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  }, [size.height, size.width]);

  if (!isElectronDesktop()) {
    return (
      <div className='h-full flex items-center justify-center px-20px py-24px text-center'>
        <div className='max-w-360px'>
          <Typography.Title heading={6} className='!mb-8px'>
            {t('conversation.workspace.terminal.title')}
          </Typography.Title>
          <Typography.Paragraph className='!mb-0 text-t-secondary'>
            {t('conversation.workspace.terminal.unsupported')}
          </Typography.Paragraph>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={classNames('h-full flex flex-col gap-12px px-12px py-12px box-border overflow-auto', {
        relative: layoutMode === 'floating',
      })}
    >
      <div className='flex items-start justify-between gap-12px flex-wrap'>
        <div className='min-w-0'>
          <Typography.Title heading={6} className='!mb-4px'>
            {t('conversation.workspace.terminal.title')}
          </Typography.Title>
          <Typography.Text className='block text-12px text-t-secondary break-all'>{workspacePath}</Typography.Text>
        </div>

        <div className='flex items-center gap-8px shrink-0 flex-wrap justify-end'>
          <div className='flex items-center gap-4px rounded-999px border border-[var(--bg-3)] bg-[var(--bg-2)] p-4px'>
            {(['bottom', 'side', 'floating'] as const).map((mode) => {
              const isActive = layoutMode === mode;
              const labelKey =
                mode === 'bottom'
                  ? 'conversation.workspace.terminal.layoutBottom'
                  : mode === 'side'
                    ? 'conversation.workspace.terminal.layoutSide'
                    : 'conversation.workspace.terminal.layoutFloating';

              return (
                <Button
                  key={mode}
                  type='text'
                  size='small'
                  className={classNames(
                    'workspace-terminal-layout-toggle !rounded-999px !px-10px',
                    isActive && 'workspace-terminal-layout-toggle--active'
                  )}
                  onClick={() => handleLayoutModeChange(mode)}
                >
                  {t(labelKey)}
                </Button>
              );
            })}
          </div>

          <Tooltip content={t('conversation.workspace.terminal.resetSize')} mini>
            <Button type='text' size='small' icon={<FullScreen size={16} />} onClick={resetSize}>
              {t('common.reset', { defaultValue: 'Reset' })}
            </Button>
          </Tooltip>
          <Tooltip content={t('conversation.workspace.terminal.clearTooltip')} mini>
            <Button type='text' size='small' icon={<Refresh size={16} />} onClick={clearTerminal}>
              {t('common.clear')}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div
        className={classNames(
          'workspace-terminal-shell relative flex flex-col overflow-hidden rounded-16px border border-[var(--bg-3)] bg-[var(--color-bg-1)]',
          {
            'self-start shadow-[0_16px_48px_rgba(15,23,42,0.12)]': layoutMode === 'bottom',
            'self-stretch shadow-[0_10px_36px_rgba(15,23,42,0.10)]': layoutMode === 'side',
            'shadow-[0_24px_70px_rgba(15,23,42,0.24)]': layoutMode === 'floating',
          }
        )}
        data-layout-mode={layoutMode}
        style={shellStyle}
      >
        <div className='flex items-center justify-between px-12px py-8px border-b border-[var(--bg-3)] bg-[color-mix(in_srgb,var(--color-bg-1)_92%,black)]'>
          <div className='flex items-center gap-8px min-w-0 text-12px text-t-secondary'>
            <FolderCode size={14} />
            <span className='truncate'>{t('conversation.workspace.terminal.statusReady')}</span>
          </div>
          <div className='text-12px text-t-secondary'>{isBootstrapping ? t('common.loading') : 'TTY'}</div>
        </div>

        <div ref={terminalHostRef} className='flex-1 w-full overflow-hidden' />

        <button
          type='button'
          aria-label={t('conversation.workspace.terminal.resizeAria')}
          className={classNames(
            'workspace-terminal-resize-handle absolute right-0 bottom-0 z-20 flex items-end justify-end',
            'w-24px h-24px p-3px text-t-secondary hover:text-t-primary active:text-t-primary'
          )}
          onPointerDown={handleDragStart}
        >
          <span className='block w-10px h-10px rounded-2px border border-current opacity-70' />
        </button>
      </div>
    </div>
  );
};

export default WorkspaceTerminalPanel;
