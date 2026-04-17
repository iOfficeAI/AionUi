/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Robot } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export type AgentBadgeProps = {
  /** Agent backend type */
  backend?: string;
  /** Display name for the agent */
  agentName?: string;
  /** Custom agent logo (SVG path or emoji string) */
  agentLogo?: string;
  /** Whether the logo is an emoji */
  agentLogoIsEmoji?: boolean;
  /** Assistant ID — when provided, clicking the badge navigates to AssistantSettings */
  assistantId?: string;
};

/** Render agent logo from custom logo, backend logo, or fallback Robot icon */
export const AgentLogoIcon: React.FC<
  Pick<AgentBadgeProps, 'backend' | 'agentLogo' | 'agentLogoIsEmoji' | 'agentName'>
> = ({ backend, agentLogo, agentLogoIsEmoji, agentName }) => {
  const logoContent = (() => {
    if (agentLogo) {
      if (agentLogoIsEmoji) {
        return <span className='text-14px leading-none'>{agentLogo}</span>;
      }
      return (
        <img src={agentLogo} alt={`${agentName || 'agent'} logo`} className='block w-16px h-16px object-contain' />
      );
    }
    const logo = getAgentLogo(backend);
    if (logo) {
      return <img src={logo} alt={`${backend} logo`} className='block w-16px h-16px object-contain' />;
    }
    return <Robot theme='outline' size={16} fill={iconColors.primary} />;
  })();

  return (
    <span className='inline-flex w-16px h-16px items-center justify-center shrink-0 leading-none'>{logoContent}</span>
  );
};

/**
 * AgentBadge - Agent identity badge (logo + name)
 *
 * When `assistantId` is provided, clicking navigates to AssistantSettings editor.
 * Otherwise renders as a static display badge.
 */
const AgentBadge: React.FC<AgentBadgeProps> = ({ backend, agentName, agentLogo, agentLogoIsEmoji, assistantId }) => {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    if (!assistantId) return;
    navigate(`/settings/assistants?highlight=${encodeURIComponent(assistantId)}`);
  }, [assistantId, navigate]);

  return (
    <div
      className={`flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px] ${assistantId ? 'cursor-pointer hover:bg-3' : ''}`}
      data-testid='agent-badge'
      onClick={handleClick}
    >
      <AgentLogoIcon
        backend={backend}
        agentName={agentName}
        agentLogo={agentLogo}
        agentLogoIsEmoji={agentLogoIsEmoji}
      />
      <span className='text-sm text-t-primary'>{agentName || backend}</span>
    </div>
  );
};

export default AgentBadge;
