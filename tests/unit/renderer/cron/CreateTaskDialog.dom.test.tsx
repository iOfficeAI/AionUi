/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

let currentAssistants: Assistant[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      addJob: { invoke: vi.fn() },
      createJob: { invoke: vi.fn() },
      updateJob: { invoke: vi.fn() },
    },
    conversation: {
      get: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/components/base/AionModal', () => ({
  __esModule: true,
  default: ({ visible, children, onOk }: { visible: boolean; children: React.ReactNode; onOk?: () => void }) =>
    visible ? (
      <div>
        {children}
        <button type='button' data-testid='modal-ok' onClick={onOk}>
          OK
        </button>
      </div>
    ) : null,
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: currentAssistants,
  }),
}));

vi.mock('@renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: [],
    getAvailableModels: () => [],
    formatModelLabel: (label: string) => label,
  }),
}));

vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='guid-model-selector' />,
}));

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: () => <div data-testid='workspace-folder-select' />,
}));

vi.mock('@renderer/pages/cron/cronUtils', () => ({
  createCronSchedule: () => ({
    kind: 'cron',
    expr: '0 10 * * *',
    timezone: 'Asia/Shanghai',
    description: 'daily',
  }),
}));

vi.mock('@renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationCreateErrorMessage: () => 'error',
}));

vi.mock('@renderer/utils/model/assistantAvatar', () => ({
  resolveAssistantAvatar: () => ({ kind: 'emoji', value: '🤖' }),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
}));

vi.mock('@renderer/utils/model/agentTypeSupportPolicy', () => ({
  resolveSupportedConversationType: () => 'acp',
}));

vi.mock('@renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig', () => ({
  resolveCronAgentConfig: vi.fn(() => ({
    agent_config: {
      assistant_id: 'assistant-1',
      name: '问好助手',
      mode: 'default',
    },
  })),
}));

import { ipcBridge } from '@/common';
import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';

describe('CreateTaskDialog', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentAssistants = assistants();
    vi.mocked(ipcBridge.cron.addJob.invoke).mockResolvedValue(job());
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(job());
    vi.mocked(ipcBridge.cron.createJob.invoke).mockResolvedValue(job());
    vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(new Error('not found'));
  });

  it('does not render the task description field', async () => {
    render(<CreateTaskDialog visible onClose={() => {}} />);

    expect(await screen.findByText('cron.page.form.name')).toBeInTheDocument();
    expect(screen.queryByText('cron.page.form.description')).not.toBeInTheDocument();
  });

  it('does not reset edited prompt text when the assistant catalog refreshes in edit mode', async () => {
    const user = userEvent.setup();
    const editJob = job();

    const { rerender } = render(<CreateTaskDialog visible onClose={() => {}} editJob={editJob} />);

    const promptInput = (await screen.findByDisplayValue('original prompt')) as HTMLTextAreaElement;
    await user.clear(promptInput);
    await user.type(promptInput, 'edited prompt');
    expect(promptInput).toHaveValue('edited prompt');

    currentAssistants = [...assistants(), bareAssistant()];
    rerender(<CreateTaskDialog visible onClose={() => {}} editJob={editJob} />);

    await waitFor(() => expect(screen.getByDisplayValue('edited prompt')).toBeInTheDocument());
  });

  it('shows the current task assistant by default in edit mode', async () => {
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    expect(await screen.findByText('问好助手')).toBeInTheDocument();
  });

  it('does not infer assistant identity from legacy backend fields after migration ownership moved server-side', async () => {
    currentAssistants = [bareAssistant(), ...assistants()];

    render(<CreateTaskDialog visible onClose={() => {}} editJob={legacyJobWithoutAssistantId()} />);

    expect(await screen.findByDisplayValue('original prompt')).toBeInTheDocument();
    expect(screen.queryByText('代码助手')).not.toBeInTheDocument();
    expect(screen.queryByText('Codex')).not.toBeInTheDocument();
    expect(screen.queryByText('问好助手')).not.toBeInTheDocument();
  });

  it('locks assistant selection when editing an ongoing conversation task', async () => {
    render(<CreateTaskDialog visible onClose={() => {}} editJob={ongoingConversationJob()} />);

    const assistantSelect = await screen.findByTestId('cron-assistant-select');
    expect(assistantSelect).toHaveClass('arco-select-disabled');
    expect(screen.getByText('cron.page.form.assistantLockedExistingConversation')).toBeInTheDocument();
  });

  it('keeps assistant selection locked when an ongoing conversation task is temporarily switched to new conversation', async () => {
    const user = userEvent.setup();

    render(<CreateTaskDialog visible onClose={() => {}} editJob={ongoingConversationJob()} />);

    await user.click(await screen.findByText('cron.page.form.newConversation'));

    const assistantSelect = screen.getByTestId('cron-assistant-select');
    expect(assistantSelect).toHaveClass('arco-select-disabled');
    expect(screen.getByText('cron.page.form.assistantLockedExistingConversation')).toBeInTheDocument();
  });

  it('does not send agent config when updating an ongoing conversation task', async () => {
    const user = userEvent.setup();

    render(<CreateTaskDialog visible onClose={() => {}} editJob={ongoingConversationJob()} />);

    await user.click(await screen.findByTestId('modal-ok'));

    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    expect(resolveCronAgentConfig).not.toHaveBeenCalled();
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.metadata).not.toHaveProperty('agent_config');
  });

  it('locks execution mode while resolving team ownership', async () => {
    let resolveConversation: (value: TChatConversation) => void = () => {};
    vi.mocked(ipcBridge.conversation.get.invoke).mockReturnValue(
      new Promise((resolve) => {
        resolveConversation = resolve;
      })
    );

    render(<CreateTaskDialog visible onClose={() => {}} editJob={teamOwnedJob()} />);

    await waitFor(() =>
      expect(ipcBridge.conversation.get.invoke).toHaveBeenCalledWith({
        id: 'team-conv-1',
      })
    );

    expect(executionModeInputs()).toHaveLength(2);
    expect(executionModeInputs().every((input) => input.disabled)).toBe(true);

    await act(async () => {
      resolveConversation({
        id: 'team-conv-1',
        type: 'acp',
        name: 'Standalone conversation',
        created_at: 1,
        updated_at: 1,
        extra: {},
      });
    });
  });

  it('locks execution mode and assistant when editing a team-owned task', async () => {
    const user = userEvent.setup();
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      id: 'team-conv-1',
      type: 'acp',
      name: 'Team member conversation',
      created_at: 1,
      updated_at: 1,
      extra: {
        teamId: 'team-1',
      },
    });

    render(<CreateTaskDialog visible onClose={() => {}} editJob={teamOwnedJob()} />);

    await waitFor(() =>
      expect(ipcBridge.conversation.get.invoke).toHaveBeenCalledWith({
        id: 'team-conv-1',
      })
    );

    const assistantSelect = await screen.findByTestId('cron-assistant-select');
    expect(assistantSelect).toHaveClass('arco-select-disabled');
    expect(executionModeInputs()).toHaveLength(2);
    expect(executionModeInputs().every((input) => input.disabled)).toBe(true);
    expect(screen.getByText('cron.page.form.teamTaskExecutionModeLockedReason')).toBeInTheDocument();

    await user.click(await screen.findByText('cron.page.form.newConversation'));
    await user.click(screen.getByTestId('modal-ok'));

    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    expect(resolveCronAgentConfig).not.toHaveBeenCalled();
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.target?.execution_mode).toBe('existing');
    expect(updates.metadata).not.toHaveProperty('agent_config');
  });

  it('passes the selected assistant id when manually creating a task', async () => {
    const user = userEvent.setup();

    render(<CreateTaskDialog visible onClose={() => {}} />);

    await user.type(await screen.findByPlaceholderText('cron.page.form.namePlaceholder'), 'manual task');
    await user.type(screen.getByPlaceholderText('cron.page.form.promptPlaceholder'), 'Say hello');

    await user.click(screen.getByTestId('cron-assistant-select'));
    const assistantOption = await waitFor(() => {
      const option = document.querySelector('.arco-select-option');
      if (!option) throw new Error('assistant option not found');
      return option;
    });
    fireEvent.click(assistantOption);
    await user.click(screen.getByTestId('modal-ok'));

    await waitFor(() => expect(resolveCronAgentConfig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(resolveCronAgentConfig).mock.calls[0][0]).toMatchObject({
      agentValue: 'assistant-1',
    });
    await waitFor(() => expect(ipcBridge.cron.addJob.invoke).toHaveBeenCalledTimes(1));
  });
});

function job(): ICronJob {
  return {
    id: 'job-1',
    name: '问好',
    description: '描述',
    enabled: true,
    schedule: {
      kind: 'cron',
      expr: '0 10 * * *',
      timezone: 'Asia/Shanghai',
      description: 'daily',
    },
    metadata: {
      created_at_ms: 1,
      updated_at_ms: 1,
      next_run_at_ms: 1,
      status: 'paused',
      agent_type: 'acp',
      agent_config: {
        assistant_id: 'assistant-1',
        backend: 'codex',
        name: '问好助手',
        preset_agent_type: 'codex',
        is_preset: true,
      },
    },
    target: {
      execution_mode: 'new_conversation',
      payload: {
        text: 'original prompt',
      },
    },
    state: {
      next_run_at_ms: 1,
      run_count: 0,
      retry_count: 0,
      max_retries: 0,
    },
  } as ICronJob;
}

function legacyJobWithoutAssistantId(): ICronJob {
  return {
    ...job(),
    metadata: {
      ...job().metadata,
      agent_config: {
        custom_agent_id: 'assistant-1',
        backend: 'codex',
        name: 'Legacy Cron Assistant',
        preset_agent_type: 'codex',
        is_preset: false,
      },
    },
  } as ICronJob;
}

function ongoingConversationJob(): ICronJob {
  return {
    ...job(),
    target: {
      ...job().target,
      execution_mode: 'existing',
    },
  } as ICronJob;
}

function teamOwnedJob(): ICronJob {
  return {
    ...ongoingConversationJob(),
    metadata: {
      ...ongoingConversationJob().metadata,
      conversation_id: 'team-conv-1',
    },
  } as ICronJob;
}

function executionModeInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('.arco-radio input[type="radio"]'));
}

function assistants(): Assistant[] {
  return [
    {
      id: 'assistant-1',
      source: 'user',
      name: '问好助手',
      name_i18n: {},
      description_i18n: {},
      avatar: '🤖',
      enabled: true,
      sort_order: 0,
      agent_id: 'agent-codex',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    } as Assistant,
  ];
}

function bareAssistant(): Assistant {
  return {
    id: 'bare-codex',
    source: 'generated',
    name: 'Codex',
    name_i18n: { 'zh-CN': '代码助手' },
    description_i18n: {},
    avatar: 'codex.svg',
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
  } as Assistant;
}
