/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for the agent repair page staying mounted during background
 * catalog revalidation. SWR revalidates the managed-agent catalog when the
 * window regains focus; if the page unmounts its body while `isRefreshing`,
 * unsaved env-var/path edits held in AgentRepairPanel local state are wiped —
 * e.g. a user adds an env row, switches apps to copy the key, and comes back
 * to find the row gone.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ id: 'agent-1' }),
  };
});

const useManagedAgents = vi.fn();
vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgents: () => useManagedAgents(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkManagedAgentHealthById: { invoke: vi.fn() },
    },
  },
}));

// The panel's own behavior is covered by AgentRepairPanel.dom.test.tsx — here
// we only assert whether the page keeps it mounted.
vi.mock('@renderer/pages/settings/AgentSettings/AgentRepairPanel', () => ({
  default: () => <div data-testid='agent-repair-panel-stub' />,
}));
vi.mock('@renderer/pages/settings/AgentSettings/BoundAssistants', () => ({
  BoundAssistantList: () => null,
  getBoundAssistants: () => [],
  useAssistantsForAgents: () => ({ assistants: [] }),
}));

import AgentRepairPage from '@renderer/pages/settings/AgentSettings/AgentRepairPage';

const agent = {
  id: 'agent-1',
  name: 'Test Agent',
  agent_type: 'acp',
  agent_source: 'custom',
  enabled: true,
  installed: true,
  status: 'online',
};

describe('AgentRepairPage', () => {
  it('keeps the repair panel mounted while the catalog revalidates in the background', () => {
    useManagedAgents.mockReturnValue({ agents: [agent], isRefreshing: true, refreshCatalog: vi.fn() });

    render(<AgentRepairPage />);

    expect(screen.getByTestId('agent-repair-panel-stub')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates back to the agent list when the agent no longer exists after refresh', () => {
    useManagedAgents.mockReturnValue({ agents: [], isRefreshing: false, refreshCatalog: vi.fn() });

    render(<AgentRepairPage />);

    expect(screen.queryByTestId('agent-repair-panel-stub')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/settings/agent', { replace: true });
  });
});
