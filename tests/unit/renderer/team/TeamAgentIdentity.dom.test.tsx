import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSWRMock = vi.fn();
const usePresetAssistantInfoMock = vi.fn();
const getConversationOrNullMock = vi.fn();
const resolveAgentAvatarMock = vi.fn(() => ({ kind: 'fallback' }) as const);

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
  resolveAgentAvatar: (...args: unknown[]) => resolveAgentAvatarMock(...args),
}));

vi.mock('@renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (value: string | undefined) => value,
}));

import TeamAgentIdentity from '@/renderer/pages/team/components/TeamAgentIdentity';

describe('TeamAgentIdentity', () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    usePresetAssistantInfoMock.mockReset();
    getConversationOrNullMock.mockReset();
    resolveAgentAvatarMock.mockReturnValue({ kind: 'fallback' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<svg></svg>') }))
    );
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

  it('renders preset image logo through ThemedLogo', async () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-1' } });
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Claude Code',
        logo: 'http://127.0.0.1:1/api/assets/logos/ai-major/claude.svg',
        isEmoji: false,
        backend: 'claude',
      },
    });
    getConversationOrNullMock.mockResolvedValue(undefined);
    resolveAgentAvatarMock.mockReturnValue({
      kind: 'image',
      value: 'http://127.0.0.1:1/api/assets/logos/ai-major/claude.svg',
    });

    const { container } = render(
      <TeamAgentIdentity assistant_name='' assistant_backend='claude' conversation_id='conv-1' />
    );

    // Wait for ThemedLogo detection to settle
    await act(async () => {
      await Promise.resolve();
    });

    // Non-tintable SVG (no currentColor in stub) → renders as <img>
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
  });
});
