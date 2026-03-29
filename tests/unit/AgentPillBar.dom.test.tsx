/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any imports
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn((backend: string) => (backend === 'claude' ? '/claude.svg' : null)),
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn(() => undefined),
}));

vi.mock('@icon-park/react', () => ({
  Plus: () => <span data-testid='icon-plus'>PlusIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
}));

vi.mock('../../src/renderer/pages/guid/index.module.css', () => ({
  default: { agentItemSelected: 'selected-class' },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import AgentPillBar from '../../src/renderer/pages/guid/components/AgentPillBar';
import type { AvailableAgent } from '../../src/renderer/pages/guid/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getAgentKey = (agent: { backend: string; customAgentId?: string }) =>
  agent.customAgentId ? `${agent.backend}:${agent.customAgentId}` : agent.backend;

const makeAgent = (overrides: Partial<AvailableAgent> & { backend: AvailableAgent['backend'] }): AvailableAgent => ({
  name: overrides.backend,
  ...overrides,
});

const defaultProps = {
  getAgentKey,
  onSelectAgent: vi.fn(),
  selectedAgentKey: 'claude',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentPillBar', () => {
  it('renders agent pills', () => {
    const agents: AvailableAgent[] = [
      makeAgent({ backend: 'claude', name: 'Claude' }),
      makeAgent({ backend: 'gemini', name: 'Gemini' }),
    ];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} />);
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Gemini')).toBeTruthy();
  });

  it('calls onSelectAgent when pill clicked', () => {
    const onSelectAgent = vi.fn();
    const agents: AvailableAgent[] = [
      makeAgent({ backend: 'claude', name: 'Claude' }),
      makeAgent({ backend: 'gemini', name: 'Gemini' }),
    ];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} onSelectAgent={onSelectAgent} />);
    const pill = screen.getByText('Gemini').closest('[data-agent-pill]') as HTMLElement;
    expect(pill).toBeTruthy();
    fireEvent.click(pill);
    expect(onSelectAgent).toHaveBeenCalledWith('gemini');
  });

  it('marks selected agent with data attribute', () => {
    const agents: AvailableAgent[] = [
      makeAgent({ backend: 'claude', name: 'Claude' }),
      makeAgent({ backend: 'gemini', name: 'Gemini' }),
    ];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} selectedAgentKey='claude' />);
    const claudePill = screen.getByText('Claude').closest('[data-agent-pill]') as HTMLElement;
    const geminiPill = screen.getByText('Gemini').closest('[data-agent-pill]') as HTMLElement;
    expect(claudePill.getAttribute('data-agent-selected')).toBe('true');
    expect(geminiPill.getAttribute('data-agent-selected')).toBe('false');
  });

  it('renders agent logo when available', () => {
    const agents: AvailableAgent[] = [makeAgent({ backend: 'claude', name: 'Claude' })];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} />);
    const img = screen.getByAltText('claude logo') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/claude.svg');
  });

  it('renders Robot icon when no logo available', () => {
    const agents: AvailableAgent[] = [makeAgent({ backend: 'remote', name: 'Unknown' })];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} selectedAgentKey='remote' />);
    expect(screen.getByTestId('icon-robot')).toBeTruthy();
  });

  it('renders emoji avatar for remote agents', () => {
    const agents: AvailableAgent[] = [makeAgent({ backend: 'remote', name: 'Remote', avatar: '🤖' })];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} selectedAgentKey='remote' />);
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('filters out plain custom agents', () => {
    const agents: AvailableAgent[] = [
      makeAgent({ backend: 'claude', name: 'Claude' }),
      // plain custom — no customAgentId, not extension → filtered out
      makeAgent({ backend: 'custom', name: 'Hidden Custom' }),
      // custom with customAgentId and isPreset=false → shown
      makeAgent({ backend: 'custom', name: 'Visible Custom', customAgentId: 'my-agent', isPreset: false }),
    ];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} />);
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Visible Custom')).toBeTruthy();
    expect(screen.queryByText('Hidden Custom')).toBeNull();
  });

  it('navigates to /settings/agent when + clicked', () => {
    const agents: AvailableAgent[] = [makeAgent({ backend: 'claude', name: 'Claude' })];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} />);
    const plusIcon = screen.getByTestId('icon-plus');
    const plusDiv = plusIcon.closest('div') as HTMLElement;
    expect(plusDiv).toBeTruthy();
    fireEvent.click(plusDiv);
    expect(mockNavigate).toHaveBeenCalledWith('/settings/agent');
  });

  it('renders separator dividers between agents on desktop', () => {
    const agents: AvailableAgent[] = [
      makeAgent({ backend: 'claude', name: 'Claude' }),
      makeAgent({ backend: 'gemini', name: 'Gemini' }),
    ];
    render(<AgentPillBar {...defaultProps} availableAgents={agents} />);
    // One separator between the two agents plus one before the + button = 2 total
    const separators = screen.getAllByText('|');
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });
});
