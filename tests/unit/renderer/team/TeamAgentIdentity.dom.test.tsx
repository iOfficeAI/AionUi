import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: (type: string) => (type === 'no-logo' ? null : '/logo.svg'),
}));

const mockPresetInfo = vi.hoisted(() => ({ value: null as { name: string; logo: string; isEmoji: boolean } | null }));
vi.mock('@renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: mockPresetInfo.value, isLoading: false }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: vi.fn(async () => null) },
    },
  },
}));

import TeamAgentIdentity from '@/renderer/pages/team/components/TeamAgentIdentity';

describe('TeamAgentIdentity', () => {
  beforeEach(() => {
    mockPresetInfo.value = null;
  });

  it('shows a crown next to the leader name', () => {
    render(<TeamAgentIdentity agentName='alice' agentType='gemini' isLeader />);

    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByTestId('team-leader-crown')).toBeTruthy();
    expect(screen.getByTestId('team-leader-crown-icon')).toBeTruthy();
    expect(screen.getByTestId('team-leader-crown-icon').getAttribute('width')).toBe('15');
    expect(screen.getByTestId('team-leader-crown-icon').getAttribute('height')).toBe('15');
  });

  it('does not render the crown for teammates', () => {
    render(<TeamAgentIdentity agentName='bob' agentType='gemini' />);

    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.queryByTestId('team-leader-crown')).toBeNull();
  });

  it('falls back to the backend logo when no preset info is available', () => {
    render(<TeamAgentIdentity agentName='carol' agentType='gemini' conversationId='c-1' />);

    const logo = screen.getByAltText('gemini') as HTMLImageElement;
    expect(logo.src).toContain('/logo.svg');
  });

  it('renders the preset emoji avatar instead of the backend logo', () => {
    mockPresetInfo.value = { name: 'Word Creator', logo: '📝', isEmoji: true };

    render(<TeamAgentIdentity agentName='Leader' agentType='gemini' conversationId='c-2' />);

    expect(screen.getByText('📝')).toBeTruthy();
    // Backend logo must not render when preset info is present
    expect(screen.queryByAltText('gemini')).toBeNull();
  });

  it('renders the preset image avatar when the preset provides a non-emoji logo', () => {
    mockPresetInfo.value = { name: 'Cowork', logo: '/assets/cowork.svg', isEmoji: false };

    render(<TeamAgentIdentity agentName='Assistant' agentType='gemini' conversationId='c-3' />);

    const avatar = screen.getByAltText('Cowork') as HTMLImageElement;
    expect(avatar.src).toContain('/assets/cowork.svg');
  });

  it('falls back to the first-letter circle when no preset and no backend logo exist', () => {
    render(<TeamAgentIdentity agentName='dave' agentType='no-logo' />);

    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.queryByAltText('no-logo')).toBeNull();
  });
});
