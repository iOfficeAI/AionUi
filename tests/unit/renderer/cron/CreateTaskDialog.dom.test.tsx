/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';

let currentAssistants: Assistant[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      createJob: { invoke: vi.fn() },
      updateJob: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/components/base/ModalWrapper', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <div>{children}</div> : null,
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
  resolveCronAgentConfig: () => ({
    assistant_id: 'assistant-1',
    backend: 'codex',
    model_id: undefined,
    workspace: undefined,
    config_options: undefined,
  }),
}));

import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';

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
    currentAssistants = assistants();
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

  it('does not infer assistant identity from legacy backend fields after migration ownership moved server-side', async () => {
    currentAssistants = [bareAssistant(), ...assistants()];

    render(<CreateTaskDialog visible onClose={() => {}} editJob={legacyJobWithoutAssistantId()} />);

    expect(await screen.findByDisplayValue('original prompt')).toBeInTheDocument();
    expect(screen.queryByText('代码助手')).not.toBeInTheDocument();
    expect(screen.queryByText('Codex')).not.toBeInTheDocument();
    expect(screen.queryByText('问好助手')).not.toBeInTheDocument();
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
