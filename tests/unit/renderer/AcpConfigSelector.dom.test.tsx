import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getConfigOptions: { invoke: vi.fn() },
      setConfigOption: { invoke: vi.fn() },
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
  Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    ItemGroup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });
});
