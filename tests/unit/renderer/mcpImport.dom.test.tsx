/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAgentMcpConfigsInvoke = vi.fn();
const getManagedAgents = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params && typeof params.count === 'number') {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    getAgentMcpConfigs: {
      invoke: (...args: unknown[]) => getAgentMcpConfigsInvoke(...args),
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  getManagedAgents: (...args: unknown[]) => getManagedAgents(...args),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    children,
    footer,
  }: {
    visible: boolean;
    children: React.ReactNode;
    footer?: { render?: () => React.ReactNode };
  }) =>
    visible ? (
      <div>
        {children}
        {footer?.render?.()}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/base/AionSteps', () => {
  const Step = ({ title }: { title: React.ReactNode }) => <div>{title}</div>;
  const Steps = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Steps.Step = Step;
  return { default: Steps };
});

vi.mock('@icon-park/react', () => ({
  Check: () => <span>check</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );

  const Select = ({
    children,
    value,
    onChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <div>
      <div data-testid='select-value'>{value}</div>
      <div>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child as React.ReactElement<{ onSelect?: () => void }>, {
            onSelect: () => onChange?.((child.props as { value: string }).value),
          });
        })}
      </div>
    </div>
  );

  Select.Option = ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  );

  return {
    Button,
    Select,
    Spin: () => <span>spin</span>,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/renderer/pages/settings/components/JsonImportModal', () => ({
  default: ({ visible }: { visible: boolean }) => (visible ? <div data-testid='json-import-modal' /> : null),
}));

vi.mock('@/renderer/pages/settings/components/OneClickImportModal', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/pages/settings/components/OneClickImportModal')>(
    '@/renderer/pages/settings/components/OneClickImportModal'
  );
  return actual;
});

import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import OneClickImportModal from '@/renderer/pages/settings/components/OneClickImportModal';

describe('MCP import flows', () => {
  beforeEach(() => {
    getAgentMcpConfigsInvoke.mockReset();
    getAgentMcpConfigsInvoke.mockResolvedValue([]);
    getManagedAgents.mockReset();
    getManagedAgents.mockResolvedValue([]);
  });

  it('opens the requested one-click import modal without probing managed agents first', async () => {
    render(
      <AddMcpServerModal
        visible
        existingServerNames={[]}
        importMode='oneclick'
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        onBatchImport={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('settings.mcpImportDescription')).toBeInTheDocument();
    });
    expect(getManagedAgents).not.toHaveBeenCalled();
  });

  it('loads MCP configs directly from the backend scan endpoint without managed-agent input', async () => {
    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
    });

    fireEvent.click(screen.getByText('settings.mcpNextStep'));

    await waitFor(() => {
      expect(getAgentMcpConfigsInvoke).toHaveBeenCalledWith();
    });
    expect(getManagedAgents).not.toHaveBeenCalled();
  });

  it('lists every backend-detected agent except AionUi itself as import source', async () => {
    getAgentMcpConfigsInvoke.mockResolvedValue([
      { source: 'claude', servers: [] },
      { source: 'codex', servers: [] },
      { source: 'gemini', servers: [] },
      { source: 'qwen', servers: [] },
      { source: 'codebuddy', servers: [] },
      { source: 'opencode', servers: [] },
      { source: 'aionrs', servers: [] },
      { source: 'aionui', servers: [] },
    ]);

    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.mcpImportAgentGemini')).toBeInTheDocument();
    });

    for (const key of [
      'settings.mcpImportAgentClaude',
      'settings.mcpImportAgentCodex',
      'settings.mcpImportAgentGemini',
      'settings.mcpImportAgentQwen',
      'settings.mcpImportAgentCodebuddy',
      'settings.mcpImportAgentOpencode',
      'settings.mcpImportAgentAionrs',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    // AionUi itself must be excluded (importing from self is a no-op)
    expect(screen.queryByText('aionui')).not.toBeInTheDocument();
    // First backend source is preselected
    expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
  });

  it('fetches servers of the selected agent when scanning', async () => {
    getAgentMcpConfigsInvoke.mockResolvedValue([
      { source: 'claude', servers: [] },
      { source: 'gemini', servers: [] },
    ]);

    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
    });

    fireEvent.click(screen.getByText('settings.mcpImportAgentGemini'));
    fireEvent.click(screen.getByText('settings.mcpNextStep'));

    await waitFor(() => {
      expect(screen.getByText('settings.mcpNoServersFound')).toBeInTheDocument();
    });
    expect(getManagedAgents).not.toHaveBeenCalled();
  });

  it('falls back to Claude Code and Codex when the backend scan returns no agents', async () => {
    getAgentMcpConfigsInvoke.mockResolvedValue([]);

    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.mcpImportAgentClaude')).toBeInTheDocument();
    });
    expect(screen.getByText('settings.mcpImportAgentCodex')).toBeInTheDocument();
    expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
  });

  it('falls back to Claude Code and Codex when the backend scan fails', async () => {
    getAgentMcpConfigsInvoke.mockRejectedValue(new Error('backend unreachable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.mcpImportAgentClaude')).toBeInTheDocument();
    });
    expect(screen.getByText('settings.mcpImportAgentCodex')).toBeInTheDocument();
    expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('shows the raw backend name for sources without a localized display name', async () => {
    getAgentMcpConfigsInvoke.mockResolvedValue([{ source: 'custom-agent', servers: [] }]);

    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText('custom-agent').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('select-value')).toHaveTextContent('custom-agent');
  });

  it('does not scan for agent configs while the modal is hidden', async () => {
    render(<OneClickImportModal visible={false} existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    expect(getAgentMcpConfigsInvoke).not.toHaveBeenCalled();
  });

  it('ignores backend results that arrive after the modal was closed', async () => {
    let resolveConfigs: ((configs: unknown) => void) | undefined;
    getAgentMcpConfigsInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfigs = resolve;
        })
    );

    const { unmount } = render(
      <OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />
    );
    await waitFor(() => {
      expect(getAgentMcpConfigsInvoke).toHaveBeenCalledTimes(1);
    });

    // Closing the modal runs the effect cleanup (cancelled = true) before the scan resolves.
    unmount();
    resolveConfigs?.([{ source: 'claude', servers: [] }]);
    await Promise.resolve();

    // The stale result is ignored: no new scan and no state update on an unmounted modal.
    expect(getAgentMcpConfigsInvoke).toHaveBeenCalledTimes(1);
  });

  it('ignores backend failures that arrive after the modal was closed', async () => {
    let rejectConfigs: ((reason: unknown) => void) | undefined;
    getAgentMcpConfigsInvoke.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectConfigs = reject;
        })
    );

    const { unmount } = render(
      <OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />
    );
    await waitFor(() => {
      expect(getAgentMcpConfigsInvoke).toHaveBeenCalledTimes(1);
    });

    // The catch handler also bails out when the modal was closed before the scan failed.
    unmount();
    rejectConfigs?.(new Error('late failure'));
    await Promise.resolve();

    expect(getAgentMcpConfigsInvoke).toHaveBeenCalledTimes(1);
  });
});
