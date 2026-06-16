/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getJobAgentMeta } from '@/renderer/pages/cron/ScheduledTasksPage/jobAgentMeta';

describe('getJobAgentMeta', () => {
  it('prefers assistant catalog metadata for assistant-backed jobs', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            assistant_id: 'assistant-1',
            backend: 'codex',
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
      ]
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
            backend: 'codex',
            name: 'Codex 助手',
          },
        },
      }),
      []
    );

    expect(meta.name).toBe('Codex 助手');
    expect(meta.logo).toBeTruthy();
  });

  it('still resolves assistant metadata from legacy custom_agent_id rows', () => {
    const meta = getJobAgentMeta(
      cronJob({
        metadata: {
          agent_type: 'acp',
          agent_config: {
            custom_agent_id: 'assistant-1',
            backend: 'codex',
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
      ]
    );

    expect(meta).toEqual({
      name: '文件规划助手',
      emoji: '🤖',
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
    preset_agent_type: 'codex',
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
