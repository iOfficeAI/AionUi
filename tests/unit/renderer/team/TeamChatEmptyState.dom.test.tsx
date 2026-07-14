import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSWRMock = vi.fn();
const usePresetAssistantInfoMock = vi.fn();
const getConversationOrNullMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: (...args: unknown[]) => useSWRMock(...args),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
  resolveAgentAvatar: () => ({ kind: 'fallback' }),
}));

vi.mock('@renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (value: string | undefined) => value,
}));

import TeamChatEmptyState from '@/renderer/pages/team/components/TeamChatEmptyState';

describe('TeamChatEmptyState', () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    usePresetAssistantInfoMock.mockReset();
    getConversationOrNullMock.mockReset();
  });

  it('prefers assistant props over legacy runtime extra metadata when preset info is unavailable', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Team - Legacy Worker',
        extra: {
          team_id: 'team-1',
          agent_name: 'Legacy Runtime Name',
          backend: 'claude',
        },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatEmptyState conversation_id='conv-1' assistant_name='Assistant Runtime Name' assistant_backend='aionrs' />
    );

    expect(screen.getByText('Assistant Runtime Name')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Runtime Name')).not.toBeInTheDocument();
  });

  it('falls back to legacy runtime metadata when assistant props are absent', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Team - Legacy Worker',
        extra: {
          team_id: 'team-1',
          agent_name: 'Legacy Runtime Name',
          backend: 'claude',
        },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<TeamChatEmptyState conversation_id='conv-1' />);

    expect(screen.getByText('Legacy Runtime Name')).toBeInTheDocument();
  });

  it('uses assistant-first fallback suggestion copy', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Team - Leader',
        extra: {
          team_id: 'team-1',
          backend: 'claude',
        },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<TeamChatEmptyState conversation_id='conv-1' isLeader />);

    expect(screen.getByText('Organize a debate with assistants taking different sides')).toBeInTheDocument();
    // Middle suggestion is now the "ask the Leader to add a member" prompt.
    expect(screen.getByText('Help me add a member good at ___ to the team')).toBeInTheDocument();
  });

  it('shows a member greeting for non-leader members', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Team - Worker',
        extra: { team_id: 'team-1', backend: 'claude' },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<TeamChatEmptyState conversation_id='conv-1' />);

    expect(screen.getByTestId('team-chat-empty-state-subtitle')).toHaveTextContent(
      "Hi, I'm a team member. I take direction from the Leader and you."
    );
  });
});
