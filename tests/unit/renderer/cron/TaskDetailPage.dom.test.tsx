/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const getJobInvokeMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: (...args: unknown[]) => getJobInvokeMock(...args) },
      onJobUpdated: { on: () => vi.fn() },
      onJobExecuted: { on: () => vi.fn() },
      updateJob: { invoke: vi.fn() },
      runNow: { invoke: vi.fn() },
      removeJob: { invoke: vi.fn() },
    },
    conversation: {
      get: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [
      {
        id: 'codex-runtime',
        name: 'Codex CLI',
        backend: 'codex',
        agent_type: 'acp',
        icon: 'codex.svg',
      },
    ],
    presetAssistants: assistants(),
  }),
}));

vi.mock('@renderer/pages/cron/useCronJobs', () => ({
  useCronJobConversations: () => ({ conversations: [] }),
}));

vi.mock('@renderer/pages/cron/repairCronJobTimeZone', () => ({
  repairCronJobTimeZone: async (job: ICronJob) => job,
}));

vi.mock('@renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationRuntimeWorkspaceErrorMessage: (error: unknown) => String(error),
}));

import TaskDetailPage from '@/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage';

describe('TaskDetailPage', () => {
  beforeEach(() => {
    getJobInvokeMock.mockReset();
    getJobInvokeMock.mockResolvedValue(job());
    navigateMock.mockReset();
  });

  it('renders preset assistant identity instead of backing runtime identity', async () => {
    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    expect(await screen.findByText('问好助手')).toBeInTheDocument();

    const assistantAvatar = screen.getByAltText('问好助手');
    expect(assistantAvatar).toHaveAttribute('src', 'data:image/svg+xml;base64,assistant-avatar');
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument();
  });
});

function job(): ICronJob {
  return {
    id: 'job-1',
    name: '问好',
    description: '想我问好',
    enabled: false,
    schedule: {
      kind: 'cron',
      expr: '0 10 * * *',
      timezone: 'Asia/Shanghai',
      description: '每天10点向我问好',
    },
    target: {
      execution_mode: 'new_conversation',
      payload: { text: '每天10点向我问好' },
    },
    metadata: {
      created_at_ms: 1,
      updated_at_ms: 1,
      next_run_at_ms: 1,
      last_run_at_ms: undefined,
      status: 'paused',
      agent_type: 'acp',
      agent_config: {
        backend: 'codex',
        name: '问好助手',
        is_preset: true,
        custom_agent_id: 'assistant-1',
        preset_agent_type: 'codex',
      },
    },
    state: {
      next_run_at_ms: 1,
      last_run_at_ms: undefined,
      run_count: 0,
      retry_count: 0,
      max_retries: 0,
    },
  } as ICronJob;
}

function assistants(): Assistant[] {
  return [
    {
      id: 'assistant-1',
      source: 'user',
      name: '问好助手',
      name_i18n: {},
      description_i18n: {},
      avatar: 'data:image/svg+xml;base64,assistant-avatar',
      enabled: true,
      sort_order: 0,
      preset_agent_type: 'codex',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    },
  ];
}
