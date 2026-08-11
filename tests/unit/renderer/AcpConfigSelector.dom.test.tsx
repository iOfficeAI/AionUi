import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    acpConfigSelectorMocks.getConfigOptions.mockReset();
    acpConfigSelectorMocks.setConfigOption.mockReset();
    acpConfigSelectorMocks.responseStreamOn.mockReset();
    acpConfigSelectorMocks.responseStreamOn.mockReturnValue(() => {});
  });

  it('shows the default Codex reasoning selector before live config options load', async () => {
    acpConfigSelectorMocks.getConfigOptions.mockResolvedValue({
      success: true,
      data: { configOptions: [] },
    });

    render(<AcpConfigSelector backend='codex' conversationId='conv-codex' />);

    expect(screen.getByRole('button')).toHaveTextContent('Medium');
    await waitFor(() => {
      expect(acpConfigSelectorMocks.getConfigOptions).toHaveBeenCalledWith({ conversationId: 'conv-codex' });
    });
  });

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

  it('updates local Codex reasoning options for the selected model capabilities', () => {
    const modelInfo = {
      currentModelId: 'gpt-5.6-sol',
      currentModelLabel: 'GPT-5.6 Sol',
      availableModels: [
        {
          id: 'gpt-5.6-sol',
          label: 'GPT-5.6 Sol',
          supportedReasoningEfforts: ['low', 'medium', 'xhigh', 'max'],
          defaultReasoningEffort: 'low',
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
      ],
      canSwitch: true,
      source: 'models' as const,
    };
    const { rerender } = render(
      <AcpConfigSelector backend='codex' modelInfo={modelInfo} selectedModelId='gpt-5.6-sol' />
    );

    expect(screen.getByText('Max')).toBeInTheDocument();

    rerender(<AcpConfigSelector backend='codex' modelInfo={modelInfo} selectedModelId='gpt-5.5' />);

    expect(screen.queryByText('Max')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('Medium');
  });

  it('shows the default aionrs ChatGPT reasoning selector before cached Guid options load', () => {
    render(
      <AcpConfigSelector
        backend='aionrs'
        fallbackCurrentModel={{
          id: 'chatgpt-provider',
          name: 'ChatGPT',
          platform: 'chatgpt',
          useModel: 'gpt-5',
          baseUrl: 'https://chatgpt.com',
          apiKey: '',
          model: ['gpt-5'],
        }}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Medium');
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
});
