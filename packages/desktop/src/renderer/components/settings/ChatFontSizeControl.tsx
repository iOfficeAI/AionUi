/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Button, Slider } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import {
  CHAT_FONT_SCALE_DEFAULT,
  CHAT_FONT_SCALE_MAX,
  CHAT_FONT_SCALE_MIN,
  CHAT_FONT_SCALE_STEP,
} from '@renderer/hooks/ui/useChatFontScale';

const EPSILON = 0.001;
const RESET_THRESHOLD = 0.01;

const clamp = (value: number) => Math.min(CHAT_FONT_SCALE_MAX, Math.max(CHAT_FONT_SCALE_MIN, value));

const ChatFontSizeControl: React.FC = () => {
  const { t } = useTranslation();
  const { chatFontScale, setChatFontScale, theme } = useThemeContext();

  const formattedValue = useMemo(() => `${Math.round(chatFontScale * 100)}%`, [chatFontScale]);

  const defaultMarks = useMemo(
    () => ({
      1: <span className='font-scale-default-mark' aria-hidden='true' title='100%'></span>,
    }),
    []
  );

  const handleSliderChange = (value: number | number[]) => {
    if (typeof value === 'number') {
      void setChatFontScale(clamp(Number(value.toFixed(2))));
    }
  };

  const handleStep = (delta: number) => {
    const next = clamp(Number((chatFontScale + delta).toFixed(2)));
    void setChatFontScale(next);
  };

  const handleReset = () => {
    void setChatFontScale(CHAT_FONT_SCALE_DEFAULT);
  };
  const isResetDisabled = Math.abs(chatFontScale - CHAT_FONT_SCALE_DEFAULT) < RESET_THRESHOLD;

  return (
    <div className='flex flex-col gap-2 w-full md:max-w-620px'>
      <div className='flex items-center flex-wrap gap-x-12px gap-y-10px w-full'>
        <div className='flex items-center gap-8px flex-1 min-w-240px'>
          <Button
            size='mini'
            type='secondary'
            shape='circle'
            className='w-28px h-28px !min-w-28px flex items-center justify-center p-0'
            onClick={() => handleStep(-CHAT_FONT_SCALE_STEP)}
            disabled={chatFontScale <= CHAT_FONT_SCALE_MIN + EPSILON}
          >
            -
          </Button>
          <Slider
            className='flex-1 min-w-180px font-scale-slider p-0 m-0'
            showTicks
            min={CHAT_FONT_SCALE_MIN}
            max={CHAT_FONT_SCALE_MAX}
            step={CHAT_FONT_SCALE_STEP}
            value={chatFontScale}
            onChange={handleSliderChange}
            marks={defaultMarks}
          />
          <Button
            size='mini'
            type='secondary'
            shape='circle'
            className='w-28px h-28px !min-w-28px flex items-center justify-center p-0'
            onClick={() => handleStep(CHAT_FONT_SCALE_STEP)}
            disabled={chatFontScale >= CHAT_FONT_SCALE_MAX - EPSILON}
          >
            +
          </Button>
        </div>
        <div className='flex items-center gap-10px ml-auto'>
          <span
            className='text-13px text-t-primary text-right min-w-56px'
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formattedValue}
          </span>
          <Button
            size='small'
            type='text'
            className='px-4px h-28px'
            onClick={handleReset}
            disabled={isResetDisabled}
            style={{
              color: isResetDisabled
                ? theme === 'dark'
                  ? 'rgba(230, 232, 236, 0.62)'
                  : 'rgba(78, 89, 105, 0.72)'
                : 'rgb(var(--primary-6))',
              opacity: 1,
            }}
          >
            {t('settings.fontSizeReset')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatFontSizeControl;
