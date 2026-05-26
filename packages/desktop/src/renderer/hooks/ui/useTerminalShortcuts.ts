/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keyboard shortcuts for the integrated bottom terminal.
 *
 *   Ctrl/Cmd + `        → toggle panel
 *   Ctrl/Cmd + Shift+`  → open a new terminal
 *   Ctrl/Cmd + PageUp   → previous tab
 *   Ctrl/Cmd + PageDown → next tab
 *
 * The "close active tab" shortcut (Ctrl/Cmd+W) is intentionally NOT bound
 * globally — it would conflict with browser-style close-window expectations.
 * Use the × on the tab or the in-shell `exit` command instead.
 */

import { useEffect } from 'react';

import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import { isElectronDesktop } from '@renderer/utils/platform';

export type UseTerminalShortcutsParams = {
  onNewSession: () => void;
  onCyclePrev: () => void;
  onCycleNext: () => void;
};

const isTogglePanelShortcut = (event: KeyboardEvent): boolean => {
  // Match `key === '`'`. `event.code` is 'Backquote' but `key` is the actual
  // character which respects keyboard layout — preferred for international users.
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === '`';
};

const isNewTerminalShortcut = (event: KeyboardEvent): boolean => {
  return (
    (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && (event.key === '~' || event.key === '`')
  );
};

const isCyclePrevShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === 'PageUp';
};

const isCycleNextShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === 'PageDown';
};

export const useTerminalShortcuts = ({ onNewSession, onCyclePrev, onCycleNext }: UseTerminalShortcutsParams): void => {
  const panel = useTerminalPanel();

  useEffect(() => {
    if (!isElectronDesktop()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      if (isTogglePanelShortcut(event)) {
        event.preventDefault();
        panel.toggle();
        return;
      }

      if (isNewTerminalShortcut(event)) {
        event.preventDefault();
        panel.open_();
        onNewSession();
        return;
      }

      // The cycle shortcuts only apply when the panel is open — otherwise we
      // would steal PageUp/PageDown from regular scrolling.
      if (!panel.open) return;

      if (isCyclePrevShortcut(event)) {
        event.preventDefault();
        onCyclePrev();
        return;
      }
      if (isCycleNextShortcut(event)) {
        event.preventDefault();
        onCycleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panel, onNewSession, onCyclePrev, onCycleNext]);
};
