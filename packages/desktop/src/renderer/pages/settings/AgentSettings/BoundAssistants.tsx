/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import AssistantAvatar from '@/renderer/pages/settings/AssistantSettings/AssistantAvatar';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { Right } from '@icon-park/react';
import { Tooltip, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

const BOUND_ASSISTANTS_SWR_KEY = 'agents.boundAssistants.list';

/**
 * Assistants bound to this managed agent. `agent_id` is the backend
 * `agent_metadata.id`; runtime backend labels are intentionally ignored here
 * because multiple agent rows can share a backend.
 */
export const getBoundAssistants = (agent: Pick<ManagedAgent, 'id'>, assistants: Assistant[]): Assistant[] =>
  assistants.filter((assistant) => assistant.agent_id === agent.id);

/**
 * Read-only assistant catalog for the Agent settings surface. Shares a single
 * SWR cache so the list page and every repair page reuse one fetch.
 */
export const useAssistantsForAgents = (): { assistants: Assistant[]; isLoading: boolean } => {
  const { data, isLoading } = useSWR<Assistant[]>(BOUND_ASSISTANTS_SWR_KEY, () => ipcBridge.assistants.list.invoke());
  return { assistants: data ?? [], isLoading };
};

const assistantLabel = (assistant: Assistant, localeKey: string): string =>
  assistant.name_i18n?.[localeKey] || assistant.name;

/**
 * Compact overlapping avatar stack shown on an agent list row to surface which
 * assistants depend on it. Caps at `max` avatars and renders a "+N" pill for
 * the remainder so a high-fan-out engine (e.g. aionrs) stays readable.
 */
export const BoundAssistantStack: React.FC<{ assistants: Assistant[]; max?: number }> = ({ assistants, max = 4 }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  if (assistants.length === 0) return null;

  const shown = assistants.slice(0, max);
  const overflow = assistants.length - shown.length;
  const tooltip = assistants.map((a) => assistantLabel(a, localeKey)).join('、');

  return (
    <Tooltip
      content={t('settings.agentManagement.boundAssistantsCount', { count: assistants.length }) + '：' + tooltip}
    >
      <div className='flex items-center' data-testid='agent-bound-stack'>
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

/**
 * Full bound-assistant list for the agent configuration page. Each row shows
 * avatar + name and navigates to that assistant's detail/editor on click.
 */
export const BoundAssistantList: React.FC<{
  assistants: Assistant[];
  onOpenAssistant: (assistantId: string) => void;
}> = ({ assistants, onOpenAssistant }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);

  if (assistants.length === 0) {
    return (
      <div
        className='rounded-8px bg-aou-2 px-12px py-16px text-center text-12px text-t-tertiary'
        data-testid='agent-bound-empty'
      >
        {t('settings.agentManagement.boundAssistantsEmpty')}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4px' data-testid='agent-bound-list'>
      {assistants.map((assistant) => (
        <div
          key={assistant.id}
          className='group flex cursor-pointer items-center gap-10px rounded-8px px-12px py-10px transition-colors hover:bg-fill-1'
          data-testid={`agent-bound-row-${assistant.id}`}
          onClick={() => onOpenAssistant(assistant.id)}
        >
          <AssistantAvatar assistant={assistant} size={26} />
          <Typography.Text className='flex-1 truncate text-13px font-500 text-t-primary'>
            {assistantLabel(assistant, localeKey)}
          </Typography.Text>
          <span className='flex items-center gap-2px text-12px text-t-tertiary group-hover:text-t-secondary'>
            {t('settings.agentManagement.viewAssistant')}
            <Right size={13} fill='currentColor' />
          </span>
        </div>
      ))}
    </div>
  );
};
