import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => '/logo.svg',
}));

import TeamAgentIdentity from '@/renderer/pages/team/components/TeamAgentIdentity';

describe('TeamAgentIdentity', () => {
  it('shows a crown next to the leader name', () => {
    render(<TeamAgentIdentity agentName='alice' agentType='gemini' isLead />);

    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByTestId('team-lead-crown')).toBeTruthy();
    expect(screen.getByTestId('team-lead-crown-icon')).toBeTruthy();
    expect(screen.getByTestId('team-lead-crown-icon').getAttribute('width')).toBe('15');
    expect(screen.getByTestId('team-lead-crown-icon').getAttribute('height')).toBe('15');
  });

  it('does not render the crown for teammates', () => {
    render(<TeamAgentIdentity agentName='bob' agentType='gemini' />);

    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.queryByTestId('team-lead-crown')).toBeNull();
  });
});
