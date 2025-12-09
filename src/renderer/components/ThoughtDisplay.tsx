/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useThemeContext } from '@/renderer/context/ThemeContext';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought: ThoughtData;
  style?: 'default' | 'compact';
}

// 背景渐变常量 Background gradient constants
const GRADIENT_DARK = 'linear-gradient(135deg, #464767 0%, #323232 100%)';
const GRADIENT_LIGHT = 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)';

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({ thought, style = 'default' }) => {
  const { theme } = useThemeContext();

  // 根据主题和样式计算最终样式 Calculate final style based on theme and style prop
  const containerStyle = useMemo(() => {
    const background = theme === 'dark' ? GRADIENT_DARK : GRADIENT_LIGHT;

    if (style === 'compact') {
      return {
        background,
        marginBottom: '8px',
        maxHeight: '100px',
        overflow: 'scroll' as const,
      };
    }

    return {
      background,
      transform: 'translateY(36px)',
    };
  }, [theme, style]);

  if (!thought?.subject) {
    return null;
  }

  return (
    <div className='px-10px py-10px rd-20px text-14px pb-40px lh-20px text-t-primary' style={containerStyle}>
      <Tag color='arcoblue' size='small' className='float-left mr-4px'>
        {thought.subject}
      </Tag>
      {thought.description}
    </div>
  );
};

export default ThoughtDisplay;
