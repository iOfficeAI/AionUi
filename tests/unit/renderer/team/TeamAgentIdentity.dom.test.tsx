import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSWRMock = vi.fn();
const usePresetAssistantInfoMock = vi.fn();
const getConversationOrNullMock = vi.fn();
const useThemeContextMock = vi.fn();

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

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => useThemeContextMock(),
}));

vi.mock('agent-avatars/react', async () => {
  const { createElement } = await import('react');
  return {
    AgentAvatar: ({
      seed,
      size,
      options,
      alt,
      className,
    }: {
      seed: string;
      size: number;
      options: { namespace: string; theme: string };
      alt: string;
      className: string;
    }) =>
      createElement('img', {
        src: 'data:image/svg+xml,mocked-avatar',
        alt,
        className,
        'data-testid': 'deterministic-agent-avatar',
        'data-seed': seed,
        'data-size': size,
        'data-namespace': options.namespace,
        'data-theme': options.theme,
      }),
  };
});

vi.mock('@renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
  resolveAgentAvatar: () => ({ kind: 'fallback' }),
}));

vi.mock('@renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (value: string | undefined) => value,
}));

import TeamAgentIdentity from '@/renderer/pages/team/components/TeamAgentIdentity';
import TeammateMessageAvatar from '@/renderer/pages/conversation/Messages/components/TeammateMessageAvatar';

describe('TeamAgentIdentity', () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    usePresetAssistantInfoMock.mockReset();
    getConversationOrNullMock.mockReset();
  });

  it('prefers the team slot name over preset assistant name when conversation identity exists', () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-1' } });
    usePresetAssistantInfoMock.mockReturnValue({
      info: { name: 'Writer Assistant', logo: '✍️', isEmoji: true },
    });

    render(
      <TeamAgentIdentity assistant_name='Legacy Runtime Name' assistant_backend='claude' conversation_id='conv-1' />
    );

    expect(screen.getByText('Legacy Runtime Name')).toBeInTheDocument();
    expect(screen.queryByText('Writer Assistant')).not.toBeInTheDocument();
  });

  it('falls back to the runtime name when no preset assistant info exists', () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-1' } });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamAgentIdentity assistant_name='Legacy Runtime Name' assistant_backend='claude' conversation_id='conv-1' />
    );

    expect(screen.getByText('Legacy Runtime Name')).toBeInTheDocument();
  });

  it('falls back to a safe assistant label when the runtime name is empty', () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-1' } });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<TeamAgentIdentity assistant_name='' assistant_backend='claude' conversation_id='conv-1' />);

    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });
});

describe('TeammateMessageAvatar', () => {
  const defaultProps = {
    senderName: 'Researcher',
    senderConversationId: 'conversation-researcher',
    backendLogo: null,
  };

  beforeEach(() => {
    useSWRMock.mockReset();
    usePresetAssistantInfoMock.mockReset();
    getConversationOrNullMock.mockReset();
    useThemeContextMock.mockReset();
    useSWRMock.mockReturnValue({ data: undefined });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    useThemeContextMock.mockReturnValue({ theme: 'light' });
  });

  it('prefers an explicit preset emoji over the backend logo', () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: { name: 'Writer', logo: '✍️', isEmoji: true, isFallback: false },
    });

    render(<TeammateMessageAvatar {...defaultProps} backendLogo='data:image/svg+xml,backend-logo' />);

    expect(screen.getByText('✍️')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('prefers an explicit preset image over the backend logo', () => {
    const logo = 'data:image/svg+xml,preset-logo';
    usePresetAssistantInfoMock.mockReturnValue({
      info: { name: 'Writer', logo, isEmoji: false, isFallback: false },
    });

    render(<TeammateMessageAvatar {...defaultProps} backendLogo='data:image/svg+xml,backend-logo' />);

    expect(screen.getByRole('img', { name: 'Writer' })).toHaveAttribute('src', logo);
  });

  it.each([
    ['no preset info', null],
    ['a fallback preset', { name: 'Researcher', logo: '', isEmoji: false, isFallback: true }],
  ])('uses the backend logo when there is %s', (_case, info) => {
    const backendLogo = 'data:image/svg+xml,backend-logo';
    usePresetAssistantInfoMock.mockReturnValue({ info });

    render(<TeammateMessageAvatar {...defaultProps} backendLogo={backendLogo} />);

    expect(screen.getByRole('img', { name: 'Researcher' })).toHaveAttribute('src', backendLogo);
    expect(screen.queryByTestId('deterministic-agent-avatar')).not.toBeInTheDocument();
  });

  it('passes conversation identity and rendering options to the deterministic fallback', () => {
    render(<TeammateMessageAvatar {...defaultProps} />);

    const avatar = screen.getByTestId('deterministic-agent-avatar');
    expect({
      seed: avatar.getAttribute('data-seed'),
      size: avatar.getAttribute('data-size'),
      namespace: avatar.getAttribute('data-namespace'),
      theme: avatar.getAttribute('data-theme'),
      alt: avatar.getAttribute('alt'),
    }).toEqual({
      seed: 'conversation-researcher',
      size: '20',
      namespace: 'aionui/team',
      theme: 'light',
      alt: 'Researcher',
    });
  });

  it('uses the sender name as the fallback seed when conversation identity is missing', () => {
    render(<TeammateMessageAvatar {...defaultProps} senderConversationId={undefined} />);

    expect(screen.getByTestId('deterministic-agent-avatar')).toHaveAttribute('data-seed', 'Researcher');
  });

  it('passes the active dark theme to the deterministic fallback', () => {
    useThemeContextMock.mockReturnValue({ theme: 'dark' });

    render(<TeammateMessageAvatar {...defaultProps} />);

    expect(screen.getByTestId('deterministic-agent-avatar')).toHaveAttribute('data-theme', 'dark');
  });
});
