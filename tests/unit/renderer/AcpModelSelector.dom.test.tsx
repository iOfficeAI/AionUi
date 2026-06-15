/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';

const { useAcpModelInfoMock } = vi.hoisted(() => ({
  useAcpModelInfoMock: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
}));

vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: useAcpModelInfoMock,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/warmupConversation', () => ({
  warmupConversation: vi.fn(),
}));

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  Brain: () => <span aria-hidden='true'>brain</span>,
  Down: () => <span aria-hidden='true'>v</span>,
  Loading: ({ className }: { className?: string }) => <span aria-hidden='true' className={className} />,
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  });
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Menu,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'common.defaultModel' ? 'Auto' : key),
  }),
}));

describe('AcpModelSelector', () => {
  it('renders setting progress at the trailing edge instead of using Arco button loading', () => {
    useAcpModelInfoMock.mockReturnValue({
      model_info: {
        current_model_id: 'auto',
        current_model_label: 'Auto (Gemini 3)',
        available_models: [{ id: 'auto', label: 'Auto (Gemini 3)' }],
      },
      canSwitch: true,
      isSetting: true,
      selectModel: vi.fn(),
    });

    render(<AcpModelSelector conversation_id='conv-1' backend='gemini' />);

    const button = screen.getByTestId('acp-model-selector');
    const loading = screen.getByTestId('runtime-selector-loading-indicator');

    expect(button).not.toHaveAttribute('loading');
    expect(button).toHaveTextContent('Auto (Gemini 3)');
    expect(loading.parentElement?.lastElementChild).toBe(loading);
  });
});
