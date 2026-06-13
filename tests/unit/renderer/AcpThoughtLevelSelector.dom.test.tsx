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
      }
    ),
    Message: {
      success: messageSuccessMock,
      error: messageErrorMock,
    },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
});
