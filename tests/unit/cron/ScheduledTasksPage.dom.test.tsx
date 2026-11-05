/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const useAllCronJobsMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', async (importActual) => {
  const actual = await importActual<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@renderer/pages/cron/useCronJobs', () => ({ useAllCronJobs: useAllCronJobsMock }));
vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({ presetAssistants: [] }),
}));
vi.mock('@renderer/utils/model/agentLogo', () => ({
  resolveAgentLogo: () => null,
  useAgentLogos: () => ({}),
}));
vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({ __esModule: true, default: () => null }));
vi.mock('@/renderer/components/base', () => ({ AionSearchInput: () => null }));
vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({ __esModule: true, default: () => null }));
vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({ __esModule: true, default: () => null }));
vi.mock('@/common/config/configService', () => ({ configService: { get: vi.fn(), setLocal: vi.fn() } }));
vi.mock('@/common/adapter/ipcBridge', () => ({ systemSettings: { setKeepAwake: { invoke: vi.fn() } } }));

import ScheduledTasksPage from '@/renderer/pages/cron/ScheduledTasksPage';

const failedJob: ICronJob = {
  id: 'failed-job',
  name: 'Daily report',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
  target: { payload: { kind: 'message', text: 'Generate the daily report' } },
  metadata: {
    conversation_id: 'conversation-1',
    agent_type: 'aionrs',
    created_by: 'user',
    created_at: 0,
    updated_at: 0,
  },
  state: {
    last_status: 'error',
    last_error: 'network unavailable',
    run_count: 1,
    retry_count: 0,
    max_retries: 0,
    queue_enabled: false,
  },
};

describe('ScheduledTasksPage error state', () => {
  it('renders a failed task with a stable DOM tooltip anchor', () => {
    useAllCronJobsMock.mockReturnValue({
      jobs: [failedJob],
      loading: false,
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ScheduledTasksPage />
      </MemoryRouter>
    );

    const errorIcon = screen.getByLabelText('cron.lastError：network unavailable');
    expect(errorIcon.parentElement?.tagName).toBe('SPAN');
  });
});
