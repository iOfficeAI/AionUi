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
  useConversationAgents: () => ({ cliAgents }),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: mockIsElectronDesktop,
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

  it('uses brighter surface tokens for leader cards and workspace picker', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/workspace-one']));

    render(<TeamCreateModal visible onClose={vi.fn()} onCreated={vi.fn()} />);

    const geminiCard = screen.getByTestId('team-create-agent-card-cli::gemini');
    expect(geminiCard.className).toContain('bg-fill-1');
    expect(geminiCard.className).toContain('border-border-2');

    fireEvent.click(geminiCard);

    expect(geminiCard.className).toContain('bg-primary-light-1');
    expect(geminiCard.className).toContain('border-primary-5');

    const workspaceTrigger = screen.getByTestId('team-create-workspace-trigger');
    expect(workspaceTrigger.className).toContain('bg-fill-1');
    expect(workspaceTrigger.className).toContain('border-border-2');

    fireEvent.click(workspaceTrigger);

    const workspaceMenu = screen.getByTestId('team-create-workspace-menu');
    expect(workspaceMenu.className).toContain('bg-fill-1');
    expect(workspaceMenu.className).toContain('border-border-2');

    const recentWorkspace = screen.getByText('workspace-one').parentElement?.parentElement;
    expect(recentWorkspace?.className).toContain('hover:bg-fill-2');
  });
});
