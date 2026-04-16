import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const acpConfigSelectorMocks = vi.hoisted(() => ({
  getConfigOptions: vi.fn(),
  setConfigOption: vi.fn(),
  responseStreamOn: vi.fn(() => () => {}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getConfigOptions: { invoke: acpConfigSelectorMocks.getConfigOptions },
      setConfigOption: { invoke: acpConfigSelectorMocks.setConfigOption },
      responseStream: {
        on: acpConfigSelectorMocks.responseStreamOn,
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, className, ...props }: React.ComponentProps<'button'>) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
  Dropdown: ({ children, droplist }: React.PropsWithChildren<{ droplist?: React.ReactNode }>) => (
    <>
      {children}
      {droplist}
    </>
  ),
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    ItemGroup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Item: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <div onClick={onClick}>{children}</div>
    ),
  }),
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span data-testid='config-dropdown-icon'>Down</span>,
}));

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';

describe('AcpConfigSelector', () => {
  it('applies custom Guid button styling and leading icon for local config options', () => {
    render(
      <AcpConfigSelector
        backend='codex'
        buttonClassName='guid-config-btn'
        initialConfigOptions={[
          {
            id: 'reasoning_effort',
            type: 'select',
            category: 'config',
            currentValue: 'medium',
            selectedValue: 'medium',
            options: [
              { value: 'low', name: 'Low' },
              { value: 'medium', name: 'Medium' },
            ],
          },
        ]}
        leadingIcon={<span data-testid='guid-leading-icon'>Brain</span>}
      />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('guid-config-btn');
    expect(screen.getByTestId('guid-leading-icon')).toBeInTheDocument();
    expect(button).toHaveTextContent('Medium');
  });

  it('uses the local handler for conversation-scoped custom selectors without ACP syncing', async () => {
    const onOptionSelect = vi.fn().mockResolvedValue(true);

    render(
      <AcpConfigSelector
        backend='aionrs'
        conversationId='conv-aionrs'
        initialConfigOptions={[
          {
            id: 'reasoning_effort',
            type: 'select',
            category: 'reasoning',
            currentValue: 'medium',
            options: [
              { value: 'low', name: 'Low' },
              { value: 'medium', name: 'Medium' },
              { value: 'high', name: 'High' },
            ],
          },
        ]}
        onOptionSelect={onOptionSelect}
      />
    );

    fireEvent.click(screen.getByText('High'));

    await waitFor(() => {
      expect(onOptionSelect).toHaveBeenCalledWith('reasoning_effort', 'high');
    });

    expect(acpConfigSelectorMocks.getConfigOptions).not.toHaveBeenCalled();
    expect(acpConfigSelectorMocks.responseStreamOn).not.toHaveBeenCalled();
    expect(acpConfigSelectorMocks.setConfigOption).not.toHaveBeenCalled();
  });

  it('renders codex Guid reasoning defaults from preselected config options', () => {
    render(
      <AcpConfigSelector
        backend='codex'
        buttonClassName='guid-config-btn'
        initialConfigOptions={[
          {
            id: 'model_reasoning_effort',
            type: 'select',
            category: 'reasoning',
            currentValue: 'high',
            selectedValue: 'high',
            options: [
              { value: 'medium', name: 'Medium' },
              { value: 'high', name: 'High' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('High');
  });

  it('renders aionrs ChatGPT reasoning defaults from preselected config options', () => {
    render(
      <AcpConfigSelector
        backend='aionrs'
        buttonClassName='guid-config-btn'
        initialConfigOptions={[
          {
            id: 'reasoning_effort',
            type: 'select',
            category: 'reasoning',
            currentValue: 'minimal',
            selectedValue: 'minimal',
            options: [
              { value: 'minimal', name: 'Minimal' },
              { value: 'medium', name: 'Medium' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Minimal');
  });
});
