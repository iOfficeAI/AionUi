/**
 * AssistantAvatar — Renders an assistant's avatar with emoji, image, or fallback icon.
 */
import type { AssistantListItem } from './types';
import { Avatar } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import React from 'react';
import { isEmoji, resolveAvatarImageSrc } from './assistantUtils';

type AssistantAvatarProps = {
  assistant: AssistantListItem;
  size?: number;
  avatarImageMap: Record<string, string>;
};

const AssistantAvatar: React.FC<AssistantAvatarProps> = ({ assistant, size = 32, avatarImageMap }) => {
  const resolvedAvatar = assistant.avatar?.trim();
  const hasEmojiAvatar = Boolean(resolvedAvatar && isEmoji(resolvedAvatar));
  const avatarImage = resolveAvatarImageSrc(resolvedAvatar, avatarImageMap);
  const iconSize = Math.floor(size * 0.5);
  const emojiSize = Math.floor(size * 0.6);

  return (
    <Avatar.Group size={size}>
      <Avatar className='border-none' shape='square' style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}>
        {avatarImage ? (
          <img src={avatarImage} alt='' width={emojiSize} height={emojiSize} style={{ objectFit: 'contain' }} />
        ) : hasEmojiAvatar ? (
          <span style={{ fontSize: emojiSize }}>{resolvedAvatar}</span>
        ) : (
          <Robot theme='outline' size={iconSize} />
        )}
      </Avatar>
    </Avatar.Group>
  );
};

export default AssistantAvatar;
