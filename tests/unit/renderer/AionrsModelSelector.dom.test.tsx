/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import AionrsModelSelector from '@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import type { AionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';

const provider: IProvider = {
  id: 'openai',
  name: 'OpenAI',
  platform: 'openai',
  use_model: 'gpt-5.2',
  models: ['gpt-5.2', 'gpt-5.2-mini'],
} as IProvider;

const thoughtLevel: AcpDerivedOption = {
  id: 'reasoning_effort',
  category: 'thought_level',
  currentValue: 'high',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
};

const makeSelection = (overrides: Partial<AionrsModelSelection> = {}): AionrsModelSelection => ({
  current_model: {
    ...provider,
    use_model: 'gpt-5.2',
  } as TProviderWithModel,
  providers: [provider],
  getAvailableModels: () => ['gpt-5.2', 'gpt-5.2-mini'],
  handleSelectModel: vi.fn().mockResolvedValue(undefined),
  getDisplayModelName: (modelName?: string) => modelName ?? '',
  ...overrides,
});

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ isOpen: false }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
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
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === 'agent.thoughtLevel.label') return 'Thinking Level';
      if (key === 'conversation.welcome.selectModel') return 'Select model';
      if (key === 'conversation.welcome.useCliModel') return 'Use CLI model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch is not supported';
      if (key === 'common.defaultModel') return 'Default';
      return options?.defaultValue ?? key;
    },
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(
    ({ children }: { children?: React.ReactNode; className?: string }) => (
      <div data-testid='dropdown-menu'>{children}</div>
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
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

describe('AionrsModelSelector runtime options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the current model and thought level in the header pill', () => {
    render(
      <AionrsModelSelector
        selection={makeSelection()}
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'idle' }}
        onSetThoughtLevel={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByTestId('aionrs-model-selector')).toHaveTextContent('gpt-5.2 · High');
  });

  it('renders the thought level group before provider model groups', () => {
    render(
      <AionrsModelSelector
        selection={makeSelection()}
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'idle' }}
        onSetThoughtLevel={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
      'Thinking Level',
      'OpenAI',
    ]);
    expect(screen.getByTestId('runtime-selector-menu-divider')).toBeInTheDocument();
  });

  it('marks the current model with the same leading check indicator as thought level options', () => {
    render(
      <AionrsModelSelector
        selection={makeSelection()}
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'idle' }}
        onSetThoughtLevel={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const providerGroup = screen.getByRole('group', { name: 'OpenAI' });
    const currentModelItem = within(providerGroup).getByText('gpt-5.2').closest('[role="menuitem"]');
    const otherModelItem = within(providerGroup).getByText('gpt-5.2-mini').closest('[role="menuitem"]');

    expect(currentModelItem?.textContent?.trim().startsWith('\u2713')).toBe(true);
    expect(otherModelItem).not.toHaveTextContent('\u2713');
  });

  it('keeps the existing model-only label when thought level is unavailable', () => {
    render(<AionrsModelSelector selection={makeSelection()} />);

    expect(screen.getByTestId('aionrs-model-selector')).toHaveTextContent('gpt-5.2');
    expect(screen.queryByRole('group', { name: 'Thinking Level' })).not.toBeInTheDocument();
  });

  it('sets thought level through the optional runtime callback', async () => {
    const onSetThoughtLevel = vi.fn().mockResolvedValue(undefined);

    render(
      <AionrsModelSelector
        selection={makeSelection()}
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'idle' }}
        onSetThoughtLevel={onSetThoughtLevel}
      />
    );

    fireEvent.click(screen.getByText('Low'));

    await waitFor(() => {
      expect(onSetThoughtLevel).toHaveBeenCalledWith('reasoning_effort', 'low');
    });
  });

  it('ignores thought-level clicks while a config update is already running', () => {
    const onSetThoughtLevel = vi.fn().mockResolvedValue(undefined);

    render(
      <AionrsModelSelector
        selection={makeSelection()}
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'setting', optionId: 'reasoning_effort', requestedValue: 'low' }}
        onSetThoughtLevel={onSetThoughtLevel}
      />
    );

    fireEvent.click(screen.getByText('Low'));

    expect(onSetThoughtLevel).not.toHaveBeenCalled();
  });
});
