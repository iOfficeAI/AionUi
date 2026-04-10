import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockConversationGet = vi.hoisted(() => vi.fn());
const mockConversationUpdate = vi.hoisted(() => vi.fn());
const mockConversationRemove = vi.hoisted(() => vi.fn());
const mockConversationListByCronJob = vi.hoisted(() => vi.fn());
const mockOnJobExecuted = vi.hoisted(() => vi.fn());
const mockConversationListChanged = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'current-conv-id' }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGet(...args) },
      update: { invoke: (...args: unknown[]) => mockConversationUpdate(...args) },
      remove: { invoke: (...args: unknown[]) => mockConversationRemove(...args) },
      listByCronJob: { invoke: (...args: unknown[]) => mockConversationListByCronJob(...args) },
      listChanged: { on: (...args: unknown[]) => mockConversationListChanged(...args) },
    },
    cron: {
      onJobExecuted: { on: (...args: unknown[]) => mockOnJobExecuted(...args) },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Down: ({ className, onClick }: { className?: string; onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-down' className={className} onClick={onClick} />
  ),
  DeleteOne: () => <span data-testid='icon-delete' />,
  EditOne: () => <span data-testid='icon-edit' />,
  Pushpin: () => <span data-testid='icon-pushpin' />,
  Export: () => <span data-testid='icon-export' />,
  MessageOne: () => <span data-testid='icon-message' />,
}));

vi.mock('@arco-design/web-react', () => {
  const ModalComponent = ({
    visible,
    children,
    onOk,
    onCancel,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
    onOk?: () => void;
    onCancel?: () => void;
    [key: string]: unknown;
  }) => {
    if (!visible) return null;
    return (
      <div data-testid='rename-modal'>
        {children}
        <button data-testid='modal-ok' onClick={onOk}>
          OK
        </button>
        <button data-testid='modal-cancel' onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  };

  ModalComponent.confirm = ({ onOk }: { onOk?: () => void | Promise<void> }) => {
    // Simulate confirmation by immediately calling onOk
    if (onOk) {
      const result = onOk();
      if (result instanceof Promise) {
        void result;
      }
    }
  };

  return {
    Modal: ModalComponent,
    Input: ({
      value,
      onChange,
      onPressEnter,
      ...props
    }: {
      value: string;
      onChange: (val: string) => void;
      onPressEnter?: () => void;
      [key: string]: unknown;
    }) => (
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onPressEnter) {
            onPressEnter();
          }
        }}
        data-testid='rename-input'
      />
    ),
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
    Dropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Checkbox: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Spin: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: ({ status }: { status: string }) => <div data-testid='cron-indicator'>{status}</div>,
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  getSiderTooltipProps: () => ({}),
  cleanupSiderTooltips: vi.fn(),
}));

// Mock ConversationRow component
vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({
    conversation,
    onConversationClick,
    onEditStart,
    onDelete,
    onTogglePin,
  }: {
    conversation: { id: string; name: string };
    onConversationClick: (conv: { id: string; name: string }) => void;
    onEditStart: (conv: { id: string; name: string }) => void;
    onDelete: (id: string) => void;
    onTogglePin: (conv: { id: string; name: string }) => void;
  }) => (
    <div data-testid={`conversation-row-${conversation.id}`}>
      <span data-testid='conversation-name'>{conversation.name}</span>
      <button onClick={() => onConversationClick(conversation)} data-testid='click-conversation'>
        Click
      </button>
      <button onClick={() => onEditStart(conversation)} data-testid='edit-conversation'>
        Edit
      </button>
      <button onClick={() => onDelete(conversation.id)} data-testid='delete-conversation'>
        Delete
      </button>
      <button onClick={() => onTogglePin(conversation)} data-testid='toggle-pin'>
        Pin
      </button>
    </div>
  ),
}));

vi.mock('@renderer/pages/conversation/GroupedHistory/utils/groupingHelpers', () => ({
  isConversationPinned: () => false,
}));

vi.mock('@renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({
    isConversationGenerating: () => false,
    hasCompletionUnread: () => false,
    clearCompletionUnread: vi.fn(),
    conversations: [],
    groupedHistory: { today: [], yesterday: [], lastWeek: [], lastMonth: [], older: [] },
  }),
}));

import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import CronJobSiderItem from '@/renderer/components/layout/Sider/CronJobSiderItem';

describe('CronJobSiderItem', () => {
  const mockOnNavigate = vi.fn();

  const mockJobNewConversation: ICronJob = {
    id: 'job-1',
    name: 'Daily Summary',
    enabled: true,
    schedule: '0 9 * * *',
    target: {
      executionMode: 'new_conversation',
      newConversation: {
        modelKey: 'claude-3-5-sonnet',
        prompt: 'Summarize',
      },
    },
    metadata: {
      conversationId: 'conv-123',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    state: {
      lastRunAtMs: 0,
      nextRunAtMs: 0,
      lastStatus: 'pending',
    },
  };

  const mockJobExistingConversation: ICronJob = {
    ...mockJobNewConversation,
    id: 'job-2',
    name: 'Existing Mode Job',
    target: {
      executionMode: 'existing_conversation',
      existingConversation: {
        message: 'Update',
      },
    },
  };

  const mockConversations: TChatConversation[] = [
    {
      id: 'conv-1',
      name: 'Conversation 1',
      agentId: 'agent-1',
      createTime: Date.now(),
      modifyTime: Date.now(),
      messages: [],
      extra: {},
    },
    {
      id: 'conv-2',
      name: 'Conversation 2',
      agentId: 'agent-1',
      createTime: Date.now(),
      modifyTime: Date.now(),
      messages: [],
      extra: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationListByCronJob.mockResolvedValue(mockConversations);
    mockConversationGet.mockResolvedValue(mockConversations[0]);
    mockConversationUpdate.mockResolvedValue(true);
    mockConversationRemove.mockResolvedValue(true);
    mockOnJobExecuted.mockReturnValue(() => {});
    mockConversationListChanged.mockReturnValue(() => {});
  });

  it('renders job name', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Daily Summary')).toBeInTheDocument();
    });
  });

  it('navigates to job detail when clicking the title', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      const titleElement = screen.getByText('Daily Summary').closest('div');
      expect(titleElement).toBeInTheDocument();
      fireEvent.click(titleElement!);
    });

    expect(mockOnNavigate).toHaveBeenCalledWith('/scheduled/job-1');
  });

  it('shows expand/collapse arrow when there are child conversations', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByTestId('icon-down')).toBeInTheDocument();
    });
  });

  it('does not show arrow when there are no child conversations', async () => {
    mockConversationListByCronJob.mockResolvedValue([]);

    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.queryByTestId('icon-down')).not.toBeInTheDocument();
    });
  });

  it('toggles child conversations visibility when clicking arrow', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Wait for conversations to load and children to be hidden initially
    await waitFor(() => {
      expect(screen.getByTestId('icon-down')).toBeInTheDocument();
    });

    // Initially collapsed, children not visible
    expect(screen.queryByTestId('conversation-row-conv-1')).not.toBeInTheDocument();

    // Click arrow to expand
    const arrow = screen.getByTestId('icon-down');
    fireEvent.click(arrow);

    // Children should now be visible
    await waitFor(() => {
      expect(screen.getByTestId('conversation-row-conv-1')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-row-conv-2')).toBeInTheDocument();
    });

    // Click arrow again to collapse
    fireEvent.click(arrow);

    // Children should be hidden again
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-row-conv-1')).not.toBeInTheDocument();
    });
  });

  it('auto-expands when current route is the job detail', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/scheduled/job-1' onNavigate={mockOnNavigate} />);

    // Should auto-expand and show children
    await waitFor(() => {
      expect(screen.getByTestId('conversation-row-conv-1')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-row-conv-2')).toBeInTheDocument();
    });
  });

  it('auto-expands when current route is a child conversation', async () => {
    render(
      <CronJobSiderItem job={mockJobNewConversation} pathname='/conversation/conv-1' onNavigate={mockOnNavigate} />
    );

    // Should auto-expand and show children
    await waitFor(() => {
      expect(screen.getByTestId('conversation-row-conv-1')).toBeInTheDocument();
    });
  });

  it('navigates to conversation when clicking a child conversation', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click on child conversation
    await waitFor(() => {
      const clickButton = screen.getAllByTestId('click-conversation')[0];
      fireEvent.click(clickButton);
    });

    expect(mockOnNavigate).toHaveBeenCalledWith('/conversation/conv-1');
  });

  it('handles existing conversation mode via pre-fetched prop', async () => {
    const existingConv: TChatConversation = {
      id: 'existing-conv',
      name: 'Existing Conversation',
      agentId: 'agent-1',
      createTime: Date.now(),
      modifyTime: Date.now(),
      messages: [],
      extra: {},
    };

    render(
      <CronJobSiderItem
        job={mockJobExistingConversation}
        pathname='/'
        onNavigate={mockOnNavigate}
        existingConversation={existingConv}
      />
    );

    // Should NOT call conversation.get — parent provides it via prop
    expect(mockConversationGet).not.toHaveBeenCalled();

    // Expand to see the existing conversation
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    await waitFor(() => {
      expect(screen.getByTestId('conversation-row-existing-conv')).toBeInTheDocument();
    });
  });

  it('deletes conversation when delete is triggered', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click delete
    await waitFor(() => {
      const deleteButton = screen.getAllByTestId('delete-conversation')[0];
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(mockConversationRemove).toHaveBeenCalledWith({ id: 'conv-1' });
    });
  });

  it('calls delete handler when delete is triggered', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click delete on a conversation
    await waitFor(() => {
      const deleteButton = screen.getAllByTestId('delete-conversation')[0];
      fireEvent.click(deleteButton);
    });

    // Verify delete was called
    await waitFor(() => {
      expect(mockConversationRemove).toHaveBeenCalledWith({ id: 'conv-1' });
    });
  });

  it('highlights job detail when on detail route', async () => {
    const { container } = render(
      <CronJobSiderItem job={mockJobNewConversation} pathname='/scheduled/job-1' onNavigate={mockOnNavigate} />
    );

    await waitFor(() => {
      // Check for the highlight class
      const highlightedElement = container.querySelector('.bg-\\[rgba\\(var\\(--primary-6\\)\\,0\\.12\\)\\]');
      expect(highlightedElement).toBeInTheDocument();
    });
  });

  it('applies hover style when not on detail route', async () => {
    const { container } = render(
      <CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />
    );

    await waitFor(() => {
      const hoverElement = container.querySelector('.hover\\:bg-fill-3');
      expect(hoverElement).toBeInTheDocument();
    });
  });

  it('stops propagation when clicking arrow', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Should not navigate when clicking arrow
    expect(mockOnNavigate).not.toHaveBeenCalled();
  });

  it('opens rename modal when edit is triggered and updates conversation name', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click edit
    await waitFor(() => {
      const editButton = screen.getAllByTestId('edit-conversation')[0];
      fireEvent.click(editButton);
    });

    // Modal should be visible
    await waitFor(() => {
      expect(screen.getByTestId('rename-modal')).toBeInTheDocument();
    });

    // Input should have current name
    const input = screen.getByTestId('rename-input') as HTMLInputElement;
    expect(input.value).toBe('Conversation 1');

    // Change the name
    fireEvent.change(input, { target: { value: 'Updated Name' } });
    expect(input.value).toBe('Updated Name');

    // Click OK to confirm
    const okButton = screen.getByTestId('modal-ok');
    fireEvent.click(okButton);

    // Should call update API
    await waitFor(() => {
      expect(mockConversationUpdate).toHaveBeenCalledWith({
        id: 'conv-1',
        updates: { name: 'Updated Name' },
      });
    });
  });

  it('closes rename modal when cancel is clicked', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click edit
    await waitFor(() => {
      const editButton = screen.getAllByTestId('edit-conversation')[0];
      fireEvent.click(editButton);
    });

    // Modal should be visible
    await waitFor(() => {
      expect(screen.getByTestId('rename-modal')).toBeInTheDocument();
    });

    // Click Cancel
    const cancelButton = screen.getByTestId('modal-cancel');
    fireEvent.click(cancelButton);

    // Modal should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId('rename-modal')).not.toBeInTheDocument();
    });

    // Should not call update API
    expect(mockConversationUpdate).not.toHaveBeenCalled();
  });

  it('toggles pin status when pin button is clicked', async () => {
    render(<CronJobSiderItem job={mockJobNewConversation} pathname='/' onNavigate={mockOnNavigate} />);

    // Expand first
    await waitFor(() => {
      const arrow = screen.getByTestId('icon-down');
      fireEvent.click(arrow);
    });

    // Click pin
    await waitFor(() => {
      const pinButton = screen.getAllByTestId('toggle-pin')[0];
      fireEvent.click(pinButton);
    });

    // Should call update with pinned status
    await waitFor(() => {
      expect(mockConversationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'conv-1',
          mergeExtra: true,
        })
      );
    });
  });
});
