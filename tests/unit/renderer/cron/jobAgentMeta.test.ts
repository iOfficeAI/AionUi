/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getJobAgentMeta } from '@/renderer/pages/cron/ScheduledTasksPage/jobAgentMeta';

const LOGOS = { codex: '/api/assets/logos/tools/coding/codex.svg' };

describe('getJobAgentMeta', () => {
  it('prefers assistant catalog metadata for assistant-backed jobs', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            assistant_id: 'assistant-1',
            name: 'Legacy name',
          },
        },
      }),
      [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          avatar: '🤖',
        }),
      ],
      LOGOS
    );

    expect(meta).toEqual({
      name: '文件规划助手',
      emoji: '🤖',
    });
  });

  it('falls back to cron payload metadata for legacy jobs without assistant identity', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            name: 'Codex 助手',
          },
        },
      }),
      [],
      LOGOS
    );

    expect(meta.name).toBe('Codex 助手');
    expect(meta.logo).toBeNull();
  });

  it('falls back to cron payload metadata for legacy custom_agent_id rows without assistant_id', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            custom_agent_id: 'assistant-1',
            name: 'Legacy name',
          },
        },
      }),
      [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          avatar: '🤖',
        }),
      ],
      LOGOS
    );

    expect(meta.name).toBe('Legacy name');
    expect(meta.logo).toBeNull();
  });

  it('uses assistant fallback when assistant_id is present but the assistant is missing', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            assistant_id: 'missing-assistant',
            name: 'Legacy name',
          },
        },
      }),
      [],
      LOGOS
    );

    expect(meta).toEqual({
      name: 'Legacy name',
      assistantFallback: true,
    });
  });
});

function cronJob(overrides: Partial<ICronJob>): ICronJob {
  return {
    id: 'job-1',
    name: 'Job',
    description: '',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 * * * *' },
    timezone: 'UTC',
    target: { execution_mode: 'new_conversation', payload: { text: 'hi' } },
    state: {},
    metadata: {
      agent_type: 'acp',
      agent_config: {},
      team_id: undefined,
      task_type: 'conversation',
    },
    ...overrides,
  };
}

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name'>): Assistant {
  return {
    id: overrides.id,
    source: 'builtin',
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 1,
    agent_id: 'agent-codex',
    agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    ...overrides,
  };
}
