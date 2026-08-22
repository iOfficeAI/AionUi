/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AionSelect from '@/renderer/components/base/AionSelect';
import { FONT_WEIGHT_TIERS, SYSTEM_FONT_WEIGHT } from '@/common/config/fontWeights';

type FontWeightSelectProps = {
  /** Selected weight tier; '' means "system default (no override)". */
  value: string;
  onChange: (weight: string) => void;
};

/**
 * Font-weight picker for one appearance region. Unlike the family picker, the
 * options are a small fixed set of standard tiers (no font enumeration, no lazy
 * load), each rendered in its own weight so the menu previews it. The
 * always-present first option clears the override back to the inherited weight.
 */
const FontWeightSelect: React.FC<FontWeightSelectProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const options = useMemo(() => {
    const list: { label: React.ReactNode; value: string }[] = [
      { label: t('settings.fontWeightSystemDefault'), value: SYSTEM_FONT_WEIGHT },
    ];
    for (const tier of FONT_WEIGHT_TIERS) {
      // Render each option in its own weight so the menu previews the tier.
      list.push({ label: <span style={{ fontWeight: tier.value }}>{t(tier.labelKey)}</span>, value: tier.value });
    }
    return list;
  }, [t]);

  return (
    <AionSelect
      className='w-140px'
      value={value}
      onChange={(next) => onChange(typeof next === 'string' ? next : SYSTEM_FONT_WEIGHT)}
      options={options}
    />
  );
};

export default FontWeightSelect;
