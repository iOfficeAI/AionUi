/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { iconColors } from '@/renderer/styles/colors';
import { Popover } from '@arco-design/web-react';
import { Lightning } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type ConversationSkillsIndicatorProps = {
  conversation: TChatConversation | undefined;
};

/**
 * Shows loaded skills for a conversation in a popover dropdown.
 * Reads from conversation.extra.loadedSkills which is persisted by the agent manager
 * when skills are actually discovered and loaded on first message.
 */
const ConversationSkillsIndicator: React.FC<ConversationSkillsIndicatorProps> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const loadedSkills = (conversation?.extra as { loadedSkills?: Array<{ name: string; description: string }> })
    ?.loadedSkills;

  if (!loadedSkills || loadedSkills.length === 0) return null;

  const handleSkillClick = (skillName: string) => {
    navigate(`/settings/capabilities?tab=skills&highlight=${encodeURIComponent(skillName)}`);
  };

  const content = (
    <div className='max-w-320px max-h-300px overflow-y-auto'>
      <div className='text-12px font-500 text-t-secondary mb-8px'>
        {t('conversation.skills.loaded')} ({loadedSkills.length})
      </div>
      <div className='flex flex-col gap-4px'>
        {loadedSkills.map((skill) => (
          <div
            key={skill.name}
            className='flex items-center gap-8px py-4px px-8px rounded-4px hover:bg-2 cursor-pointer text-13px text-t-primary truncate'
            onClick={() => handleSkillClick(skill.name)}
          >
            {skill.name}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger='click' position='br'>
      <span
        className='inline-flex items-center gap-4px rounded-full px-8px py-2px bg-2 cursor-pointer'
        data-testid='skills-indicator'
      >
        <Lightning theme='filled' size={14} fill={iconColors.primary} strokeWidth={2} style={{ lineHeight: 0 }} />
        <span className='text-13px text-t-primary lh-[1]' data-testid='skills-indicator-count'>
          {loadedSkills.length}
        </span>
      </span>
    </Popover>
  );
};

export default ConversationSkillsIndicator;
