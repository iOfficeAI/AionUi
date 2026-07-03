/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AgentCard — the assistant-style row used on the Agent
 * settings page. Covers the disabled-agent treatment (a toggled-off custom
 * agent stays visible but greyed), the status tags, and the per-row
 * test-connection / edit actions shared by official and custom agents.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Project convention: t() echoes the key so labels are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import AgentCard from '@renderer/pages/settings/AgentSettings/AgentCard';

const baseAgent = {
  id: 'agent-1',
  name: 'Hermes',
  command: '/usr/local/bin/hermes-acp',
  args: ['--remote'],
};

const renderCustom = (
  enabled: boolean,
  handlers: Partial<{ onToggle: (v: boolean) => void; onTestConnection: () => void; onConfigure: () => void }> = {}
) =>
  render(
    <AgentCard
      type='custom'
      agent={{ ...baseAgent, enabled, agent_type: 'acp', agent_source: 'custom', installed: true, status: 'online' }}
      boundAssistants={[]}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggle={handlers.onToggle ?? vi.fn()}
      onTestConnection={handlers.onTestConnection ?? vi.fn()}
      onConfigure={handlers.onConfigure ?? vi.fn()}
    />
  );

describe('AgentCard (custom variant)', () => {
  it('greys the identity block and keeps the test-connection action available when the agent is disabled', () => {
    const { container } = renderCustom(false);

    // Disabled => identity block carries the opacity treatment.
    expect(container.querySelector('.opacity-50')).toBeTruthy();
    const testConnection = screen
      .getByText('settings.agentManagement.testConnection')
      .closest('button') as HTMLButtonElement;
    expect(testConnection.disabled).toBe(false);
  });

  it('renders at full opacity with both test-connection and edit actions when enabled', () => {
    const { container } = renderCustom(true);

    expect(container.querySelector('.opacity-50')).toBeNull();
    expect(screen.getByText('settings.agentManagement.testConnection')).toBeTruthy();
    expect(screen.getByText('common.edit')).toBeTruthy();
  });

  it('fires onTestConnection when the test-connection button is clicked', () => {
    const onTestConnection = vi.fn();
    renderCustom(true, { onTestConnection });

    fireEvent.click(screen.getByText('settings.agentManagement.testConnection'));
    expect(onTestConnection).toHaveBeenCalled();
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

const renderOfficial = (
  agent: Record<string, unknown>,
  handlers: Partial<{ onTestConnection: () => void; onConfigure: () => void }> = {}
) =>
  render(
    <AgentCard
      type='official'
      agent={agent as never}
      boundAssistants={[]}
      onTestConnection={handlers.onTestConnection ?? vi.fn()}
      onConfigure={handlers.onConfigure ?? vi.fn()}
    />
  );

describe('AgentCard (official variant)', () => {
  it('shows status tag plus test-connection and edit actions for a missing official agent', () => {
    renderOfficial({
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
    });

    expect(screen.getByText('settings.agentManagement.statusMissing')).toBeInTheDocument();
    // F2-02: test-connection stays available in every state, including missing.
    expect(screen.getByText('settings.agentManagement.testConnection')).toBeInTheDocument();
    expect(screen.getByText('common.edit')).toBeInTheDocument();
  });

  it('shows the needs-sign-in status when an offline agent reports auth_required', () => {
    renderOfficial({
      id: 'kimi',
      name: 'Kimi',
      agent_type: 'acp',
      agent_source: 'builtin',
      backend: 'kimi',
      enabled: true,
      installed: true,
      status: 'offline',
      last_check_error_code: 'auth_required',
    });

    // auth_required is split out of the generic offline label.
    expect(screen.getByText('settings.agentManagement.statusNeedsAuth')).toBeInTheDocument();
    expect(screen.queryByText('settings.agentManagement.statusOffline')).toBeNull();
  });

  it('shows the unchecked status before an agent has been manually tested', () => {
    renderOfficial({
      id: 'qwen',
      name: 'Qwen',
      agent_type: 'acp',
      agent_source: 'builtin',
      backend: 'qwen',
      enabled: true,
      installed: false,
      status: 'unchecked',
    });

    expect(screen.getByText('settings.agentManagement.statusUnchecked')).toBeInTheDocument();
    expect(screen.queryByText('settings.agentManagement.statusUnknown')).toBeNull();
  });

  it('shows the generic unavailable status for a non-auth offline agent', () => {
    renderOfficial({
      id: 'droid',
      name: 'Droid',
      agent_type: 'acp',
      agent_source: 'builtin',
      backend: 'droid',
      enabled: true,
      installed: true,
      status: 'offline',
      last_check_error_code: 'acp_init_failed',
    });

    expect(screen.getByText('settings.agentManagement.statusOffline')).toBeInTheDocument();
    expect(screen.queryByText('settings.agentManagement.statusNeedsAuth')).toBeNull();
  });

  it('fires onTestConnection when an online official agent is tested', () => {
    const onTestConnection = vi.fn();
    renderOfficial(
      {
        id: 'gemini',
        name: 'Gemini CLI',
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'gemini',
        enabled: true,
        installed: true,
        status: 'online',
      },
      { onTestConnection }
    );

    fireEvent.click(screen.getByText('settings.agentManagement.testConnection'));
    expect(onTestConnection).toHaveBeenCalled();
  });

  it('fires onConfigure when the edit action is clicked', () => {
    const onConfigure = vi.fn();
    renderOfficial(
      {
        id: 'gemini',
        name: 'Gemini CLI',
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'gemini',
        enabled: true,
        installed: true,
        status: 'online',
      },
      { onConfigure }
    );

    fireEvent.click(screen.getByText('common.edit'));
    expect(onConfigure).toHaveBeenCalled();
  });
});
