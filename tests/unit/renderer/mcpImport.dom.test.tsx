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
});
