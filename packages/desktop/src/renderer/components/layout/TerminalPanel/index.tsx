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
 */

import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

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
  const { open, close } = useTerminalPanel();
  const { fontScale } = useThemeContext();
  const theme = useTerminalTheme();
  const { sessions, activeId, setActive, openSession, closeSession, renameSession, cycleSession } =
    useTerminalSessions();
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
      />
      <div className='flex-1 min-h-0 relative'>
        {sessions.length === 0 ? (
          <div className='size-full flex-center text-t-tertiary text-12px'>
            {open ? t('terminal.startingShell') : t('terminal.empty')}
          </div>
        ) : (
          sessions.map((session) =>
            session.session_id ? (
              <TerminalInstance
                key={session.client_id}
                session_id={session.session_id}
                visible={session.client_id === activeId}
                theme={theme}
                fontScale={fontScale}
                disabled={session.exited}
              />
            ) : null
          )
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
