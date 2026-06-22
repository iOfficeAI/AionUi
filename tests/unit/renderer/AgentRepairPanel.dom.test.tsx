/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentRepairPanel from '@/renderer/pages/settings/AgentSettings/AgentRepairPanel';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    getAgentOverrides: {
      invoke: vi.fn(),
    },
    setAgentOverrides: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AgentRepairPanel', () => {
  const mockAgent: ManagedAgent = {
    id: 'test-agent-1',
    name: 'Test Agent',
    agent_type: 'acp',
    agent_source: 'custom',
    command: '/usr/local/bin/test-cli',
    enabled: true,
    installed: true,
    status: 'offline',
    env_override_key_count: 2,
    has_command_override: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads current overrides on mount without an unlock step', async () => {
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    getMock.mockResolvedValue({
      command_override: '/custom/path/cli',
      env_override: [{ name: 'API_KEY', value: 'secret123' }],
    });
    const onSaved = vi.fn();

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/repair\.pathPlaceholder/)).toHaveValue('/custom/path/cli');
    });
  });

  it('saves overrides then triggers test connection once', async () => {
    const user = userEvent.setup();
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const setMock = vi.mocked(acpConversation.setAgentOverrides.invoke);
    const onSaved = vi.fn();

    getMock.mockResolvedValue({
      command_override: '/custom/path/cli',
      env_override: [
        { name: 'API_KEY', value: 'secret123' },
        { name: 'FACTORY_URL', value: 'http://localhost:8080' },
      ],
    });

    setMock.mockResolvedValue({
      ...mockAgent,
      has_command_override: true,
      env_override_key_count: 2,
    });

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    // Overrides load on mount — wait for the path input to fill.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });
    await waitFor(() => {
      const pathInput = screen.getByPlaceholderText(/repair\.pathPlaceholder/);
      expect(pathInput).toHaveValue('/custom/path/cli');
    });

    // Change path
    const pathInput = screen.getByPlaceholderText(/repair\.pathPlaceholder/);
    await user.clear(pathInput);
    await user.type(pathInput, '/new/path/cli');

    // Save
    const saveButton = screen.getByRole('button', { name: /repair\.saveAndTest/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(setMock).toHaveBeenCalledWith({
        id: 'test-agent-1',
        command_override: '/new/path/cli',
        env_override: [
          { name: 'API_KEY', value: 'secret123' },
          { name: 'FACTORY_URL', value: 'http://localhost:8080' },
        ],
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks save on duplicate env keys', async () => {
    const user = userEvent.setup();
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const setMock = vi.mocked(acpConversation.setAgentOverrides.invoke);
    const onSaved = vi.fn();

    getMock.mockResolvedValue({
      env_override: [
        { name: 'API_KEY', value: 'secret1' },
        { name: 'API_KEY', value: 'secret2' },
      ],
    });

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    // Wait for the mount-time load to populate the duplicate env rows.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });

    // Try to save
    const saveButton = screen.getByRole('button', { name: /repair\.saveAndTest/ });
    await user.click(saveButton);

    // Should show error and not call setAgentOverrides
    await waitFor(() => {
      expect(screen.getByText(/repair\.duplicateKeysError/)).toBeInTheDocument();
    });

    expect(setMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the offline diagnostic banner and the launch path for an offline agent', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});

    render(<AgentRepairPanel agent={mockAgent} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.repair.offlineTitle')).toBeInTheDocument();
    });
    // Non-online agents expose the launch path as the primary lever.
    expect(screen.getByText('settings.repair.pathLabel')).toBeInTheDocument();
  });

  it('shows the online banner and hides the launch path entirely when online', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});

    render(<AgentRepairPanel agent={{ ...mockAgent, status: 'online' }} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.repair.onlineTitle')).toBeInTheDocument();
    });
    // Online: only environment variables are shown; the launch path is hidden.
    expect(screen.getByText('settings.repair.envLabel')).toBeInTheDocument();
    expect(screen.queryByText('settings.repair.pathLabel')).toBeNull();
  });
});
