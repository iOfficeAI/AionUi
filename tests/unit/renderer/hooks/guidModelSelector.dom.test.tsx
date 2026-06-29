/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: [] }),
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'common.defaultModel') return 'Default';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch is not supported';
      return key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Brain: () => <span aria-hidden='true'>brain</span>,
  Down: () => <span aria-hidden='true'>v</span>,
  Plus: () => <span aria-hidden='true'>+</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(
    ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div data-testid='guid-model-menu' className={className}>
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
    }
  );

  return {
    Button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <button type='button' {...props}>
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
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
      <span data-tooltip-content={typeof content === 'string' ? content : undefined}>{children}</span>
    ),
  };
});

describe('GuidModelSelector', () => {
  it('shows ACP model descriptions in option tooltips', () => {
    render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={{
          current_model_id: 'default',
          current_model_label: 'Default',
          available_models: [
            {
              id: 'default',
              label: 'Default',
              description: 'Use the default model currently configured by the CLI',
            },
          ],
        }}
        selectedAcpModel='default'
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.queryByText('Use the default model currently configured by the CLI')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('guid-model-menu')).getByText('Default').closest('[data-tooltip-content]')
    ).toHaveAttribute('data-tooltip-content', 'Use the default model currently configured by the CLI');
  });
});
