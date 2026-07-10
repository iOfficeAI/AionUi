/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

const { messageSuccessMock, messageErrorMock, useAcpModelInfoMock } = vi.hoisted(() => ({
  messageSuccessMock: vi.fn(),
  messageErrorMock: vi.fn(),
  useAcpModelInfoMock: vi.fn(),
}));

type MockAcpModelInfoResult = {
  model_info: AcpModelInfo | null;
  canSwitch: boolean;
  isLoading: boolean;
  isSetting: boolean;
  selectModel: (modelId: string) => void;
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  setConfigOption: (optionId: string, value: string) => Promise<unknown>;
};

const modelInfo: AcpModelInfo = {
  current_model_id: 'gpt-5.2',
  current_model_label: 'GPT-5.2',
  available_models: [
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.2-mini', label: 'GPT-5.2 Mini' },
  ],
};

const thoughtLevel: AcpDerivedOption = {
  id: 'thought_level',
  category: 'thought_level',
  currentValue: 'high',
  options: [
    { value: 'low', label: 'Low', description: 'Quick checks with minimal reasoning' },
    { value: 'high', label: 'High', description: 'More reasoning for complex work' },
  ],
};

const makeResult = (overrides: Partial<MockAcpModelInfoResult> = {}): MockAcpModelInfoResult => ({
  model_info: modelInfo,
  canSwitch: true,
  isLoading: false,
  isSetting: false,
  selectModel: vi.fn(),
  thoughtLevel,
  setStatus: { state: 'idle' },
  setConfigOption: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: useAcpModelInfoMock,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getModelDisplayLabel: ({
    selectedLabel,
    selected_value,
    fallbackLabel,
  }: {
    selectedLabel?: string;
    selected_value?: string | null;
    fallbackLabel: string;
  }) => selectedLabel || selected_value || fallbackLabel,
}));

vi.mock('@icon-park/react', () => ({
  Brain: () => <span aria-hidden='true'>brain</span>,
  Down: () => <span aria-hidden='true'>v</span>,
  Right: () => <span aria-hidden='true'>›</span>,
  Search: () => <span aria-hidden='true'>search</span>,
  Loading: ({ className }: { className?: string }) => <span aria-hidden='true' className={className} />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === 'agent.thoughtLevel.label') return 'Thinking Level';
      if (key === 'agent.thoughtLevel.switchSuccess') return 'agent.thoughtLevel.switchSuccess';
      if (key === 'agent.config.commandAck') return 'agent.config.commandAck';
      if (key === 'common.model') return 'Model';
      if (key === 'common.defaultModel') return 'Default';
      if (key === 'agent.model.searchPlaceholder') return 'Search models';
      if (key === 'agent.model.noResults') return 'No matching models';
      if (key === 'conversation.welcome.useCliModel') return 'Use CLI model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch is not supported';
      return options?.defaultValue ?? key;
    },
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(
    ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div data-testid='dropdown-menu' className={className}>
        {children}
      </div>
    ),
    {
      Item: ({
        children,
        className,
        onClick,
      }: {
        children?: React.ReactNode;
        className?: string;
        onClick?: () => void;
      }) => (
        <div role='menuitem' className={className} onClick={onClick}>
          {children}
        </div>
      ),
      ItemGroup: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
        <div role='group' aria-label={String(title)}>
          {children}
        </div>
      ),
      // SubMenu renders both the title row and its children so tests can inspect both levels.
      SubMenu: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
        <div role='group'>
          <div data-testid='submenu-title'>{title}</div>
          <div data-testid='submenu-body'>{children}</div>
        </div>
      ),
    }
  );
  return {
    Button: ({
      children,
      disabled,
      onClick,
      ...props
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button type='button' disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
      <div>
        {children}
        {droplist}
      </div>
    ),
    Menu,
    Message: {
      success: messageSuccessMock,
      error: messageErrorMock,
    },
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
      <span data-tooltip-content={typeof content === 'string' ? content : undefined}>{children}</span>
    ),
  };
});

describe('AcpModelSelector runtime options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAcpModelInfoMock.mockReturnValue(makeResult());
  });

  it('shows the current model and thought level in the header pill', () => {
    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    expect(screen.getByTestId('acp-model-selector')).toHaveTextContent('GPT-5.2 · High');
  });

  it('shows a plain loading slot while runtime config is initializing', () => {
    useAcpModelInfoMock.mockReturnValue(makeResult({ model_info: null, canSwitch: false, isLoading: true }));

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    const slot = screen.getByTestId('acp-model-selector-loading');
    expect(screen.getByTestId('runtime-selector-loading-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-selector-loading-spinner')).toBeInTheDocument();
    expect(slot.tagName).toBe('DIV');
    expect(screen.queryByTestId('acp-model-selector')).not.toBeInTheDocument();
    expect(slot).not.toHaveTextContent('Use CLI model');
    expect(slot.closest('[data-tooltip-content]')).toBeNull();
  });

  it('passes team runtime preparation through to model info loading', () => {
    const prepareRuntime = vi.fn().mockResolvedValue(undefined);

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' prepareRuntime={prepareRuntime} />);

    expect(useAcpModelInfoMock).toHaveBeenCalledWith(expect.objectContaining({ prepareRuntime }));
  });

  it('passes set-only runtime preparation through to model info loading', () => {
    const prepareSetRuntime = vi.fn().mockResolvedValue(undefined);

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' prepareSetRuntime={prepareSetRuntime} />);

    expect(useAcpModelInfoMock).toHaveBeenCalledWith(expect.objectContaining({ prepareSetRuntime }));
  });

  it('shows the model submenu before the thought level submenu, each with its current value', () => {
    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    const titles = screen.getAllByTestId('submenu-title');
    // Model row first, thought-level row second (matches pill order).
    expect(titles[0]).toHaveTextContent('Model');
    expect(titles[0]).toHaveTextContent('GPT-5.2');
    expect(titles[1]).toHaveTextContent('Thinking Level');
    expect(titles[1]).toHaveTextContent('High');
  });

  it('marks the current model with the leading check indicator', () => {
    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    // Scope to the model submenu body so the title-row current value doesn't collide.
    const modelBody = screen.getAllByTestId('submenu-body')[0];
    const currentModelItem = within(modelBody).getByText('GPT-5.2').closest('[role="menuitem"]');
    const otherModelItem = within(modelBody).getByText('GPT-5.2 Mini').closest('[role="menuitem"]');

    expect(currentModelItem?.textContent?.trim().startsWith('✓')).toBe(true);
    expect(otherModelItem).not.toHaveTextContent('✓');
  });

  it('shows model descriptions in option tooltips', () => {
    useAcpModelInfoMock.mockReturnValue(
      makeResult({
        model_info: {
          current_model_id: 'default',
          current_model_label: 'Default',
          available_models: [
            { id: 'default', label: 'Default', description: 'Sonnet 4.6 · Best for everyday tasks' },
            { id: 'opus', label: 'Opus', description: 'Opus 4.8 · Most capable for complex work' },
          ],
        },
      })
    );

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    const modelBody = screen.getAllByTestId('submenu-body')[0];
    expect(screen.queryByText('Sonnet 4.6 · Best for everyday tasks')).not.toBeInTheDocument();
    expect(within(modelBody).getByText('Default').closest('[data-tooltip-content]')).toHaveAttribute(
      'data-tooltip-content',
      'Sonnet 4.6 · Best for everyday tasks'
    );
    expect(within(modelBody).getByText('Opus').closest('[data-tooltip-content]')).toHaveAttribute(
      'data-tooltip-content',
      'Opus 4.8 · Most capable for complex work'
    );
  });

  it('shows thought level descriptions in option tooltips', () => {
    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    // Thought submenu is the second one; scope to its body to avoid the title-row "High".
    const thoughtBody = screen.getAllByTestId('submenu-body')[1];
    expect(screen.queryByText('More reasoning for complex work')).not.toBeInTheDocument();
    expect(within(thoughtBody).getByText('High').closest('[data-tooltip-content]')).toHaveAttribute(
      'data-tooltip-content',
      'More reasoning for complex work'
    );
  });

  it('renders the model list directly (no submenu) when there is no thought option', () => {
    useAcpModelInfoMock.mockReturnValue(makeResult({ thoughtLevel: null }));

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    expect(screen.getByTestId('acp-model-selector')).toHaveTextContent('GPT-5.2');
    // No submenu rows at all — the dropdown is the model list itself.
    expect(screen.queryAllByTestId('submenu-title')).toHaveLength(0);
    expect(screen.getByText('GPT-5.2 Mini')).toBeInTheDocument();
  });

  it('does not show the search box when the model count is at or below the threshold', () => {
    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    expect(screen.queryByTestId('runtime-selector-model-search')).not.toBeInTheDocument();
  });

  it('shows the model search box and filters when the model count exceeds the threshold', () => {
    const manyModels = Array.from({ length: 8 }, (_, i) => ({ id: `m-${i}`, label: `Model ${i}` }));
    useAcpModelInfoMock.mockReturnValue(
      makeResult({
        thoughtLevel: null,
        model_info: { current_model_id: 'm-0', current_model_label: 'Model 0', available_models: manyModels },
      })
    );

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    const search = screen.getByTestId('runtime-selector-model-search');
    expect(search).toBeInTheDocument();
    expect(screen.getByText('Model 3')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'Model 3' } });

    expect(screen.getByText('Model 3')).toBeInTheDocument();
    expect(screen.queryByText('Model 4')).not.toBeInTheDocument();
  });

  it('shows an empty state when the search matches no model', () => {
    const manyModels = Array.from({ length: 8 }, (_, i) => ({ id: `m-${i}`, label: `Model ${i}` }));
    useAcpModelInfoMock.mockReturnValue(
      makeResult({
        thoughtLevel: null,
        model_info: { current_model_id: 'm-0', current_model_label: 'Model 0', available_models: manyModels },
      })
    );

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    fireEvent.change(screen.getByTestId('runtime-selector-model-search'), { target: { value: 'zzz' } });

    expect(screen.getByText('No matching models')).toBeInTheDocument();
  });

  it('selects a model through the config setter', () => {
    const selectModel = vi.fn();
    useAcpModelInfoMock.mockReturnValue(makeResult({ selectModel }));

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    fireEvent.click(screen.getByText('GPT-5.2 Mini'));

    expect(selectModel).toHaveBeenCalledWith('gpt-5.2-mini');
  });

  it('sets thought level through the existing config option setter', async () => {
    const setConfigOption = vi.fn().mockResolvedValue(undefined);
    useAcpModelInfoMock.mockReturnValue(makeResult({ setConfigOption }));

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    fireEvent.click(screen.getByText('Low'));

    await waitFor(() => {
      expect(setConfigOption).toHaveBeenCalledWith('thought_level', 'low');
    });
    expect(messageSuccessMock).toHaveBeenCalledWith('agent.thoughtLevel.switchSuccess');
  });

  it('keeps the old thought value and shows an error when config update fails', async () => {
    const setConfigOption = vi.fn().mockRejectedValue(new Error('command_ack'));
    useAcpModelInfoMock.mockReturnValue(makeResult({ setConfigOption }));

    render(<AcpModelSelector conversation_id='conversation-1' backend='codex' />);

    fireEvent.click(screen.getByText('Low'));

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('agent.config.commandAck');
    });
    expect(screen.getByTestId('acp-model-selector')).toHaveTextContent('GPT-5.2 · High');
  });

  it('renders setting progress at the trailing edge instead of using Arco button loading', () => {
    useAcpModelInfoMock.mockReturnValue(
      makeResult({
        model_info: {
          current_model_id: 'auto',
          current_model_label: 'Auto (Gemini 3)',
          available_models: [{ id: 'auto', label: 'Auto (Gemini 3)' }],
        },
        isSetting: true,
      })
    );

    render(<AcpModelSelector conversation_id='conv-1' backend='gemini' />);

    const button = screen.getByTestId('acp-model-selector');
    const loading = screen.getByTestId('runtime-selector-loading-indicator');

    expect(button).not.toHaveAttribute('loading');
    expect(button).toHaveTextContent('Auto (Gemini 3) · High');
    expect(loading.parentElement?.lastElementChild).toBe(loading);
  });
});
