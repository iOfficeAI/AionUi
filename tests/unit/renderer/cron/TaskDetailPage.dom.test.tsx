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
import type { TChatConversation } from '@/common/config/storage';

const getJobInvokeMock = vi.fn();
const runNowInvokeMock = vi.fn();
const removeJobInvokeMock = vi.fn();
const getConversationInvokeMock = vi.fn();
const removeConversationInvokeMock = vi.fn();
const updateConversationInvokeMock = vi.fn();
const navigateMock = vi.fn();
const { useCronJobConversationsMock } = vi.hoisted(() => ({
  useCronJobConversationsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// TaskDetailPage renders CreateTaskDialog, which now mounts through AionModal
// and reads ThemeContext for font scaling. Provide a minimal theme so it mounts
// without a full ThemeProvider (which pulls in IPC-backed theme loading).
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const Modal = Object.assign(actual.Modal, {
    confirm: vi.fn((config: { onOk?: () => unknown }) => {
      void config.onOk?.();
      return {
        close: vi.fn(),
        update: vi.fn(),
      };
    }),
  });
  return {
    ...actual,
    Modal,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
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
      removeJob: { invoke: (...args: unknown[]) => removeJobInvokeMock(...args) },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => getConversationInvokeMock(...args) },
      remove: { invoke: (...args: unknown[]) => removeConversationInvokeMock(...args) },
      update: { invoke: (...args: unknown[]) => updateConversationInvokeMock(...args) },
      listChanged: { on: () => vi.fn() },
    },
  },
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: assistants(),
  }),
}));

vi.mock('@renderer/pages/cron/useCronJobs', () => ({
  useCronJobConversations: (...args: unknown[]) => useCronJobConversationsMock(...args),
}));

vi.mock('@renderer/pages/cron/repairCronJobTimeZone', () => ({
  repairCronJobTimeZone: async (cronJob: ICronJob) => cronJob,
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
    removeJobInvokeMock.mockReset();
    removeJobInvokeMock.mockResolvedValue(undefined);
    getConversationInvokeMock.mockReset();
    getConversationInvokeMock.mockResolvedValue(null);
    removeConversationInvokeMock.mockReset();
    removeConversationInvokeMock.mockResolvedValue(true);
    updateConversationInvokeMock.mockReset();
    updateConversationInvokeMock.mockResolvedValue(true);
    navigateMock.mockReset();
    useCronJobConversationsMock.mockReset();
    useCronJobConversationsMock.mockReturnValue({ conversations: [] });
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

  it('renames run-now conversations with the execution date in new conversation mode', async () => {
    runNowInvokeMock.mockResolvedValue({ conversation_id: 'conv-run' });
    getConversationInvokeMock.mockResolvedValue(
      conversation({
        id: 'conv-run',
        name: '问好',
        created_at: Date.UTC(2026, 6, 1, 12, 0, 0),
        updated_at: Date.UTC(2026, 6, 1, 12, 0, 0),
        extra: {
          workspace: '/tmp/project',
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

    fireEvent.click(await screen.findByText('cron.detail.runNow'));

    await waitFor(() =>
      expect(updateConversationInvokeMock).toHaveBeenCalledWith({
        id: 'conv-run',
        updates: { name: '问好 01-07-26' },
      })
    );
    expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-run');
  });

  it('shows the latest execution error when hovering the failed status', async () => {
    getJobInvokeMock.mockResolvedValue(
      job({
        enabled: true,
        state: {
          last_status: 'error',
          last_error: 'ACP init failed: config file is invalid',
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

    const status = await screen.findByText('cron.status.error');

    expect(screen.queryByText('cron.lastError')).not.toBeInTheDocument();
    expect(screen.queryByText('ACP init failed: config file is invalid')).not.toBeInTheDocument();

    fireEvent.mouseEnter(status);

    expect(await screen.findByText('cron.lastError')).toBeInTheDocument();
    expect(screen.getByText('ACP init failed: config file is invalid')).toBeInTheDocument();
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

  it('opens the owning team from execution history when the conversation belongs to a team', async () => {
    useCronJobConversationsMock.mockReturnValue({
      conversations: [
        conversation({
          id: 'conv-team-member',
          name: 'Team member run',
          extra: {
            team_id: 'team-1',
          },
        }),
      ],
    });

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    fireEvent.click(await screen.findByText('Team member run'));

    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');
  });

  it('keeps opening non-team execution history conversations directly', async () => {
    useCronJobConversationsMock.mockReturnValue({
      conversations: [
        conversation({
          id: 'conv-standalone',
          name: 'Standalone run',
        }),
      ],
    });

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    fireEvent.click(await screen.findByText('Standalone run'));

    expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-standalone');
  });

  it('batch deletes execution history conversations without deleting the scheduled task', async () => {
    useCronJobConversationsMock.mockReturnValue({
      conversations: [
        conversation({ id: 'conv-run-1', name: 'Run 1' }),
        conversation({ id: 'conv-run-2', name: 'Run 2' }),
      ],
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/scheduled/job-1']}>
        <Routes>
          <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    fireEvent.click(await screen.findByText('conversation.history.batchManage'));
    fireEvent.click(screen.getByText('conversation.history.selectAll'));
    const batchDeleteButton = screen.getByText('conversation.history.batchDelete').closest('button');
    await waitFor(() => expect(batchDeleteButton).not.toBeDisabled());
    fireEvent.click(batchDeleteButton!);

    await waitFor(() => {
      expect(removeConversationInvokeMock).toHaveBeenCalledWith({ id: 'conv-run-1' });
      expect(removeConversationInvokeMock).toHaveBeenCalledWith({ id: 'conv-run-2' });
    });
    expect(removeJobInvokeMock).not.toHaveBeenCalled();
  });
});

function conversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-1',
    type: 'acp',
    name: 'Cron run',
    created_at: 1,
    updated_at: 1,
    extra: {},
    ...overrides,
  } as TChatConversation;
}

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
