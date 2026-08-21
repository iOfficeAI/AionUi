/**
 * AssistantAvatar — Renders an assistant's avatar with emoji, image, or fallback icon.
 */
import type { AssistantListItem } from './types';
import { Avatar } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import React from 'react';
import { isEmoji, resolveAvatarImageSrc } from './assistantUtils';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';

type AssistantAvatarProps = {
  assistant: AssistantListItem;
  imageFit?: 'contain' | 'cover';
  shape?: 'circle' | 'square';
  size?: number;
};

const AssistantAvatar: React.FC<AssistantAvatarProps> = ({
  assistant,
  imageFit = 'cover',
  shape = 'square',
  size = 32,
}) => {
  const resolvedAvatar = assistant.avatar?.trim();
  const hasEmojiAvatar = Boolean(resolvedAvatar && isEmoji(resolvedAvatar));
  const avatarImage = resolveAvatarImageSrc(resolvedAvatar);
  const iconSize = Math.floor(size * 0.5);
  const emojiSize = Math.floor(size * 0.6);

  return (
    <Avatar.Group size={size}>
      <Avatar className='border-none' shape={shape} style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}>
        {avatarImage ? (
          <ThemedLogo
            src={avatarImage}
            alt=''
            className={`rounded-inherit ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            // Arco Avatar forces color:var(--color-white); pin to theme text so
            // the currentColor mask stays visible in light mode too.
            style={{ display: 'block', width: size, height: size, color: 'var(--text-primary)' }}
          />
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
