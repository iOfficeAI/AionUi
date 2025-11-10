/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Button, Slider } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../context/ThemeContext';
import { FONT_SCALE_DEFAULT, FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../hooks/useFontScale';

const clamp = (value: number) => Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));

const FontSizeControl: React.FC = () => {
  // 字体缩放交互控件 / Font scale control component
  const { t } = useTranslation();
  const { fontScale, setFontScale } = useThemeContext();

  const formattedValue = useMemo(() => `${Math.round(fontScale * 100)}%`, [fontScale]);

  const handleSliderChange = (value: number | number[]) => {
    if (typeof value === 'number') {
      void setFontScale(clamp(Number(value.toFixed(2))));
    }
  };

  const handleStep = (delta: number) => {
    const next = clamp(Number((fontScale + delta).toFixed(2)));
    void setFontScale(next);
  };

  const handleReset = () => {
    void setFontScale(FONT_SCALE_DEFAULT);
  };

  return (
    <div className='flex flex-col gap-2 w-full max-w-560px'>
      <div className='flex items-center gap-3 w-full'>
        <Button size='mini' type='secondary' onClick={() => handleStep(-FONT_SCALE_STEP)} disabled={fontScale <= FONT_SCALE_MIN + 0.001}>
          A-
        </Button>
        {/* 滑杆覆盖 80%-150% 区间，随值写入配置 / Slider covers 80%-150% range and persists value */}
        <Slider className='flex-1' showTicks min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} value={fontScale} onChange={handleSliderChange} />
        <Button size='mini' type='secondary' onClick={() => handleStep(FONT_SCALE_STEP)} disabled={fontScale >= FONT_SCALE_MAX - 0.001}>
          A+
        </Button>
        <span className='text-13px text-t-secondary' style={{ minWidth: '48px' }}>
          {formattedValue}
        </span>
        <Button size='mini' type='text' onClick={handleReset} disabled={Math.abs(fontScale - FONT_SCALE_DEFAULT) < 0.01}>
          {t('settings.fontSizeReset')}
        </Button>
      </div>
      <p className='text-12px text-t-secondary m-0'>{t('settings.fontSizeDescription')}</p>
    </div>
  );
};

export default FontSizeControl;
