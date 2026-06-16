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
      agent={{ ...baseAgent, enabled }}
      onGoToChat={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggle={handlers.onToggle ?? vi.fn()}
    />
  );

describe('AgentCard (custom variant)', () => {
  it('greys the identity block and keeps test-connection available when the agent is disabled', () => {
    const { container } = renderCustom(false);

    // Disabled => identity block carries the opacity treatment.
    expect(container.querySelector('.opacity-50')).toBeTruthy();
    const testConnection = screen
      .getByText('settings.agentManagement.testConnection')
      .closest('button') as HTMLButtonElement;
    expect(testConnection.disabled).toBe(false);
  });

  it('renders at full opacity with test-connection visible when the agent is enabled', () => {
    const { container } = renderCustom(true);

    expect(container.querySelector('.opacity-50')).toBeNull();
    expect(screen.getByText('settings.agentManagement.testConnection')).toBeTruthy();
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
  it('shows backend/type metadata and the latest diagnostic message', () => {
    render(
      <AgentCard
        type='official'
        agent={{
          id: 'claude',
          name: 'Claude Code',
          agent_type: 'acp',
          backend: 'claude',
          status: 'missing',
          last_check_error_message: 'CLI command not found',
          last_check_guidance: 'Install Claude Code locally to continue.',
        }}
        onTestConnection={vi.fn()}
      />
    );

    expect(screen.getByText('CLAUDE · ACP')).toBeInTheDocument();
    expect(screen.getByText('CLI command not found Install Claude Code locally to continue.')).toBeInTheDocument();
  });
});
