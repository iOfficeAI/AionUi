/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visible, user-facing layout mode selector.
 *
 * The selector is the primary, non-shortcut way to switch layout modes. It
 * lists only the modes that are available in the current runtime (so
 * unavailable editor / diff modes are never offered) and clearly marks the
 * active mode. Falls back gracefully when only one mode is available (the
 * button is still rendered so screen readers and tests can find it, but the
 * dropdown is hidden because there is nothing to switch to).
 */

import { Down, LayoutOne, LayoutThree, LayoutTwo } from '@icon-park/react';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutMode } from '@renderer/hooks/context/LayoutModeContext';
import { isMacOS } from '@renderer/utils/platform';
import type { LayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import { LAYOUT_MODES } from '@renderer/utils/layout/layoutModeStorage';

const ICON_SIZE = 14;
const STROKE_WIDTH = 2.5;

const modeIcon: Record<LayoutMode, React.FC<{ size?: number; strokeWidth?: number }>> = {
  default: LayoutOne,
  'split-pane': LayoutTwo,
  'editor-focused': LayoutThree,
  'diff-focused': LayoutThree,
};

const modeLabelKey: Record<LayoutMode, string> = {
  default: 'terminal.layout.modeDefault',
  'split-pane': 'terminal.layout.modeSplitPane',
  'editor-focused': 'terminal.layout.modeEditorFocused',
  'diff-focused': 'terminal.layout.modeDiffFocused',
};

const LayoutModeSelector: React.FC = () => {
  const { t } = useTranslation();
  const { mode, availableModes, setMode } = useLayoutMode();

  // Map of mode -> human-readable shortcut number (1..4), in source order.
  const modeShortcutIndex = useMemo<Record<LayoutMode, number>>(() => {
    const result = {} as Record<LayoutMode, number>;
    LAYOUT_MODES.forEach((m, idx) => {
      result[m] = idx + 1;
    });
    return result;
  }, []);

  const isAvailable = useCallback((m: LayoutMode) => availableModes.includes(m), [availableModes]);

  const ActiveIcon = modeIcon[mode] ?? LayoutOne;
  const activeLabel = t(modeLabelKey[mode]);

  const modKey = isMacOS() ? '⌘' : 'Ctrl';
  const shortcutHint = `${modKey}+${isMacOS() ? 'Option' : 'Alt'}+Shift+${modeShortcutIndex[mode]}`;

  // Render the dropdown menu with one item per available mode; items for
  // unavailable modes are intentionally not rendered (the spec calls for
  // hiding them rather than showing them as disabled).
  const droplist = useMemo(
    () => (
      <Menu
        role='menu'
        aria-label={t('terminal.layout.selectorLabel', { defaultValue: 'Layout mode' })}
        selectedKeys={[mode]}
      >
        {LAYOUT_MODES.map((m) => {
          if (!isAvailable(m)) return null;
          const Icon = modeIcon[m] ?? LayoutOne;
          const label = t(modeLabelKey[m]);
          const number = modeShortcutIndex[m];
          const ariaLabel = t('terminal.layout.shortcutSelect', {
            defaultValue: 'Select layout mode {{number}}',
            number,
          });
          return (
            <Menu.Item
              key={m}
              role='menuitemradio'
              aria-checked={mode === m}
              aria-label={ariaLabel}
              onClick={() => setMode(m)}
            >
              <span className='flex items-center gap-8px'>
                <Icon size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
                <span>{label}</span>
                <span
                  aria-hidden='true'
                  className='ml-auto pl-12px text-t-tertiary text-xs font-mono whitespace-nowrap'
                >
                  {modKey}+{isMacOS() ? 'Option' : 'Alt'}+Shift+{number}
                </span>
              </span>
            </Menu.Item>
          );
        })}
      </Menu>
    ),
    [isAvailable, mode, modeShortcutIndex, modKey, setMode, t]
  );

  const ariaCurrentLabel = t('terminal.layout.selectorCurrent', {
    defaultValue: 'Current layout: {{name}}',
    name: activeLabel,
  });

  // Only one mode available: render a static chip (no dropdown) so the user
  // still has a visible, labeled affordance. Keeping it as a button keeps
  // keyboard focus and screen-reader semantics consistent.
  if (availableModes.length <= 1) {
    return (
      <Tooltip content={ariaCurrentLabel} getPopupContainer={(node) => node.parentElement ?? document.body}>
        <Button
          type='text'
          size='mini'
          className='app-titlebar__button'
          aria-label={ariaCurrentLabel}
          aria-haspopup='menu'
          aria-expanded={false}
          disabled
        >
          <span className='flex items-center gap-4px'>
            <ActiveIcon size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      droplist={droplist}
      position='br'
      getPopupContainer={(node) => node.parentElement ?? document.body}
    >
      <Tooltip content={ariaCurrentLabel} getPopupContainer={(node) => node.parentElement ?? document.body}>
        <Button
          type='text'
          size='mini'
          className='app-titlebar__button'
          aria-label={ariaCurrentLabel}
          aria-haspopup='menu'
          aria-describedby={undefined}
        >
          <span className='flex items-center gap-4px'>
            <ActiveIcon size={ICON_SIZE} strokeWidth={STROKE_WIDTH} aria-hidden='true' />
            <Down size={10} aria-hidden='true' />
            <span className='sr-only'>{ariaCurrentLabel}</span>
            <span className='sr-only'>
              {t('terminal.layout.selectorHint', { defaultValue: 'Choose a layout mode' })} ({shortcutHint})
            </span>
          </span>
        </Button>
      </Tooltip>
    </Dropdown>
  );
};

export default LayoutModeSelector;
