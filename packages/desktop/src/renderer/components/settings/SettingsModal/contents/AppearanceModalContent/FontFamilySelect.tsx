/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AionSelect from '@/renderer/components/base/AionSelect';
import { DROPDOWN_SEARCH_THRESHOLD } from '@/renderer/components/agent/runtimeSelectorOptions';
import { SYSTEM_FONT_FAMILY } from '@/common/config/fontFamilies';
import useSystemFonts from '@renderer/hooks/ui/font/useSystemFonts';

type FontFamilySelectProps = {
  /** Selected family name; '' means "system default (no override)". */
  value: string;
  onChange: (family: string) => void;
};

/**
 * Font-family picker for one appearance region. The machine's installed fonts
 * are enumerated lazily: the Local Font Access query fires when the dropdown
 * opens (a user gesture, which the API requires), never on mount. A search box
 * appears once the list is long. The always-present first option clears the
 * override back to the built-in default stack.
 */
const FontFamilySelect: React.FC<FontFamilySelectProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const { fonts, status, load } = useSystemFonts();

  const options = useMemo(() => {
    const list: { label: React.ReactNode; value: string }[] = [
      { label: t('settings.fontFamilySystemDefault'), value: SYSTEM_FONT_FAMILY },
    ];
    for (const family of fonts) {
      // Render each option in its own face so the menu previews the font.
      list.push({ label: <span style={{ fontFamily: `"${family}"` }}>{family}</span>, value: family });
    }
    return list;
  }, [fonts, t]);

  const notFoundContent =
    status === 'loading'
      ? t('settings.fontFamilyLoading')
      : status === 'error'
        ? t('settings.fontFamilyError')
        : t('settings.fontFamilyNoResults');

  return (
    <AionSelect
      className='w-200px'
      value={value}
      onChange={(next) => onChange(typeof next === 'string' ? next : SYSTEM_FONT_FAMILY)}
      options={options}
      loading={status === 'loading'}
      showSearch={fonts.length > DROPDOWN_SEARCH_THRESHOLD}
      // Options carry JSX labels (font previews), so match on the value (family name) instead.
      filterOption={(inputValue, option) =>
        String((option?.props as { value?: unknown } | undefined)?.value ?? '')
          .toLowerCase()
          .includes(inputValue.toLowerCase())
      }
      notFoundContent={notFoundContent}
      onVisibleChange={(visible) => {
        if (visible) load();
      }}
    />
  );
};

export default FontFamilySelect;
