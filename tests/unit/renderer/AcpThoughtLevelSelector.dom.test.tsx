/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import AcpThoughtLevelSelector from '@/renderer/components/agent/AcpThoughtLevelSelector';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

const { messageSuccessMock, messageErrorMock } = vi.hoisted(() => ({
  messageSuccessMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'agent.thoughtLevel.label' ? 'Thinking Level' : key),
  }),
}));

vi.mock('@arco-design/web-react', () => {
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
    Menu: Object.assign(
      ({ children }: { children?: React.ReactNode }) => <div data-testid='thought-menu'>{children}</div>,
      {
        Item: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
          <div onClick={onClick}>{children}</div>
        ),
        ItemGroup: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
          <div>
            <div data-testid='thought-menu-title'>{title}</div>
            {children}
          </div>
        ),
      }
    ),
    Message: {
      success: messageSuccessMock,
      error: messageErrorMock,
    },
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
      <div data-testid='thought-tooltip' data-content={String(content)}>
        {children}
      </div>
    ),
  };
});

const thoughtLevel: AcpDerivedOption = {
  id: 'effort',
  category: 'thought_level',
  currentValue: 'low',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
};

describe('AcpThoughtLevelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current thought level when the agent exposes a thought_level option', () => {
    render(<AcpThoughtLevelSelector thoughtLevel={thoughtLevel} setStatus={{ state: 'idle' }} onSetOption={vi.fn()} />);

    expect(screen.getByTestId('acp-thought-level-selector')).toHaveTextContent('Low');
  });

  it('shows the localized thought label inside the menu instead of a hover tooltip', () => {
    render(<AcpThoughtLevelSelector thoughtLevel={thoughtLevel} setStatus={{ state: 'idle' }} onSetOption={vi.fn()} />);

    expect(screen.getByTestId('thought-menu-title')).toHaveTextContent('Thinking Level');
    expect(screen.queryByTestId('thought-tooltip')).not.toBeInTheDocument();
  });

  it('does not render when thought_level is unavailable', () => {
    const { container } = render(
      <AcpThoughtLevelSelector thoughtLevel={null} setStatus={{ state: 'idle' }} onSetOption={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('sets the selected thought level through ACP config options', async () => {
    const onSetOption = vi.fn().mockResolvedValue(undefined);
    render(
      <AcpThoughtLevelSelector thoughtLevel={thoughtLevel} setStatus={{ state: 'idle' }} onSetOption={onSetOption} />
    );

    fireEvent.click(screen.getByText('High'));

    await waitFor(() => {
      expect(onSetOption).toHaveBeenCalledWith('effort', 'high');
    });
    expect(messageSuccessMock).toHaveBeenCalled();
  });

  it('can render as icon-only while keeping the selectable menu', async () => {
    const onSetOption = vi.fn().mockResolvedValue(undefined);
    render(
      <AcpThoughtLevelSelector
        thoughtLevel={thoughtLevel}
        setStatus={{ state: 'idle' }}
        onSetOption={onSetOption}
        iconOnly
      />
    );

    expect(screen.getByTestId('acp-thought-level-selector')).not.toHaveTextContent('Low');
    expect(screen.getByTestId('thought-menu-title')).toHaveTextContent('Thinking Level');

    fireEvent.click(screen.getByText('High'));

    await waitFor(() => {
      expect(onSetOption).toHaveBeenCalledWith('effort', 'high');
    });
  });

  it('renders setting progress at the trailing edge instead of using Arco button loading', () => {
    render(
      <AcpThoughtLevelSelector thoughtLevel={thoughtLevel} setStatus={{ state: 'setting' }} onSetOption={vi.fn()} />
    );

    const button = screen.getByTestId('acp-thought-level-selector');
    const loading = screen.getByTestId('runtime-selector-loading-indicator');

    expect(button).not.toHaveAttribute('loading');
    expect(button).toHaveTextContent('Low');
    expect(loading.parentElement?.lastElementChild).toBe(loading);
  });
});
