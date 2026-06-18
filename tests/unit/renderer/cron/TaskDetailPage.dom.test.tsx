/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const getJobInvokeMock = vi.fn();
const runNowInvokeMock = vi.fn();
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
      runNow: { invoke: (...args: unknown[]) => runNowInvokeMock(...args) },
      removeJob: { invoke: vi.fn() },
    },
    conversation: {
      get: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
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
    runNowInvokeMock.mockReset();
    runNowInvokeMock.mockResolvedValue({});
    navigateMock.mockReset();
  });

  it('triggers run-now only once when the button is clicked twice in quick succession', async () => {
    // Keep the in-flight run pending so the button stays in its running state
    // across both clicks. The second click must be blocked by the re-entry
    // guard rather than firing another backend invocation.
    runNowInvokeMock.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    const runButton = await screen.findByText('cron.detail.runNow');
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(runNowInvokeMock).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText('cron.detail.assistant')).toBeInTheDocument();
    expect(screen.queryByText('cron.detail.agent')).not.toBeInTheDocument();

    const assistantAvatar = screen.getByAltText('问好助手');
    expect(assistantAvatar).toHaveAttribute('src', 'data:image/svg+xml;base64,assistant-avatar');
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument();
  });

  it('still renders assistant identity when legacy agent_type is absent but assistant_id exists', async () => {
    getJobInvokeMock.mockResolvedValue(
      job({
        metadata: {
          agent_type: '',
        },
      })
    );

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    expect(await screen.findByText('问好助手')).toBeInTheDocument();
    expect(screen.getByText('cron.detail.assistant')).toBeInTheDocument();
    expect(screen.getByAltText('问好助手')).toHaveAttribute('src', 'data:image/svg+xml;base64,assistant-avatar');
  });

  it('still renders assistant identity for legacy jobs that only stored custom_agent_id', async () => {
    getJobInvokeMock.mockResolvedValue(
      job({
        metadata: {
          agent_config: {
            backend: 'codex',
            name: '问好助手',
            is_preset: true,
            custom_agent_id: 'assistant-1',
            preset_agent_type: 'codex',
          },
        },
      })
    );

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    expect(await screen.findByText('问好助手')).toBeInTheDocument();
    expect(screen.getByText('cron.detail.assistant')).toBeInTheDocument();
    expect(screen.getByAltText('问好助手')).toHaveAttribute('src', 'data:image/svg+xml;base64,assistant-avatar');
  });
});

function job(overrides?: Partial<ICronJob>): ICronJob {
  const metadataOverrides = overrides?.metadata;
  const { agent_config: agentConfigOverrides, ...metadataRestOverrides } = metadataOverrides ?? {};
  const targetOverrides = overrides?.target;
  const { payload: payloadOverrides, ...targetRestOverrides } = targetOverrides ?? {};

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
    ...overrides,
    metadata: {
      created_at_ms: 1,
      updated_at_ms: 1,
      next_run_at_ms: 1,
      last_run_at_ms: undefined,
      status: 'paused',
      agent_type: 'acp',
      ...metadataRestOverrides,
      agent_config: {
        backend: 'codex',
        name: '问好助手',
        is_preset: true,
        assistant_id: 'assistant-1',
        preset_agent_type: 'codex',
        ...agentConfigOverrides,
      },
    },
    target: {
      execution_mode: 'new_conversation',
      ...targetRestOverrides,
      payload: {
        text: '每天10点向我问好',
        ...payloadOverrides,
      },
    },
    state: {
      next_run_at_ms: 1,
      last_run_at_ms: undefined,
      run_count: 0,
      retry_count: 0,
      max_retries: 0,
      ...overrides?.state,
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
