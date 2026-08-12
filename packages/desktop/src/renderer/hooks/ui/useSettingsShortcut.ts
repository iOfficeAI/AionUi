/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { isPrimaryApplicationShortcut, SETTINGS_SHORTCUT_KEY } from '@/renderer/utils/ui/keyboardShortcuts';

/**
 * Registers the platform-native preferences shortcut (⌘, on macOS / Ctrl+, on
 * Windows & Linux) to toggle between the settings view and the previous view.
 * Typing a comma inside an editable target is never swallowed.
 */
export const useSettingsShortcut = (onToggle: () => void): void => {
  const onToggleRef = useRef(onToggle);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPrimaryApplicationShortcut(event, { key: SETTINGS_SHORTCUT_KEY, targetGuard: 'all-editable' })) {
        event.preventDefault();
        onToggleRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
