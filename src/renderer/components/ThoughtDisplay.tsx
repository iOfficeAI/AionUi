/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag } from '@arco-design/web-react';
import React from 'react';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought: ThoughtData;
  style?: 'default' | 'compact';
}

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({ thought, style = 'default' }) => {
  if (!thought.subject) {
    return null;
  }

  const baseStyle = {
    background: 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)',
  };

  const defaultStyle = {
    ...baseStyle,
    transform: 'translateY(36px)',
  };

  const compactStyle = {
    ...baseStyle,
    marginBottom: '-36px',
    maxHeight: '100px',
    overflow: 'scroll' as const,
  };

  return (
    <div
      className='px-10px py-10px rd-20px text-14px pb-40px lh-20px color-#86909C'
      style={{
        ...(style === 'compact' ? compactStyle : defaultStyle),
        ...(style === 'compact' && { marginBottom: '8px' }),
      }}
    >
      <Tag color='arcoblue' size='small' className='float-left mr-4px'>
        {thought.subject}
      </Tag>
      {thought.description}
    </div>
  );
};

export default ThoughtDisplay;
