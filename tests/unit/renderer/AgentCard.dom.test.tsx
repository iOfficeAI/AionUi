/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the 'custom' variant of AgentCard — specifically the
 * disabled-agent treatment introduced so that toggling a custom agent off
 * keeps its card visible (greyed) in settings instead of removing it.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Project convention: t() echoes the key so labels are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import AgentCard from '@renderer/pages/settings/AgentSettings/AgentCard';

const baseAgent = {
  id: 'agent-1',
  name: 'Hermes',
  command: '/usr/local/bin/hermes-acp',
  args: ['--remote'],
};

const renderCustom = (enabled: boolean, handlers: Partial<{ onToggle: (v: boolean) => void }> = {}) =>
  render(
    <AgentCard
      type='custom'
      agent={{ ...baseAgent, enabled, agent_type: 'acp', agent_source: 'custom', installed: true, status: 'online' }}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggle={handlers.onToggle ?? vi.fn()}
    />
  );

describe('AgentCard (custom variant)', () => {
  it('greys the identity block and keeps the configure action available when the agent is disabled', () => {
    const { container } = renderCustom(false);

    // Disabled => identity block carries the opacity treatment.
    expect(container.querySelector('.opacity-50')).toBeTruthy();
    const configure = screen
      .getByText('settings.agentManagement.configureConnection')
      .closest('button') as HTMLButtonElement;
    expect(configure.disabled).toBe(false);
  });

  it('renders at full opacity with the configure action visible when the agent is enabled', () => {
    const { container } = renderCustom(true);

    expect(container.querySelector('.opacity-50')).toBeNull();
    expect(screen.getByText('settings.agentManagement.configureConnection')).toBeTruthy();
  });

  it('fires onToggle when the switch is clicked', () => {
    const onToggle = vi.fn();
    const { container } = renderCustom(false, { onToggle });

    const toggle = container.querySelector('[role="switch"]') as HTMLElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });
});

describe('AgentCard (official variant)', () => {
  it('shows status tag and troubleshoot action for a missing official agent', () => {
    render(
      <AgentCard
        type='official'
        agent={{
          id: 'claude',
          name: 'Claude Code',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'claude',
          enabled: true,
          installed: false,
          status: 'missing',
          last_check_error_code: 'command_not_found',
          last_check_error_details: { command: 'claude' },
          last_check_error_message: 'CLI command not found',
        }}
      />
    );

    expect(screen.getByText('settings.agentManagement.statusMissing')).toBeInTheDocument();
    expect(screen.getByText('settings.agentManagement.configureConnection')).toBeInTheDocument();
  });

  it('navigates to the repair page when the configure action is clicked', () => {
    render(
      <AgentCard
        type='official'
        agent={{
          id: 'gemini',
          name: 'Gemini CLI',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'gemini',
          enabled: true,
          installed: true,
          status: 'online',
        }}
      />
    );

    fireEvent.click(screen.getByText('settings.agentManagement.configureConnection'));
    expect(navigateMock).toHaveBeenCalledWith('/settings/agent/gemini/repair');
  });
});
