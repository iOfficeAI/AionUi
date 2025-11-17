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

// 浮点数比较容差 / Floating point comparison tolerance
const EPSILON = 0.001;
const RESET_THRESHOLD = 0.01;

/**
 * 将值限制在字体缩放的有效范围内 / Clamp value within valid font scale range
 * @param value - 要限制的值 / Value to clamp
 * @returns 限制后的值 / Clamped value
 */
const clamp = (value: number) => Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));

/**
 * 字体大小控制组件 / Font size control component
 *
 * 提供界面缩放功能，支持滑块和按钮调节
 * Provides interface scaling with slider and button controls
 */
const FontSizeControl: React.FC = () => {
  const { t } = useTranslation();
  const { fontScale, setFontScale } = useThemeContext();

  // 格式化显示值为百分比 / Format display value as percentage
  const formattedValue = useMemo(() => `${Math.round(fontScale * 100)}%`, [fontScale]);

  // 默认标记（100%位置）/ Default mark (100% position)
  const defaultMarks = useMemo(
    () => ({
      1: <span className='font-scale-default-mark' aria-hidden='true' title='100%'></span>,
    }),
    []
  );

  /**
   * 处理滑块值变化 / Handle slider value change
   * @param value - 新的缩放值 / New scale value
   */
  const handleSliderChange = (value: number | number[]) => {
    if (typeof value === 'number') {
      void setFontScale(clamp(Number(value.toFixed(2))));
    }
  };

  /**
   * 处理步进调节 / Handle step adjustment
   * @param delta - 步进增量（正数增大，负数减小）/ Step delta (positive to increase, negative to decrease)
   */
  const handleStep = (delta: number) => {
    const next = clamp(Number((fontScale + delta).toFixed(2)));
    void setFontScale(next);
  };

  /**
   * 重置到默认值 / Reset to default value
   */
  const handleReset = () => {
    void setFontScale(FONT_SCALE_DEFAULT);
  };

  return (
    <div className='flex flex-col gap-2 w-full max-w-560px'>
      <div className='flex items-center gap-1 w-full'>
        <Button size='mini' type='secondary' onClick={() => handleStep(-FONT_SCALE_STEP)} disabled={fontScale <= FONT_SCALE_MIN + EPSILON}>
          -
        </Button>
        {/* 滑杆覆盖 80%-150% 区间，随值写入配置 / Slider covers 80%-150% range and persists value */}
        <Slider className='flex-1 font-scale-slider p-0 m-0' showTicks min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} value={fontScale} onChange={handleSliderChange} marks={defaultMarks} />
        <Button size='mini' type='secondary' onClick={() => handleStep(FONT_SCALE_STEP)} disabled={fontScale >= FONT_SCALE_MAX - EPSILON}>
          +
        </Button>
        <span className='text-13px text-t-secondary' style={{ minWidth: '48px' }}>
          {formattedValue}
        </span>
        <Button size='mini' type='text' className='p-0' onClick={handleReset} disabled={Math.abs(fontScale - FONT_SCALE_DEFAULT) < RESET_THRESHOLD}>
          {t('settings.fontSizeReset')}
        </Button>
      </div>
    </div>
  );
};

export default FontSizeControl;
