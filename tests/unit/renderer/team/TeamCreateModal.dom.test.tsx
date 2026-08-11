import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

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

const mockShowOpen = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockCreateTeam = vi.hoisted(() => vi.fn());
const mockIsElectronDesktop = vi.hoisted(() => vi.fn(() => true));

const cliAgents: AvailableAgent[] = [
  { backend: 'gemini', name: 'Gemini CLI', cliPath: '/usr/bin/gemini' },
  { backend: 'claude', name: 'Claude Code', cliPath: '/usr/bin/claude' },
];

const presetAssistants: AvailableAgent[] = [
  {
    backend: 'gemini',
    name: 'Writing Buddy',
    customAgentId: 'builtin-writing-buddy',
    isPreset: true,
    presetAgentType: 'gemini',
  },
];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: mockShowOpen,
      },
    },
    team: {
      create: {
        invoke: mockCreateTeam,
      },
    },
  },
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents, presetAssistants }),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: mockIsElectronDesktop,
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          claude: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {},
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      return null;
    }),
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    contentStyle,
    header,
    footer,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
    contentStyle?: { background?: string };
    header?: React.ReactNode | { render?: () => React.ReactNode; title?: React.ReactNode };
    footer?: React.ReactNode;
  }) => {
    if (!visible) return null;
    const headerNode =
      header && typeof header === 'object' && 'render' in header
        ? header.render?.()
        : header && typeof header === 'object' && 'title' in header
          ? header.title
          : header;
    return (
      <div data-testid='team-create-modal-shell' data-background={contentStyle?.background ?? ''}>
        {headerNode}
        <div data-testid='team-create-modal-body'>{children}</div>
        {footer}
      </div>
    );
  },
}));

import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';

describe('TeamCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
  });

  it('uses the brighter dialog surface for the modal shell', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('team-create-modal-shell')).toHaveAttribute('data-background', 'var(--dialog-fill-0)');
  });

  const openLeaderDropdown = () => {
    const selectWrapper = screen.getByTestId('team-create-leader-select');
    const view = selectWrapper.querySelector('.arco-select-view') as HTMLElement;
    expect(view).toBeTruthy();
    fireEvent.click(view);
  };

  it('renders grouped options for CLI and preset agents', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    openLeaderDropdown();

    expect(screen.getByText('CLI Agents')).toBeInTheDocument();
    expect(screen.getByText('Preset Assistants')).toBeInTheDocument();
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
    expect(screen.getByText('Writing Buddy')).toBeInTheDocument();
  });

  it('filters options by typed query against agent names', () => {
    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    openLeaderDropdown();

    const input = document.querySelector('.arco-select-view-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'writing' } });

    const visibleOptions = Array.from(document.querySelectorAll('.arco-select-option:not(.arco-select-option-hidden)'));
    const labels = visibleOptions.map((node) => node.textContent?.trim());
    expect(labels.some((label) => label?.includes('Writing Buddy'))).toBe(true);
    expect(labels.some((label) => label?.includes('Gemini CLI'))).toBe(false);
  });

  it('creates a team with the preset customAgentId and presetAgentType-derived backend', async () => {
    mockCreateTeam.mockResolvedValue({ id: 'team-created' });
    const onCreated = vi.fn();

    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={onCreated} />);

    openLeaderDropdown();
    const option = document.querySelector(
      '[data-testid="team-create-agent-option-preset::builtin-writing-buddy"]'
    ) as HTMLElement;
    expect(option).toBeTruthy();
    fireEvent.click(option);

    const nameInput = screen.getByPlaceholderText('Team name');
    fireEvent.change(nameInput, { target: { value: 'Writers' } });

    const submitButton = screen.getByRole('button', { name: 'Create Team' });
    fireEvent.click(submitButton);

    await vi.waitFor(() => {
      expect(mockCreateTeam).toHaveBeenCalledTimes(1);
    });

    const [payload] = mockCreateTeam.mock.calls[0];
    expect(payload.name).toBe('Writers');
    expect(payload.agents).toHaveLength(1);
    expect(payload.agents[0]).toMatchObject({
      role: 'leader',
      agentType: 'gemini',
      conversationType: 'gemini',
      customAgentId: 'builtin-writing-buddy',
    });
    expect(onCreated).toHaveBeenCalledWith({ id: 'team-created' });
  });

  it('uses brighter surface tokens for workspace picker', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/workspace-one']));

    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const workspaceTrigger = screen.getByTestId('team-create-workspace-trigger');
    expect(workspaceTrigger.className).toContain('bg-fill-1');
    expect(workspaceTrigger.className).toContain('border-border-2');
    expect(workspaceTrigger.className).toContain('py-0');

    fireEvent.click(workspaceTrigger);

    const workspaceMenu = screen.getByTestId('team-create-workspace-menu');
    expect(workspaceMenu.className).toContain('border-border-1');
    expect(workspaceMenu.className).toContain('shadow-[0_18px_48px_rgba(0,0,0,0.42)]');
    expect(workspaceMenu).toHaveStyle({ backgroundColor: 'var(--bg-2)', opacity: '1' });

    const recentWorkspace = screen.getByText('workspace-one').parentElement?.parentElement;
    expect(recentWorkspace?.className).toContain('border');
    expect(recentWorkspace?.className).toContain('hover:bg-fill-1');
  });
});
