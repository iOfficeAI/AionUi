/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseListItem } from './types';
import { Avatar } from '@arco-design/web-react';
import { Book } from '@icon-park/react';
import React from 'react';
import { isEmoji, resolveIconImageSrc } from './knowledgeBaseUtils';

type KnowledgeBaseAvatarProps = {
  knowledgeBase: KnowledgeBaseListItem;
  size?: number;
};

const KnowledgeBaseAvatar: React.FC<KnowledgeBaseAvatarProps> = ({ knowledgeBase, size = 32 }) => {
  const resolvedIcon = knowledgeBase.icon?.trim();
  const hasEmojiIcon = Boolean(resolvedIcon && isEmoji(resolvedIcon));
  const iconImage = resolveIconImageSrc(resolvedIcon);
  const iconSize = Math.floor(size * 0.5);
  const emojiSize = Math.floor(size * 0.6);

  return (
    <Avatar.Group size={size}>
      <Avatar className='border-none' shape='square' style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}>
        {iconImage ? (
          <img
            src={iconImage}
            alt=''
            className='h-full w-full rounded-inherit object-cover'
            style={{ display: 'block' }}
          />
        ) : hasEmojiIcon ? (
          <span style={{ fontSize: emojiSize }}>{resolvedIcon}</span>
        ) : (
          <Book theme='outline' size={iconSize} />
        )}
      </Avatar>
    </Avatar.Group>
  );
};

export default KnowledgeBaseAvatar;
