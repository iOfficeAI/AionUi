/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import coworkSvg from '@/renderer/assets/cowork.svg';
import { iconColors } from '@/renderer/theme/colors';
import { getAgentLogo } from '@/renderer/utils/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Robot } from '@icon-park/react';
import React from 'react';
import type { AcpBackendAll } from '@/types/acpTypes';

type ChannelAssistantLike = {
  backend: AcpBackendAll;
  name: string;
  avatar?: string;
  presetAgentType?: string;
};

interface ChannelAssistantOptionContentProps {
  assistant: ChannelAssistantLike;
  nameClassName?: string;
}

const IMAGE_AVATAR_RE = /\.(svg|png|jpe?g|webp|gif)$/i;
const URL_AVATAR_RE = /^(https?:|aion-asset:\/\/|file:\/\/|data:|\/)/i;
const BUILTIN_AVATAR_MAP: Record<string, string> = {
  'cowork.svg': coworkSvg,
};

function resolveAssistantIcon(assistant: ChannelAssistantLike): React.ReactNode {
  const rawAvatar = assistant.avatar?.trim();
  if (rawAvatar) {
    const builtinAvatar = BUILTIN_AVATAR_MAP[rawAvatar];
    if (builtinAvatar) {
      return <img src={builtinAvatar} alt={`${assistant.name} avatar`} className='block h-16px w-16px object-contain' />;
    }

    const resolvedAvatar = resolveExtensionAssetUrl(rawAvatar) || rawAvatar;
    const isImageAvatar = IMAGE_AVATAR_RE.test(resolvedAvatar) || URL_AVATAR_RE.test(resolvedAvatar);
    if (isImageAvatar) {
      return <img src={resolvedAvatar} alt={`${assistant.name} avatar`} className='block h-16px w-16px object-contain' />;
    }

    if (!rawAvatar.endsWith('.svg')) {
      return <span className='text-14px leading-none'>{rawAvatar}</span>;
    }
  }

  const logoKey = assistant.presetAgentType || (assistant.backend !== 'custom' ? assistant.backend : undefined);
  const logo = getAgentLogo(logoKey);
  if (logo) {
    return <img src={logo} alt={`${assistant.name} logo`} className='block h-16px w-16px object-contain' />;
  }

  return <Robot theme='outline' size={16} fill={iconColors.primary} />;
}

const ChannelAssistantOptionContent: React.FC<ChannelAssistantOptionContentProps> = ({ assistant, nameClassName }) => {
  return (
    <span className='flex min-w-0 items-center gap-8px'>
      <span className='inline-flex h-16px w-16px shrink-0 items-center justify-center leading-none'>{resolveAssistantIcon(assistant)}</span>
      <span className={nameClassName || 'truncate'}>{assistant.name}</span>
    </span>
  );
};

export default ChannelAssistantOptionContent;
