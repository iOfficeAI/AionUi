/*
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TerminalPanel from '@/renderer/components/layout/TerminalPanel';
import type { TerminalSession } from '@/renderer/components/layout/TerminalPanel/types';

const mockState = vi.hoisted(() => ({
  sessions: [] as TerminalSession[],
  activeId: null as string | null,
  openSession: vi.fn(),
  closeSession: vi.fn(),
  setActive: vi.fn(),
  renameSession: vi.fn(),
  cycleSession: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { title?: string }) => {
      const map: Record<string, string> = {
        'terminal.panelLabel': 'Integrated terminal',
        'terminal.startingShell': 'Starting shell...',
        'terminal.empty': 'No terminal',
      };
      if (key === 'terminal.exitedUnknown') return `${opts?.title ?? 'Terminal'} - exited`;
      return map[key] ?? key;
    },
  }),
}));

vi.mock('@renderer/hooks/context/TerminalPanelContext', () => ({
  useTerminalPanel: () => ({
    open: true,
    close: vi.fn(),
  }),
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ fontScale: 1 }),
}));

vi.mock('@renderer/hooks/ui/useTerminalShortcuts', () => ({
  useTerminalShortcuts: vi.fn(),
}));

vi.mock('@/renderer/components/layout/TerminalPanel/useTerminalTheme', () => ({
  useTerminalTheme: () => ({}),
}));

vi.mock('@/renderer/components/layout/TerminalPanel/useTerminalSessions', () => ({
  useTerminalSessions: () => mockState,
}));

vi.mock('@/renderer/components/layout/TerminalPanel/TerminalTabs', () => ({
  default: () => <div data-testid='terminal-tabs' />,
}));

vi.mock('@/renderer/components/layout/TerminalPanel/TerminalInstance', () => ({
  default: ({ session_id, visible }: { session_id: string; visible: boolean }) => (
    <div data-testid='terminal-instance' data-session-id={session_id} data-visible={String(visible)} />
  ),
}));

const pendingSession = (overrides: Partial<TerminalSession> = {}): TerminalSession => ({
  client_id: 'client-1',
  session_id: null,
  title: 'Terminal 1',
  cwd: null,
  shell: null,
  exited: false,
  exit_code: null,
  restored: false,
  ...overrides,
});

describe('TerminalPanel — session body fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.sessions = [];
    mockState.activeId = null;
  });

  it('shows starting text while the active shell spawn is pending', () => {
    mockState.sessions = [pendingSession()];
    mockState.activeId = 'client-1';

    render(<TerminalPanel />);

    expect(screen.getByText('Starting shell...')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-instance')).not.toBeInTheDocument();
  });

  it('shows an exited fallback instead of blanking the body when spawn fails before a session id exists', () => {
    mockState.sessions = [pendingSession({ exited: true })];
    mockState.activeId = 'client-1';

    render(<TerminalPanel />);

    expect(screen.getByText('Terminal 1 - exited')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-instance')).not.toBeInTheDocument();
  });

  it('renders the terminal instance once the active session has a shell session id', () => {
    mockState.sessions = [pendingSession({ session_id: 'shell-1' })];
    mockState.activeId = 'client-1';

    render(<TerminalPanel />);

    const terminal = screen.getByTestId('terminal-instance');
    expect(terminal).toHaveAttribute('data-session-id', 'shell-1');
    expect(terminal).toHaveAttribute('data-visible', 'true');
  });
});
