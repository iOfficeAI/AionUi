import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { IHubAgentItem } from '@/common/types/hub';
import { AgentHubModal } from '@/renderer/pages/settings/AgentSettings/AgentHubModal';

const mockInstall = vi.hoisted(() => vi.fn());
const mockRetryInstall = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockUseHubAgents = vi.hoisted(() => vi.fn());
const mockOpenExternalUrl = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Modal: ({ visible, title, children }: { visible?: boolean; title?: React.ReactNode; children: React.ReactNode }) =>
    visible ? (
      <div data-testid='mock-modal'>
        <div>{title}</div>
        {children}
      </div>
    ) : null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Typography: {
    Text: ({ children, bold: _bold, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <span {...props}>{children}</span>
    ),
  },
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconDownload: () => <span data-testid='icon-download' />,
  IconRefresh: () => <span data-testid='icon-refresh' />,
}));

vi.mock('@/renderer/hooks/agent/useHubAgents', () => ({
  useHubAgents: () => mockUseHubAgents(),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  resolveAgentLogo: vi.fn(() => undefined),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: mockOpenExternalUrl,
}));

const createAgent = (overrides: Partial<IHubAgentItem>): IHubAgentItem => ({
  name: 'claude-code',
  displayName: 'Claude Code',
  description: 'Integrates Anthropic Claude Code as an ACP adapter in AionUi.',
  author: 'Anthropic',
  dist: {
    tarball: 'extensions/claude-code.tgz',
    integrity: 'sha512-test',
    unpackedSize: 1,
  },
  engines: {
    aionui: '^1.0.0',
  },
  hubs: ['acpAdapters'],
  status: 'not_installed',
  ...overrides,
});

describe('AgentHubModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHubAgents.mockReturnValue({
      agents: [],
      loading: false,
      error: undefined,
      install: mockInstall,
      retryInstall: mockRetryInstall,
      update: mockUpdate,
    });
  });

  it('renders agents as cards and wires install/update actions', () => {
    mockUseHubAgents.mockReturnValue({
      agents: [
        createAgent({ name: 'claude-code', displayName: 'Claude Code', status: 'installed' }),
        createAgent({ name: 'github-copilot', displayName: 'GitHub Copilot', status: 'not_installed' }),
        createAgent({ name: 'google-cli', displayName: 'Google CLI', status: 'update_available' }),
      ],
      loading: false,
      error: undefined,
      install: mockInstall,
      retryInstall: mockRetryInstall,
      update: mockUpdate,
    });

    render(<AgentHubModal visible={true} onCancel={vi.fn()} />);

    expect(screen.getByTestId('agent-hub-grid')).toBeTruthy();
    expect(screen.getAllByTestId('agent-hub-card')).toHaveLength(3);
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('GitHub Copilot')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(mockInstall).toHaveBeenCalledWith('github-copilot');
    expect(mockUpdate).toHaveBeenCalledWith('google-cli');
  });

  it('renders retry action for failed installations', () => {
    mockUseHubAgents.mockReturnValue({
      agents: [
        createAgent({
          name: 'goose',
          displayName: 'Goose',
          status: 'install_failed',
          installError: 'download failed',
        }),
      ],
      loading: false,
      error: undefined,
      install: mockInstall,
      retryInstall: mockRetryInstall,
      update: mockUpdate,
    });

    render(<AgentHubModal visible={true} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRetryInstall).toHaveBeenCalledWith('goose');
  });

  it('shows an empty state when the market has no agents', () => {
    render(<AgentHubModal visible={true} onCancel={vi.fn()} />);

    expect(screen.getByText('No agents available in the market.')).toBeTruthy();
  });

  it('renders the market contribution link and opens the repo', () => {
    render(<AgentHubModal visible={true} onCancel={vi.fn()} />);

    expect(screen.getByText('Want a new Agent listed here?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open a PR on AionHub' }));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://github.com/iOfficeAI/AionHub');
  });
});
