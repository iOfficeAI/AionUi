import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usePresetAssistantInfoMock = vi.fn();
const acpChatMock = vi.fn(() => <div data-testid='mock-acp-chat' />);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: (props: unknown) => acpChatMock(props),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-aionrs-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-legacy-conversation' />,
}));

import TeamChatView from '@/renderer/pages/team/components/TeamChatView';

describe('TeamChatView', () => {
  beforeEach(() => {
    usePresetAssistantInfoMock.mockReset();
    acpChatMock.mockClear();
  });

  it('prefers preset assistant backend over legacy conversation extra backend', async () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Planner Assistant',
        logo: '📋',
        isEmoji: true,
        backend: 'codex',
      },
    });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            backend: 'claude',
            workspace: '/tmp',
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock).toHaveBeenCalled();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backend: 'codex',
      })
    );
  });

  it('prefers preset assistant name over legacy conversation extra agent_name', async () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Planner Assistant',
        logo: '📋',
        isEmoji: true,
        backend: 'codex',
      },
    });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            agent_name: 'Legacy Runtime Name',
            backend: 'claude',
            workspace: '/tmp',
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock).toHaveBeenCalled();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        agent_name: 'Planner Assistant',
      })
    );
  });
});
