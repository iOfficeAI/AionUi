/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bottom terminal panel — the integrated terminal users see at the foot of
 * the window. Owns the tab strip and renders one `<TerminalInstance>` per
 * open PTY session.
 *
 * The component is always mounted (visibility is controlled by the parent
 * `react-resizable-panels` Panel) so sessions, output buffers, and tab focus
 * survive collapse/expand and navigation between pages.
 *
 * Bet A2 split: a single optional right-pane split. The left pane is
 * governed by the tab strip as usual; the right pane is a separate PTY
 * spawned with the active session's cwd and tracked by `splitSessionId`.
 * The split session is NOT in the tab strip — see `useTerminalSessions` for
 * the rationale (minimal A2 scope; per-pane tab groups deferred).
 */

import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Close } from '@icon-park/react';

import { ipcBridge } from '@/common';
import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { useTerminalShortcuts } from '@renderer/hooks/ui/useTerminalShortcuts';
import TerminalInstance from './TerminalInstance';
import TerminalTabs from './TerminalTabs';
import { useTerminalSessions } from './useTerminalSessions';
import { useTerminalTheme } from './useTerminalTheme';

const TerminalPanel: React.FC = () => {
  const { t } = useTranslation();
  const { open, close, pinned, togglePinned } = useTerminalPanel();
  const { fontScale } = useThemeContext();
  const theme = useTerminalTheme();
  const {
    sessions,
    activeId,
    setActive,
    openSession,
    closeSession,
    renameSession,
    cycleSession,
    splitSessionId,
    splitActive,
    closeSplit,
  } = useTerminalSessions();
  const params = useParams();

  const handleAdd = useCallback(() => {
    void openWithActiveWorkspace(openSession, params.id);
  }, [openSession, params.id]);

  // Auto-spawn the first session when the panel is opened for the first time.
  useEffect(() => {
    if (!open || sessions.length > 0) return;
    void openWithActiveWorkspace(openSession, params.id);
    // Intentional: only trigger when `open` transitions; we don't want this
    // to fire whenever sessions briefly becomes empty (e.g. last tab closed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useTerminalShortcuts({
    onNewSession: handleAdd,
    onCyclePrev: useCallback(() => cycleSession(-1), [cycleSession]),
    onCycleNext: useCallback(() => cycleSession(1), [cycleSession]),
  });

  const handleClose = useCallback(
    (id: string) => {
      void closeSession(id);
    },
    [closeSession]
  );

  const activeSession = sessions.find((session) => session.client_id === activeId) ?? sessions[0];
  const splitSession = splitSessionId ? (sessions.find((s) => s.client_id === splitSessionId) ?? null) : null;

  /**
   * Body for a single session: the xterm instance when it has a session_id,
   * or a placeholder for the optimistic/exited states. `visible` toggles
   * xterm's `display` so non-active instances stay mounted in the
   * background and preserve scrollback.
   */
  const renderBody = (session: (typeof sessions)[number] | null | undefined, visible: boolean) => {
    if (!session) return null;
    if (!session.session_id) {
      return (
        <div className='size-full flex-center text-t-tertiary text-12px'>
          {session.exited ? t('terminal.exitedUnknown', { title: session.title }) : t('terminal.startingShell')}
        </div>
      );
    }
    return (
      <TerminalInstance
        session_id={session.session_id}
        visible={visible}
        theme={theme}
        fontScale={fontScale}
        disabled={session.exited}
        restored={session.restored}
      />
    );
  };

  // The tab strip governs the LEFT pane only; everything else is the right
  // pane + inactive background tabs. The split session is real and
  // fully-fledged, but it is NOT in the tab strip.
  const foregroundIds = splitSession ? new Set([activeId, splitSessionId]) : null;
  const backgroundSessions = foregroundIds
    ? sessions.filter((s) => !foregroundIds.has(s.client_id))
    : sessions.filter((s) => s.client_id !== activeId);

  return (
    <div
      className='size-full flex flex-col bg-1 min-h-0'
      role='region'
      aria-label={t('terminal.panelLabel')}
      data-testid='terminal-panel'
    >
      <TerminalTabs
        sessions={sessions}
        activeId={activeId}
        onSelect={setActive}
        onClose={handleClose}
        onRename={renameSession}
        onAdd={handleAdd}
        onCollapsePanel={close}
        pinned={pinned}
        onTogglePinned={togglePinned}
        onSplit={splitSession ? undefined : () => void splitActive()}
        splitActive={Boolean(splitSession)}
      />
      <div className='flex-1 min-h-0 relative'>
        {sessions.length === 0 ? (
          <div className='size-full flex-center text-t-tertiary text-12px'>
            {open ? t('terminal.startingShell') : t('terminal.empty')}
          </div>
        ) : splitSession ? (
          <PanelGroup direction='horizontal' autoSaveId='terminal-split' className='size-full min-h-0'>
            <Panel defaultSize={50} minSize={20} className='min-h-0 overflow-hidden'>
              {renderBody(activeSession, true)}
            </Panel>
            <PanelResizeHandle
              className='group relative w-6px shrink-0 flex items-center justify-center cursor-col-resize'
              aria-label={t('terminal.split.resizeHandle', { defaultValue: 'Resize terminal split' })}
            >
              <span className='w-2px h-32px rounded-full bg-[var(--color-border-2)] group-hover:bg-[var(--color-primary)] transition-colors' />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={20} className='min-h-0 overflow-hidden relative'>
              {renderBody(splitSession, true)}
              <button
                type='button'
                onClick={() => void closeSplit()}
                className='absolute top-4px right-4px z-10 flex-center size-22px bg-2 border border-solid border-base rd-4px cursor-pointer text-t-secondary hover:bg-fill-3 hover:text-t-primary transition-colors'
                aria-label={t('terminal.split.close', { defaultValue: 'Close split pane' })}
                title={t('terminal.split.close', { defaultValue: 'Close split pane' })}
              >
                <Close theme='outline' size='12' fill='currentColor' style={{ lineHeight: 0 }} />
              </button>
            </Panel>
          </PanelGroup>
        ) : (
          renderBody(activeSession, true)
        )}
        {/* Background tabs: mounted but hidden so scrollback survives tab
            switches. CSS `display: none` in TerminalInstance handles the
            visibility toggle. */}
        {backgroundSessions.map((session) =>
          session.session_id ? (
            <TerminalInstance
              key={session.client_id}
              session_id={session.session_id}
              visible={false}
              theme={theme}
              fontScale={fontScale}
              disabled={session.exited}
              restored={session.restored}
            />
          ) : null
        )}
      </div>
    </div>
  );
};

/**
 * Resolve the workspace of the active conversation (if any) and open a new
 * shell rooted there. Falls back to the OS default cwd on any failure.
 */
async function openWithActiveWorkspace(
  openSession: (cwd?: string) => Promise<void>,
  conversationId: string | undefined
): Promise<void> {
  if (!conversationId) {
    await openSession();
    return;
  }
  try {
    const conv = await ipcBridge.conversation.get.invoke({ id: conversationId });
    const extra = conv?.extra && typeof conv.extra === 'object' ? (conv.extra as { workspace?: string }) : null;
    const workspace = extra?.workspace;
    await openSession(typeof workspace === 'string' && workspace.length > 0 ? workspace : undefined);
  } catch {
    await openSession();
  }
}

export default TerminalPanel;
