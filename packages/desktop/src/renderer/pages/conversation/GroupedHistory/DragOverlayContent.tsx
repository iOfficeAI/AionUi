/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { FolderClose, MessageOne } from '@icon-park/react';
import React from 'react';

import { isProjectConversation } from './utils/groupingHelpers';

type DragOverlayContentProps = {
  conversation?: TChatConversation;
};

const DragOverlayContent: React.FC<DragOverlayContentProps> = ({ conversation }) => {
  if (!conversation) return null;
  const Icon = isProjectConversation(conversation) ? FolderClose : MessageOne;

  return (
    <div
      className='flex items-center gap-10px px-12px py-8px rd-8px min-w-200px max-w-300px'
      style={{
        backgroundColor: 'var(--color-bg-1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid var(--color-border-2)',
        transform: 'scale(1.02)',
      }}
    >
      <Icon theme='outline' size='20' className='line-height-0 flex-shrink-0 text-t-secondary' />
      <div className='text-14px lh-24px text-t-primary truncate flex-1'>{conversation.name}</div>
    </div>
  );
};

export default DragOverlayContent;
