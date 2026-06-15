/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Render test for the LocalAgents settings surface. Its purpose is to lock in
 * that LocalAgents reads the management view (`useManagedAgents`) — the
 * include_disabled data path that keeps user-disabled agents listed — and
 * derives the detected/custom sections from it.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// t() echoes the key so section labels/buttons are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

const { messageSuccess, messageWarning, messageError } = vi.hoisted(() => ({
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageError: vi.fn(),
}));
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: messageSuccess,
      warning: messageWarning,
      error: messageError,
    },
  };
});

// Controlled management-view data; assert LocalAgents consumes THIS hook.
const useManagedAgents = vi.fn();
vi.mock('@renderer/hooks/agent/useAgents', () => ({
  useManagedAgents: () => useManagedAgents(),
}));

// Bridge is only touched by user-action handlers, not on render — stub the
// shape the handlers reference so the import resolves.
vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      createCustomAgent: { invoke: vi.fn() },
      updateCustomAgent: { invoke: vi.fn() },
      deleteCustomAgent: { invoke: vi.fn() },
      setAgentEnabled: { invoke: vi.fn() },
      checkManagedAgentHealthById: { invoke: vi.fn() },
    },
  },
}));

// Keep the test focused on LocalAgents' own logic — stub heavy children.
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/AgentSettings/InlineAgentEditor', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/AgentSettings/AgentHubModal', () => ({ AgentHubModal: () => null }));

import LocalAgents from '@renderer/pages/settings/AgentSettings/LocalAgents';
import { ipcBridge } from '@/common';

const makeAgents = () => [
  {
    id: 'aionrs',
    name: 'Aion CLI',
    agent_type: 'aionrs',
    agent_source: 'internal',
    backend: 'aionrs',
    enabled: true,
    available: true,
    installed: true,
    status: 'available',
  },
  {
    id: 'acp-claude',
    name: 'Claude Code',
    agent_type: 'acp',
    agent_source: 'builtin',
    backend: 'claude',
    enabled: true,
    available: false,
    installed: false,
    status: 'missing',
  },
  {
    id: 'custom-1',
    name: 'My Agent',
    agent_type: 'acp',
    agent_source: 'custom',
    command: 'sh',
    enabled: true,
    available: true,
    installed: true,
    status: 'unavailable',
  },
];

describe('LocalAgents', () => {
  it('shows a success toast after an official-agent health check succeeds', async () => {
    const revalidate = vi.fn().mockResolvedValue(undefined);
    useManagedAgents.mockReturnValue({ agents: makeAgents(), revalidate });
    vi.mocked(ipcBridge.acpConversation.checkManagedAgentHealthById.invoke).mockResolvedValue({
      ...makeAgents()[1],
      status: 'available',
    });

    render(<LocalAgents />);

    fireEvent.click(screen.getAllByText('settings.agentManagement.testConnection')[0]);

    await waitFor(() => {
      expect(ipcBridge.acpConversation.checkManagedAgentHealthById.invoke).toHaveBeenCalledWith({ id: 'aionrs' });
    });
    await waitFor(() => {
      expect(revalidate).toHaveBeenCalled();
      expect(messageSuccess).toHaveBeenCalledWith('settings.agentManagement.testConnectionAvailable');
    });
  });

  it('reads the managed-agents view and renders detected + custom sections', () => {
    useManagedAgents.mockReturnValue({ agents: makeAgents(), revalidate: vi.fn() });

    render(<LocalAgents />);

    // Proves L30 (useManagedAgents) ran and fed the derived lists.
    expect(useManagedAgents).toHaveBeenCalled();
    expect(screen.getByText('Aion CLI')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('My Agent')).toBeTruthy();
  });

  it('shows the empty state when no detected agents are present', () => {
    useManagedAgents.mockReturnValue({ agents: [], revalidate: vi.fn() });

    render(<LocalAgents />);

    expect(screen.getByText('settings.agentManagement.localAgentsEmpty')).toBeTruthy();
  });

  it('renders official/custom sections with management statuses and removes the chat shortcut', () => {
    useManagedAgents.mockReturnValue({ agents: makeAgents(), revalidate: vi.fn() });

    render(<LocalAgents />);

    expect(screen.getByText('settings.agentManagement.officialAgents')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.customAgents')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.statusMissing')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.statusUnavailable')).toBeTruthy();
    expect(screen.queryByText('settings.agentManagement.goToChat')).toBeNull();
  });
});
