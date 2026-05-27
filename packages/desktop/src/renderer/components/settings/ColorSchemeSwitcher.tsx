/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import type { ColorScheme } from '@/renderer/hooks/ui/useColorScheme';
import React from 'react';
import { useTranslation } from 'react-i18next';

type SchemeOption = {
  value: ColorScheme;
  label: string;
  /** Two-color swatch (top-left/bottom-right) used as the visual cue. */
  swatch: [string, string];
};

/**
 * Color scheme picker — orthogonal to the light/dark mode toggle.
 *
 * Schemes flip the CSS variables on `[data-color-scheme]`; light/dark flips
 * `[data-theme]`. The two combine, so each scheme provides its own light and
 * dark variant.
 */
export const ColorSchemeSwitcher: React.FC = () => {
  const { colorScheme, setColorScheme } = useThemeContext();
  const { t } = useTranslation();

  const options: SchemeOption[] = [
    {
      value: 'default',
      label: t('settings.colorScheme.default', { defaultValue: 'Gruvbox' }),
      swatch: ['#fbf1c7', '#8f3f71'],
    },
    {
      value: 'chisl',
      label: t('settings.colorScheme.chisl', { defaultValue: 'Chisl' }),
      swatch: ['#f0e4b4', '#b4480c'],
    },
  ];

  return (
    <div
      className='inline-flex items-center gap-6px p-4px rd-full border border-solid border-[var(--color-border-2)] bg-1'
      role='radiogroup'
      aria-label={t('settings.colorScheme.label', { defaultValue: 'Color scheme' })}
    >
      {options.map((option) => {
        const isActive = colorScheme === option.value;
        return (
          <button
            key={option.value}
            type='button'
            role='radio'
            aria-checked={isActive}
            className='inline-flex items-center gap-6px h-26px px-10px rd-full text-13px font-500 transition-all'
            style={{
              backgroundColor: isActive ? 'var(--color-fill-2)' : 'transparent',
              border: isActive ? '1px solid var(--color-border-2)' : '1px solid transparent',
              color: isActive ? 'var(--color-text-1)' : 'var(--color-text-2)',
              cursor: isActive ? 'default' : 'pointer',
            }}
            onClick={() => {
              if (!isActive) {
                void setColorScheme(option.value);
              }
            }}
          >
            <span
              aria-hidden='true'
              className='inline-block size-14px rd-full border border-solid border-[var(--color-border-2)] overflow-hidden relative'
              style={{ backgroundColor: option.swatch[0] }}
            >
              <span
                className='absolute inset-0'
                style={{
                  background: `linear-gradient(135deg, transparent 0%, transparent 50%, ${option.swatch[1]} 50%, ${option.swatch[1]} 100%)`,
                }}
              />
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ColorSchemeSwitcher;
