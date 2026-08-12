/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DOM tests for the one-click install guidance rendered on official agent rows
 * whose status is "missing" (not installed): an install-command copy button
 * and an official-docs link. Non-missing agents and missing agents without a
 * pinned backend show no guidance.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// t echoes keys so the button labels are assertable, matching project convention.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const mocks = vi.hoisted(() => ({
  copyText: vi.fn(async (_text: string) => undefined),
  openExternalUrl: vi.fn(async (_url: string) => undefined),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText: mocks.copyText }));
vi.mock('@/renderer/utils/platform', () => ({ openExternalUrl: mocks.openExternalUrl }));
vi.mock('@/renderer/pages/settings/AgentSettings/agentInstallPlatform', () => ({
  detectAgentPlatform: () => 'macos',
}));
// Keep the real Arco components; only stub Message so its static success/error
// toasts don't try to mount a portal in the jsdom test environment.
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { success: mocks.messageSuccess, error: mocks.messageError },
  };
});

import AgentCard from '@/renderer/pages/settings/AgentSettings/AgentCard';

const baseAgent = {
  id: 'agent-1',
  name: 'Claude',
  command: 'claude',
  args: [],
  agent_type: 'acp',
  agent_source: 'builtin',
  installed: false,
};

const renderOfficial = (agent: Record<string, unknown>) =>
  render(
    <AgentCard
      type='official'
      agent={agent as never}
      boundAssistants={[]}
      onTestConnection={vi.fn()}
      onConfigure={vi.fn()}
    />
  );

describe('AgentCard one-click install guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the install-command copy and docs buttons for a missing known backend', () => {
    renderOfficial({ ...baseAgent, status: 'missing', backend: 'claude' });
    expect(screen.getByTestId('agent-row-install-agent-1')).toBeTruthy();
    expect(screen.getByTestId('agent-row-docs-agent-1')).toBeTruthy();
  });

  it('copies the platform-specific install command when the install button is clicked', async () => {
    renderOfficial({ ...baseAgent, status: 'missing', backend: 'claude' });
    fireEvent.click(screen.getByTestId('agent-row-install-agent-1'));
    expect(mocks.copyText).toHaveBeenCalledWith('npm install -g @anthropic-ai/claude-code');
    await vi.waitFor(() => expect(mocks.messageSuccess).toHaveBeenCalled());
  });

  it('opens the official docs when the docs button is clicked', () => {
    renderOfficial({ ...baseAgent, status: 'missing', backend: 'gemini' });
    fireEvent.click(screen.getByTestId('agent-row-docs-agent-1'));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://github.com/google-gemini/gemini-cli');
  });

  it('does not render install guidance when the agent is installed (online)', () => {
    renderOfficial({ ...baseAgent, status: 'online', backend: 'claude' });
    expect(screen.queryByTestId('agent-row-install-agent-1')).toBeNull();
    expect(screen.queryByTestId('agent-row-docs-agent-1')).toBeNull();
  });

  it('does not render install guidance for a missing backend without pinned commands', () => {
    renderOfficial({ ...baseAgent, status: 'missing', backend: 'some-custom-backend' });
    expect(screen.queryByTestId('agent-row-install-agent-1')).toBeNull();
    expect(screen.queryByTestId('agent-row-docs-agent-1')).toBeNull();
  });
});
