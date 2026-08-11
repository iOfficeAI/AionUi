/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AcpModelSelector from '../../src/renderer/components/agent/AcpModelSelector';
import GuidAcpConfigSelector from '../../src/renderer/pages/guid/components/GuidAcpConfigSelector';
import GuidModelSelector from '../../src/renderer/pages/guid/components/GuidModelSelector';

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      getModelConfig: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
    acpConversation: {
      getModelInfo: {
        invoke: vi.fn(),
      },
      responseStream: {
        on: vi.fn(() => () => void 0),
      },
      setModel: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/renderer/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    isOpen: false,
  }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    secondary: '#999999',
  },
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getModelDisplayLabel: ({ selectedLabel, fallbackLabel }: { selectedLabel?: string; fallbackLabel: string }) =>
    selectedLabel || fallbackLabel,
}));

vi.mock('../../src/renderer/pages/guid/utils/modelUtils', () => ({
  getAvailableModels: () => ['gemini-2.5-pro'],
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: [],
  }),
}));

vi.mock('@icon-park/react', () => ({
  Brain: () => <span data-testid='brain-icon' />,
  Down: () => <span data-testid='down-icon' />,
  Plus: () => <span data-testid='plus-icon' />,
  Shield: () => <span data-testid='shield-icon' />,
}));

vi.mock('@arco-design/web-react', async () => {
  const Button = ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  );
  const Dropdown = ({
    children,
    popupVisible,
    onVisibleChange,
    droplist,
  }: {
    children: React.ReactNode;
    popupVisible?: boolean;
    onVisibleChange?: (visible: boolean) => void;
    droplist?: React.ReactNode;
  }) => (
    <div data-testid='dropdown' data-visible={String(Boolean(popupVisible))}>
      <div data-testid='dropdown-trigger' onClick={() => onVisibleChange?.(!popupVisible)}>
        {children}
      </div>
      {popupVisible ? <div data-testid='dropdown-menu'>{droplist}</div> : null}
    </div>
  );
  const Tooltip = ({
    children,
    popupVisible,
    onVisibleChange,
    content,
  }: {
    children: React.ReactNode;
    popupVisible?: boolean;
    onVisibleChange?: (visible: boolean) => void;
    content?: React.ReactNode;
  }) => (
    <div
      data-testid='tooltip'
      data-visible={String(Boolean(popupVisible))}
      onMouseEnter={() => onVisibleChange?.(true)}
      onMouseLeave={() => onVisibleChange?.(false)}
    >
      {children}
      {popupVisible ? <div>{content}</div> : null}
    </div>
  );
  const Menu = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.Item = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type='button' data-testid='menu-item' onClick={onClick}>
      {children}
    </button>
  );
  Menu.ItemGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.SubMenu = ({ children, title }: { children: React.ReactNode; title: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  );

  return {
    Button,
    Dropdown,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
    Menu,
    Tooltip,
    ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const baseModelInfo = {
  source: 'models' as const,
  currentModelId: 'gpt-5.4',
  currentModelLabel: 'gpt-5.4',
  canSwitch: true,
  availableModels: [
    { id: 'gpt-5.4', label: 'gpt-5.4' },
    { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
  ],
};

describe('model selector popup safety', () => {
  it('closes GuidModelSelector dropdown when ACP model info refreshes', async () => {
    const { rerender } = render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn()}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={baseModelInfo}
        selectedAcpModel='gpt-5.4'
        setSelectedAcpModel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('dropdown-trigger'));
    expect(screen.getByTestId('dropdown')).toHaveAttribute('data-visible', 'true');

    rerender(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn()}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          ...baseModelInfo,
          currentModelId: 'gpt-5.3-codex',
          currentModelLabel: 'gpt-5.3-codex',
        }}
        selectedAcpModel='gpt-5.3-codex'
        setSelectedAcpModel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('dropdown')).toHaveAttribute('data-visible', 'false');
    });
  });

  it('closes AcpModelSelector dropdown when local model info changes', async () => {
    const { rerender } = render(
      <AcpModelSelector backend='codex' localModelInfo={baseModelInfo} onSelectModel={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId('dropdown-trigger'));
    expect(screen.getByTestId('dropdown')).toHaveAttribute('data-visible', 'true');

    rerender(
      <AcpModelSelector
        backend='codex'
        localModelInfo={{
          ...baseModelInfo,
          currentModelId: 'gpt-5.3-codex',
          currentModelLabel: 'gpt-5.3-codex',
        }}
        onSelectModel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('dropdown')).toHaveAttribute('data-visible', 'false');
    });
  });

  it('renders Guid ACP config selector for codex reasoning levels', () => {
    render(
      <GuidAcpConfigSelector
        backend='codex'
        configOptions={[
          {
            id: 'model_reasoning_effort',
            name: 'Reasoning effort',
            category: 'reasoning',
            type: 'select',
            currentValue: 'medium',
            options: [
              { value: 'low', name: 'Low' },
              { value: 'medium', name: 'Medium' },
              { value: 'high', name: 'High' },
              { value: 'xhigh', name: 'Xhigh' },
            ],
          },
        ]}
        selectedValues={{ model_reasoning_effort: 'high' }}
        onSelectOption={vi.fn()}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('High');
  });

  it('renders Guid ACP config selector for aionrs ChatGPT reasoning levels', () => {
    render(
      <GuidAcpConfigSelector
        backend='aionrs'
        configOptions={[
          {
            id: 'reasoning_effort',
            name: 'Reasoning effort',
            category: 'reasoning',
            type: 'select',
            currentValue: 'medium',
            options: [
              { value: 'low', name: 'Low' },
              { value: 'medium', name: 'Medium' },
              { value: 'high', name: 'High' },
              { value: 'xhigh', name: 'Xhigh' },
            ],
          },
        ]}
        selectedValues={{ reasoning_effort: 'xhigh' }}
        onSelectOption={vi.fn()}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Xhigh');
  });
});
