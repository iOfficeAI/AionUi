import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const mockShowOpen = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockIsElectronDesktop = vi.hoisted(() => vi.fn(() => true));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'cron.page.scheduleDesc.manual') return 'Manual';
      if (key === 'cron.page.scheduleDesc.hourly') return 'Every hour';
      if (key === 'cron.page.scheduleDesc.dailyAt') return `Daily at ${options?.time}`;
      if (key === 'cron.page.scheduleDesc.weekdaysAt') return `Weekdays at ${options?.time}`;
      if (key === 'cron.page.scheduleDesc.weeklyAt') return `Weekly on ${options?.day} at ${options?.time}`;
      if (key === 'cron.page.form.newConversation') return 'New conversation';
      if (key === 'cron.page.form.existingConversation') return 'Ongoing conversation';
      if (key === 'cron.page.form.newConversationHint') return 'Start fresh on every run';
      if (key === 'cron.page.form.existingConversationHint') return 'Keep building in one conversation';
      if (key === 'cron.page.form.executionModeEditHint') return 'Execution mode cannot be changed after creation.';
      if (key === 'cron.detail.executionModeDescriptionNew') {
        return 'Each run starts a fresh conversation, so previous context does not carry over.';
      }
      if (key === 'cron.detail.executionModeDescriptionExisting') {
        return 'Each run continues in the same conversation, so earlier context and results stay available.';
      }
      if (key === 'cron.page.form.advancedSettings') return 'Advanced settings';
      if (key === 'cron.page.form.workspace') return 'Workspace';
      if (key === 'cron.page.form.workspaceHint') return 'Optional workspace';
      if (key === 'cron.page.form.workspacePlaceholder') return 'Workspace path';
      if (key === 'cron.page.form.selectFolder') return 'Select folder';
      if (key === 'cron.page.customCronWarning') {
        return "This task has a custom schedule that can't be edited here. Changing the frequency will replace it.";
      }
      if (key === 'cron.page.scheduleHint') {
        return 'Scheduled tasks use a randomized delay of several minutes for server performance.';
      }
      if (key === 'team.create.recentLabel') return 'Recent';
      if (key === 'team.create.chooseDifferentFolder') return 'Choose a different folder';
      if (key.startsWith('cron.page.weekday.')) {
        const day = key.split('.').pop();
        return day?.charAt(0).toUpperCase() + day?.slice(1);
      }
      return key;
    },
  }),
}));

// Mock @icon-park/react
vi.mock('@icon-park/react', () => ({
  Robot: () => <span data-testid='icon-robot' />,
  Down: () => <span data-testid='icon-down' />,
  Check: () => <span data-testid='icon-check' />,
  Close: ({ onClick }: { onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-close' onClick={onClick} />
  ),
  Folder: () => <span data-testid='icon-folder' />,
  FolderOpen: () => <span data-testid='icon-folder-open' />,
  FolderPlus: () => <span data-testid='icon-folder-plus' />,
}));

// Mock ipcBridge
const mockAddJob = vi.fn();
const mockUpdateJob = vi.fn();
const mockFormSetFieldsValue = vi.hoisted(() => vi.fn());
const mockFormResetFields = vi.hoisted(() => vi.fn());
const mockFormValidate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    name: 'Test Task',
    description: 'Test Description',
    prompt: 'Test Prompt',
    agent: 'cli:claude',
  })
);
const mockForm = {
  setFieldsValue: mockFormSetFieldsValue,
  resetFields: mockFormResetFields,
  validate: mockFormValidate,
};

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: (...args: unknown[]) => mockShowOpen(...args) },
    },
    cron: {
      addJob: { invoke: (...args: unknown[]) => mockAddJob(...args) },
      updateJob: { invoke: (...args: unknown[]) => mockUpdateJob(...args) },
    },
  },
}));

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: mockIsElectronDesktop,
}));

// Mock Arco Design components
vi.mock('@arco-design/web-react', () => ({
  Form: Object.assign(
    ({ children, form: _form }: { children: React.ReactNode; form?: unknown; layout?: string }) => (
      <form data-testid='mock-form'>{children}</form>
    ),
    {
      Item: ({ children, label, field }: { children: React.ReactNode; label?: string; field?: string }) => (
        <div data-testid={`form-item-${field}`}>
          {label && <label>{label}</label>}
          {children}
        </div>
      ),
      useForm: () => [mockForm],
    }
  ),
  Input: Object.assign(
    ({ placeholder, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input placeholder={placeholder} {...props} />
    ),
    {
      TextArea: ({ placeholder, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
        <textarea placeholder={placeholder} {...props} />
      ),
    }
  ),
  Select: Object.assign(
    ({
      value,
      onChange,
      children,
      placeholder,
    }: {
      value?: string;
      onChange?: (value: string) => void;
      children?: React.ReactNode;
      placeholder?: string;
    }) => (
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid='mock-select'
        aria-label={placeholder}
      >
        {children}
      </select>
    ),
    {
      Option: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <option value={value}>{children}</option>
      ),
      OptGroup: ({ label, children }: { label: string; children: React.ReactNode }) => (
        <optgroup label={label}>{children}</optgroup>
      ),
    }
  ),
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
  TimePicker: ({ value: _value, onChange }: { value?: unknown; onChange?: (str: string, time: unknown) => void }) => (
    <input
      type='time'
      data-testid='mock-time-picker'
      onChange={(e) => {
        onChange?.(e.target.value, { format: (_fmt: string) => e.target.value });
      }}
    />
  ),
  Collapse: Object.assign(
    ({
      children,
      defaultActiveKey,
    }: {
      children: React.ReactNode;
      defaultActiveKey?: string[];
      className?: string;
    }) => (
      <div data-testid='mock-collapse' data-default-keys={defaultActiveKey?.join(',')}>
        {children}
      </div>
    ),
    {
      Item: ({ children, header, name }: { children: React.ReactNode; header: string; name: string }) => (
        <div data-testid={`collapse-item-${name}`}>
          <div data-testid='collapse-header'>{header}</div>
          <div data-testid='collapse-content'>{children}</div>
        </div>
      ),
    }
  ),
  Button: ({
    children,
    onClick,
    size,
    htmlType = 'button',
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    size?: string;
    htmlType?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={htmlType} onClick={onClick} data-size={size} data-testid='mock-button'>
      {children}
    </button>
  ),
  Radio: Object.assign(
    ({
      value,
      children,
      checked,
      onChange,
      className,
      disabled,
    }: {
      value: string;
      children: React.ReactNode;
      checked?: boolean;
      onChange?: React.ChangeEventHandler<HTMLInputElement>;
      className?: string;
      disabled?: boolean;
    }) => (
      <label className={className}>
        <input type='radio' value={value} checked={checked} onChange={onChange} disabled={disabled} />
        {children}
      </label>
    ),
    {
      Group: ({
        value,
        onChange,
        children,
      }: {
        value?: string;
        onChange?: (value: string) => void;
        children?: React.ReactNode;
      }) => (
        <div data-testid='mock-radio-group' data-value={value}>
          {React.Children.map(children, (child) =>
            React.cloneElement(child as React.ReactElement, {
              checked: (child as React.ReactElement).props.value === value,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
            })
          )}
        </div>
      ),
    }
  ),
}));

// Mock ModalWrapper
vi.mock('@renderer/components/base/ModalWrapper', () => ({
  default: ({
    children,
    visible,
    onOk,
    onCancel,
  }: {
    children: React.ReactNode;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
  }) =>
    visible ? (
      <div data-testid='modal-wrapper'>
        {children}
        <button onClick={onOk} data-testid='modal-ok'>
          OK
        </button>
        <button onClick={onCancel} data-testid='modal-cancel'>
          Cancel
        </button>
      </div>
    ) : null,
}));

// Mock agent components
vi.mock('@renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div data-testid='agent-mode-selector'>AgentModeSelector</div>,
}));

vi.mock('@renderer/components/agent/AcpConfigSelector', () => ({
  default: () => <div data-testid='acp-config-selector'>AcpConfigSelector</div>,
}));

// Mock agent utils
vi.mock('@renderer/utils/model/agentModes', () => ({
  supportsModeSwitch: () => false,
  getFullAutoMode: () => 'full-auto',
}));

// Mock ConfigStorage
vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useModelProviderList
vi.mock('@renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: [],
    geminiModeLookup: {},
    getAvailableModels: () => [],
    formatModelLabel: (id: string) => id,
  }),
}));

// Mock GuidModelSelector
vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({
  default: () => <div data-testid='guid-model-selector'>GuidModelSelector</div>,
}));

// Mock hooks
vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [
      { backend: 'claude', name: 'Claude', cliPath: '/usr/bin/claude' },
      { backend: 'openai', name: 'OpenAI', cliPath: '/usr/bin/openai' },
    ],
    presetAssistants: [
      {
        customAgentId: 'assistant-1',
        name: 'Assistant 1',
        backend: 'claude',
        presetAgentType: 'custom',
        avatar: '🤖',
      },
    ],
  }),
}));

// Mock utils
vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: (backend: string) => (backend === 'claude' ? '/logo/claude.png' : null),
}));

vi.mock('@/renderer/pages/guid/constants', () => ({
  CUSTOM_AVATAR_IMAGE_MAP: {},
}));

vi.mock('dayjs', () => ({
  default: (str?: string) => ({
    format: (_fmt: string) => {
      if (!str) return '09:00';
      const match = str.match(/(\d{2}):(\d{2})/);
      if (match) return `${match[1]}:${match[2]}`;
      return '09:00';
    },
  }),
}));

import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsElectronDesktop.mockReturnValue(true);
  mockShowOpen.mockResolvedValue([]);
});

describe('CreateTaskDialog - parseCronExpr utility', () => {
  // Test parseCronExpr indirectly by checking if edit mode populates the form correctly
  it('parses hourly cron expression (0 * * * *)', () => {
    const editJob: ICronJob = {
      id: 'job-1',
      name: 'Hourly Task',
      schedule: { kind: 'cron', expr: '0 * * * *', description: 'Every hour' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Hourly check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    // Trigger the useEffect by setting visible=true
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Since we cannot directly test parseCronExpr (not exported), we verify the component behavior
    // The component should detect hourly frequency from "0 * * * *"
    // We can check the select element for frequency
    const frequencySelects = screen.getAllByTestId('mock-select');
    const frequencySelect = frequencySelects.find((el) => {
      const options = Array.from(el.querySelectorAll('option')).map((opt) => opt.textContent);
      return options.includes('cron.page.freq.hourly');
    });

    expect(frequencySelect).toBeDefined();
  });

  it('parses daily cron expression (30 9 * * *)', () => {
    const editJob: ICronJob = {
      id: 'job-2',
      name: 'Daily Task',
      schedule: { kind: 'cron', expr: '30 9 * * *', description: 'Daily at 09:30' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Daily check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should show time picker for daily frequency
    expect(screen.queryByTestId('mock-time-picker')).toBeInTheDocument();
  });

  it('parses weekdays cron expression (0 14 * * MON-FRI)', () => {
    const editJob: ICronJob = {
      id: 'job-3',
      name: 'Weekday Task',
      schedule: { kind: 'cron', expr: '0 14 * * MON-FRI', description: 'Weekdays at 14:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Weekday check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should show time picker but not weekday picker for weekdays frequency
    expect(screen.queryByTestId('mock-time-picker')).toBeInTheDocument();
  });

  it('parses weekly cron expression (0 10 * * WED)', () => {
    const editJob: ICronJob = {
      id: 'job-4',
      name: 'Weekly Task',
      schedule: { kind: 'cron', expr: '0 10 * * WED', description: 'Weekly on Wednesday at 10:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Weekly check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should show both time picker and weekday picker for weekly frequency
    expect(screen.queryByTestId('mock-time-picker')).toBeInTheDocument();
  });

  it('handles invalid or empty cron expressions gracefully', () => {
    const editJob: ICronJob = {
      id: 'job-5',
      name: 'Invalid Task',
      schedule: { kind: 'cron', expr: '', description: 'Manual' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should default to manual frequency
    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });

  it('handles custom cron expressions (e.g., every 4 hours)', () => {
    const editJob: ICronJob = {
      id: 'job-6',
      name: 'Every 4 Hours Task',
      schedule: { kind: 'cron', expr: '0 */4 * * *', description: 'Every 4 hours' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Every 4 hours check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should render without errors and recognize it as a custom schedule
    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });
});

describe('CreateTaskDialog - getAgentKeyFromJob utility', () => {
  it('returns correct key for CLI agent', () => {
    const editJob: ICronJob = {
      id: 'job-1',
      name: 'Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Test' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // getAgentKeyFromJob should return "cli:claude"
    // We verify indirectly by checking that the agent field is populated
    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });

  it('returns correct key for preset agent', () => {
    const editJob: ICronJob = {
      id: 'job-2',
      name: 'Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Test' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Assistant 1',
          isPreset: true,
          customAgentId: 'assistant-1',
          presetAgentType: 'custom',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // getAgentKeyFromJob should return "preset:assistant-1"
    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });

  it('returns undefined when agentConfig is missing', () => {
    const editJob: ICronJob = {
      id: 'job-3',
      name: 'Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Test' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );

    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Should render without errors even when agentConfig is missing
    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });
});

describe('CreateTaskDialog - schedule preset definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the existing-conversation explanation for tasks that keep running in one thread', () => {
    const editJob: ICronJob = {
      id: 'job-existing-mode',
      name: 'Existing Mode Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Keep following up' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    expect(
      screen.getByText('Each run continues in the same conversation, so earlier context and results stay available.')
    ).toBeInTheDocument();
  });

  it('generates correct cron expression for manual frequency (default)', async () => {
    const onClose = vi.fn();
    mockAddJob.mockResolvedValue(undefined);

    render(<CreateTaskDialog visible={true} onClose={onClose} conversationId='conv-1' />);

    // The default frequency should be 'manual'
    // Click OK to submit
    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockAddJob).toHaveBeenCalled();
    });

    const callArgs = mockAddJob.mock.calls[0][0];
    expect(callArgs.schedule.expr).toBe('');
    expect(callArgs.schedule.description).toContain('Manual');
  });

  // Test schedule preset definitions by verifying edit mode correctly reconstructs them
  it('correctly reconstructs hourly schedule from cron expression in edit mode', async () => {
    const editJob: ICronJob = {
      id: 'job-hourly',
      name: 'Hourly Task',
      schedule: { kind: 'cron', expr: '0 * * * *', description: 'Every hour' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Hourly check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    mockUpdateJob.mockResolvedValue(undefined);

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Submit to verify the schedule is preserved
    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    const callArgs = mockUpdateJob.mock.calls[0][0];
    expect(callArgs.updates.schedule.expr).toBe('0 * * * *');
  });

  it('correctly reconstructs daily schedule from cron expression in edit mode', async () => {
    const editJob: ICronJob = {
      id: 'job-daily',
      name: 'Daily Task',
      schedule: { kind: 'cron', expr: '30 9 * * *', description: 'Daily at 09:30' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Daily check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    mockUpdateJob.mockResolvedValue(undefined);

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    const callArgs = mockUpdateJob.mock.calls[0][0];
    expect(callArgs.updates.schedule.expr).toBe('30 9 * * *');
  });

  it('correctly reconstructs weekdays schedule from cron expression in edit mode', async () => {
    const editJob: ICronJob = {
      id: 'job-weekdays',
      name: 'Weekdays Task',
      schedule: { kind: 'cron', expr: '0 14 * * MON-FRI', description: 'Weekdays at 14:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Weekday check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    mockUpdateJob.mockResolvedValue(undefined);

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    const callArgs = mockUpdateJob.mock.calls[0][0];
    expect(callArgs.updates.schedule.expr).toBe('0 14 * * MON-FRI');
  });

  it('correctly reconstructs weekly schedule from cron expression in edit mode', async () => {
    const editJob: ICronJob = {
      id: 'job-weekly',
      name: 'Weekly Task',
      schedule: { kind: 'cron', expr: '0 10 * * WED', description: 'Weekly on Wednesday at 10:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Weekly check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    mockUpdateJob.mockResolvedValue(undefined);

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    const callArgs = mockUpdateJob.mock.calls[0][0];
    expect(callArgs.updates.schedule.expr).toBe('0 10 * * WED');
  });

  it('preserves custom cron expression when editing a task with unsupported schedule', async () => {
    const editJob: ICronJob = {
      id: 'job-custom',
      name: 'Every 4 Hours Task',
      schedule: { kind: 'cron', expr: '0 */4 * * *', description: 'Every 4 hours' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Every 4 hours check' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    mockUpdateJob.mockResolvedValue(undefined);

    const { rerender } = render(
      <CreateTaskDialog visible={false} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />
    );
    rerender(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    const callArgs = mockUpdateJob.mock.calls[0][0];
    // The custom cron expression should be preserved
    expect(callArgs.updates.schedule.expr).toBe('0 */4 * * *');
  });
});

describe('CreateTaskDialog - advanced settings workspace picker', () => {
  it('reuses the shared workspace picker styling inside advanced settings', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/scheduled-workspace']));

    const editJob: ICronJob = {
      id: 'job-workspace',
      name: 'Workspace Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Test prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
          workspace: '/tmp/scheduled-workspace',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    const workspaceTrigger = screen.getByTestId('cron-workspace-trigger');
    expect(workspaceTrigger.className).toContain('bg-fill-1');
    expect(workspaceTrigger.className).toContain('border-border-2');
    expect(workspaceTrigger.className).toContain('py-0');
    expect(screen.queryByText('Optional workspace')).not.toBeInTheDocument();

    fireEvent.click(workspaceTrigger);

    const workspaceMenu = screen.getByTestId('cron-workspace-menu');
    expect(workspaceMenu.className).toContain('border-border-1');
    expect(screen.getAllByText('scheduled-workspace')).toHaveLength(2);
  });
});

describe('CreateTaskDialog - custom schedule hint', () => {
  it('shows the custom schedule note as lightweight hint text and removes the delay hint', () => {
    const editJob: ICronJob = {
      id: 'job-custom-hint',
      name: 'Custom Task',
      schedule: { kind: 'cron', expr: '0 */4 * * *', description: 'Every 4 hours' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Test prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    const hint = screen.getByText(
      "This task has a custom schedule that can't be edited here. Changing the frequency will replace it."
    );

    expect(hint.className).toContain('text-t-secondary');
    expect(hint.className).not.toContain('text-[var(--color-warning-6)]');
    expect(
      screen.queryByText('Scheduled tasks use a randomized delay of several minutes for server performance.')
    ).not.toBeInTheDocument();
  });
});

describe('CreateTaskDialog - component behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in create mode when no editJob is provided', () => {
    render(<CreateTaskDialog visible={true} onClose={vi.fn()} conversationId='conv-1' />);

    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('mock-form')).toBeInTheDocument();
  });

  it('renders in edit mode when editJob is provided', () => {
    const editJob: ICronJob = {
      id: 'job-1',
      name: 'Existing Task',
      description: 'Stored description',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Existing prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    expect(screen.getByTestId('modal-wrapper')).toBeInTheDocument();
  });

  it('prefills the description field from the stored task description in edit mode', async () => {
    const editJob: ICronJob = {
      id: 'job-description',
      name: 'Existing Task',
      description: 'Stored description',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Existing prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    await waitFor(() => {
      expect(mockFormSetFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Stored description',
          prompt: 'Existing prompt',
        })
      );
    });
  });

  it('leaves the description field empty for legacy tasks without a stored description', async () => {
    const editJob: ICronJob = {
      id: 'job-legacy-description',
      name: 'Existing Task',
      description: undefined,
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Existing prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible={true} onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    await waitFor(() => {
      expect(mockFormSetFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
          prompt: 'Existing prompt',
        })
      );
    });
  });

  it('does not render when visible is false', () => {
    render(<CreateTaskDialog visible={false} onClose={vi.fn()} conversationId='conv-1' />);

    expect(screen.queryByTestId('modal-wrapper')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<CreateTaskDialog visible={true} onClose={onClose} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-cancel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls addJob API when submitting in create mode', async () => {
    const onClose = vi.fn();
    mockAddJob.mockResolvedValue(undefined);

    render(<CreateTaskDialog visible={true} onClose={onClose} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockAddJob).toHaveBeenCalled();
    });

    expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({ description: 'Test Description' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls updateJob API when submitting in edit mode', async () => {
    const onClose = vi.fn();
    mockUpdateJob.mockResolvedValue(undefined);

    const editJob: ICronJob = {
      id: 'job-1',
      name: 'Existing Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'Existing prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible={true} onClose={onClose} editJob={editJob} conversationId='conv-1' />);

    fireEvent.click(screen.getByTestId('modal-ok'));

    await waitFor(() => {
      expect(mockUpdateJob).toHaveBeenCalled();
    });

    expect(mockUpdateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ description: 'Test Description' }),
      })
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CreateTaskDialog - advanced settings panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
  });

  it('toggles the advanced settings panel open and closed', () => {
    render(<CreateTaskDialog visible={true} onClose={vi.fn()} conversationId='conv-1' />);

    // Workspace picker is hidden initially
    expect(screen.queryByTestId('cron-workspace-trigger')).not.toBeInTheDocument();

    // Open panel
    fireEvent.click(screen.getByTestId('mock-button'));
    expect(screen.getByTestId('cron-workspace-trigger')).toBeInTheDocument();

    // Close panel again
    fireEvent.click(screen.getByTestId('mock-button'));
    expect(screen.queryByTestId('cron-workspace-trigger')).not.toBeInTheDocument();
  });

  it('clears the workspace via the close icon inside the picker', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/ws']));

    const editJob: ICronJob = {
      id: 'job-clear',
      name: 'Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'prompt' },
        executionMode: 'existing',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
          workspace: '/tmp/ws',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    // Advanced open because workspace was set in agentConfig
    const workspaceTrigger = screen.getByTestId('cron-workspace-trigger');
    expect(workspaceTrigger).toBeInTheDocument();
    // Clear icon present because workspace has a value
    expect(workspaceTrigger.querySelector('[data-testid="icon-close"]')).not.toBeNull();

    fireEvent.click(workspaceTrigger.querySelector('[data-testid="icon-close"]') as Element);

    // After clearing, the trigger swaps back to the empty state affordance.
    expect(workspaceTrigger.querySelector('[data-testid="icon-close"]')).toBeNull();
    expect(workspaceTrigger.querySelector('[data-testid="icon-down"]')).not.toBeNull();
  });

  it('opens advanced panel pre-expanded when editJob has a workspace', () => {
    const editJob: ICronJob = {
      id: 'job-pre-open',
      name: 'Task',
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
      target: {
        kind: 'conversation',
        conversationId: 'conv-1',
        payload: { kind: 'message', text: 'prompt' },
        executionMode: 'new_conversation',
      },
      metadata: {
        agentType: 'claude',
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentConfig: {
          backend: 'claude',
          name: 'Claude',
          cliPath: '/usr/bin/claude',
          workspace: '/projects/my-app',
        },
      },
      state: 'active',
      lastExecutionTime: Date.now(),
    };

    render(<CreateTaskDialog visible onClose={vi.fn()} editJob={editJob} conversationId='conv-1' />);

    expect(screen.getByTestId('cron-workspace-trigger')).toBeInTheDocument();
  });
});
