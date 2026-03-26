import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listExternalSessionsMock = vi.fn();
const importExternalSessionMock = vi.fn();
const openTabMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (
        ({
          'guid.externalSessions.title': 'Continue external sessions',
          'guid.externalSessions.description': 'External sessions description',
          'guid.externalSessions.refresh': 'Refresh',
          'guid.externalSessions.loading': 'Scanning external sessions...',
          'guid.externalSessions.import': 'Take over',
          'guid.externalSessions.loadFailed': 'Failed to scan external sessions.',
          'guid.externalSessions.importFailed': 'Failed to take over the selected external session.',
          'guid.externalSessions.providers.codex': 'Codex',
          'guid.externalSessions.providers.openclaw-gateway': 'OpenClaw',
          'guid.externalSessions.filters.all': 'All',
        }) as Record<string, string>
      )[key] ?? (key === 'guid.externalSessions.updatedAt' ? `Updated ${options?.time ?? ''}` : key),
  }),
}));

vi.mock('@icon-park/react', () => ({
  Refresh: () => <span data-testid='refresh-icon' />,
}));

vi.mock('@arco-design/web-react', () => {
  const Tabs = ({ activeTab, onChange, children }: any) => {
    const panes = React.Children.toArray(children) as React.ReactElement[];
    const normalizeKey = (value: string | null) => (value ? value.replace(/^\.\$/, '') : '');
    return (
      <div>
        <div>
          {panes.map((pane) => (
            <button key={String(pane.key)} type='button' onClick={() => onChange?.(normalizeKey(String(pane.key)))}>
              {pane.props.title}
            </button>
          ))}
        </div>
        <div>{panes.find((pane) => normalizeKey(String(pane.key)) === String(activeTab))?.props.children}</div>
      </div>
    );
  };

  Tabs.TabPane = ({ children }: any) => <>{children}</>;

  return {
    Button: ({ children, onClick, disabled, loading, icon, ...rest }: any) => (
      <button type='button' onClick={onClick} disabled={disabled || loading} {...rest}>
        {icon}
        {children}
      </button>
    ),
    Empty: ({ description }: any) => <div>{description}</div>,
    Message: {
      useMessage: () => [
        {
          error: vi.fn(),
          success: vi.fn(),
        },
        <div key='message-context' />,
      ],
    },
    Modal: ({ visible, children, title }: any) =>
      visible ? (
        <div>
          <div>{title}</div>
          {children}
        </div>
      ) : null,
    Tabs,
    Tag: ({ children }: any) => <span>{children}</span>,
    Typography: {
      Paragraph: ({ children }: any) => <p>{children}</p>,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      listExternalSessions: {
        invoke: (...args: any[]) => listExternalSessionsMock(...args),
      },
      importExternalSession: {
        invoke: (...args: any[]) => importExternalSessionMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTab: openTabMock,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

import ExternalSessionsModal from '@/renderer/pages/conversation/components/ExternalSessionsModal';

describe('ExternalSessionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExternalSessionsMock.mockResolvedValue({
      success: true,
      data: {
        sessions: [
          {
            provider: 'codex',
            sessionId: 'codex-1',
            title: 'Codex Session',
            workspace: '/tmp/codex',
            updatedAt: 1_710_000_000_000,
          },
          {
            provider: 'openclaw-gateway',
            sessionId: 'openclaw-1',
            title: 'OpenClaw Session',
            workspace: '/tmp/openclaw',
            updatedAt: 1_710_000_100_000,
          },
        ],
      },
    });
    importExternalSessionMock.mockResolvedValue({ success: true });
  });

  it('filters external sessions by provider tabs', async () => {
    render(<ExternalSessionsModal visible onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Codex Session')).toBeInTheDocument();
      expect(screen.getByText('OpenClaw Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'OpenClaw' }));

    await waitFor(() => {
      expect(screen.queryByText('Codex Session')).not.toBeInTheDocument();
      expect(screen.getByText('OpenClaw Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Codex' }));

    await waitFor(() => {
      expect(screen.getByText('Codex Session')).toBeInTheDocument();
      expect(screen.queryByText('OpenClaw Session')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => {
      expect(screen.getByText('Codex Session')).toBeInTheDocument();
      expect(screen.getByText('OpenClaw Session')).toBeInTheDocument();
    });
  });
});
