import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const savePreferredConfigOptionMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === 'acp.config.reasoning_effort' ? 'Reasoning Effort' : (options?.defaultValue ?? key),
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getConfigOptions: { invoke: vi.fn(() => Promise.resolve({ success: true, data: { configOptions: [] } })) },
      setConfigOption: { invoke: vi.fn(() => Promise.resolve({ success: true, data: { configOptions: [] } })) },
      responseStream: {
        on: vi.fn(() => () => {}),
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
  Dropdown: ({ children, droplist }: React.PropsWithChildren & { droplist?: React.ReactNode }) => (
    <>
      {droplist}
      {children}
    </>
  ),
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    ItemGroup: ({ children, title }: React.PropsWithChildren & { title?: React.ReactNode }) => (
      <div>
        {title}
        {children}
      </div>
    ),
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

vi.mock('@/renderer/pages/guid/hooks/agentSelectionUtils', () => ({
  savePreferredConfigOption: (...args: unknown[]) => savePreferredConfigOptionMock(...args),
}));

import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';

describe('AcpConfigSelector', () => {
  beforeEach(() => {
    savePreferredConfigOptionMock.mockReset();
  });

  it('applies custom Guid button styling and shows an explicit raw reasoning effort label', () => {
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
              { value: 'low', name: 'low' },
              { value: 'medium', name: 'medium' },
            ],
          },
        ]}
        leadingIcon={<span data-testid='guid-leading-icon'>Brain</span>}
      />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('guid-config-btn');
    expect(screen.getByTestId('guid-leading-icon')).toBeInTheDocument();
    expect(button).toHaveTextContent('Reasoning Effort: medium');
  });

  it('labels thought-level effort options as reasoning effort', () => {
    render(
      <AcpConfigSelector
        backend='claude'
        initialConfigOptions={[
          {
            id: 'effort',
            name: 'Effort',
            type: 'select',
            category: 'thought_level',
            currentValue: 'high',
            selectedValue: 'high',
            options: [
              { value: 'low', name: 'low' },
              { value: 'high', name: 'high' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('Reasoning Effort')).toBeInTheDocument();
    expect(screen.getAllByText('high').length).toBeGreaterThan(0);
  });

  it('shows default Claude reasoning effort before live config options are available', () => {
    render(<AcpConfigSelector backend='claude' conversationId='conv-1' />);

    expect(screen.getByText('Reasoning Effort')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('Reasoning Effort: medium');
    expect(screen.getAllByText('max').length).toBeGreaterThan(0);
  });

  it('shows default Codex reasoning effort before live config options are available', () => {
    render(<AcpConfigSelector backend='codex' conversationId='conv-1' />);

    expect(screen.getByText('Reasoning Effort')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('Reasoning Effort: medium');
    expect(screen.getAllByText('xhigh').length).toBeGreaterThan(0);
  });

  it('shows Codex reasoning effort when cached config options lack it', () => {
    render(
      <AcpConfigSelector
        backend='codex'
        initialConfigOptions={[
          {
            id: 'output_format',
            name: 'Output Format',
            type: 'select',
            category: 'config',
            currentValue: 'text',
            selectedValue: 'text',
            options: [
              { value: 'text', name: 'text' },
              { value: 'json', name: 'json' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /Reasoning Effort: medium/ })).toBeInTheDocument();
  });

  it('does not display an invalid cached reasoning effort value', () => {
    render(
      <AcpConfigSelector
        backend='codex'
        initialConfigOptions={[
          {
            id: 'model_reasoning_effort',
            name: 'Reasoning Effort',
            type: 'select',
            category: 'thought_level',
            currentValue: 'middle',
            selectedValue: 'middle',
            options: [
              { value: 'low', name: 'low' },
              { value: 'medium', name: 'medium' },
              { value: 'high', name: 'high' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Reasoning Effort: medium');
    expect(screen.queryByText('middle')).not.toBeInTheDocument();
  });

  it('uses the selected Codex model when building default reasoning effort options', () => {
    render(<AcpConfigSelector backend='codex' modelId='gpt-5.4/xhigh' conversationId='conv-1' />);

    expect(screen.getByText('Reasoning Effort')).toBeInTheDocument();
    expect(screen.getAllByText('xhigh').length).toBeGreaterThan(0);
  });

  it('does not show fallback reasoning effort for ACP CLI backends without known support', () => {
    render(<AcpConfigSelector backend='qwen' conversationId='conv-1' />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('saves selected conversation config option as the backend preference', async () => {
    render(<AcpConfigSelector backend='claude' conversationId='conv-1' />);

    fireEvent.click(screen.getByText('high'));

    await waitFor(() => {
      expect(savePreferredConfigOptionMock).toHaveBeenCalledWith('claude', 'effort', 'high');
    });
  });
});
