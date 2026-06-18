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
    status: 'needs_auth',
    env_override_key_count: 2,
    has_command_override: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch env plaintext until unlock', () => {
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const onSaved = vi.fn();

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    expect(getMock).not.toHaveBeenCalled();
    expect(screen.getByText(/repair\.configuredVarsCount/)).toBeInTheDocument();
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

    // Unlock
    const unlockButton = screen.getByRole('button', { name: /repair\.unlockAndEdit/ });
    await user.click(unlockButton);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });

    // Verify path input is filled
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

    // Unlock
    const unlockButton = screen.getByRole('button', { name: /repair\.unlockAndEdit/ });
    await user.click(unlockButton);

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
});
