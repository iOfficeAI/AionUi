/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SkillUsedByStack — compact overlapping avatar stack shown on a skill card
 * to surface which assistants have the skill attached. Mirrors the agent
 * page's BoundAssistantStack, capped with a "+N" pill.
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import AssistantAvatar from '@/renderer/pages/settings/AssistantSettings/AssistantAvatar';
import { Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Assistants that have this skill attached (enabled or custom list).
 * The live API may omit the skill arrays on some assistants, so guard both.
 */
export const getAssistantsUsingSkill = (skillName: string, assistants: Assistant[]): Assistant[] =>
  assistants.filter(
    (a) => (a.enabled_skills ?? []).includes(skillName) || (a.custom_skill_names ?? []).includes(skillName)
  );

const SkillUsedByStack: React.FC<{ assistants: Assistant[]; max?: number }> = ({ assistants, max = 4 }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  if (assistants.length === 0) return null;

  const shown = assistants.slice(0, max);
  const overflow = assistants.length - shown.length;
  const names = assistants.map((a) => a.name_i18n?.[localeKey] || a.name).join('、');

  return (
    <Tooltip
      content={
        t('settings.skillsHub.usedByCount', {
          count: assistants.length,
          defaultValue: `Used by ${assistants.length} assistant(s)`,
        }) +
        '：' +
        names
      }
    >
      <div className='flex items-center' data-testid='skill-used-by-stack'>
        {shown.map((assistant, index) => (
          <div
            key={assistant.id}
            className='overflow-hidden rounded-full border-2 border-solid border-bg-2'
            style={{ marginLeft: index === 0 ? 0 : -7, zIndex: shown.length - index }}
          >
            <AssistantAvatar assistant={assistant} size={22} />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className='flex items-center justify-center rounded-full border-2 border-solid border-bg-2 bg-fill-3 text-9px font-600 text-t-secondary'
            style={{ width: 22, height: 22, marginLeft: -7 }}
          >
            +{overflow}
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default SkillUsedByStack;
