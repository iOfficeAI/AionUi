/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import DefaultsSection from '@/renderer/pages/settings/AssistantSettings/editor/DefaultsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', () => {
  const Select = Object.assign(
    ({
      children,
      dropdownMenuClassName,
      'data-testid': testId,
    }: {
      children?: React.ReactNode;
      dropdownMenuClassName?: string;
      'data-testid'?: string;
    }) => (
      <div data-testid={testId} data-dropdown-class={dropdownMenuClassName ?? ''}>
        {children}
      </div>
    ),
    {
      Option: ({ children, value }: { children?: React.ReactNode; value?: string; disabled?: boolean }) => (
        <div role='option' data-value={value}>
          {children}
        </div>
      ),
    }
  );

  return {
    Button: ({ children }: { children?: React.ReactNode }) => <button type='button'>{children}</button>,
    Select,
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
      <span data-tooltip-content={typeof content === 'string' ? content : undefined}>{children}</span>
    ),
  };
});

const renderDefaultsSection = () =>
  render(
    <DefaultsSection
      localeKey='en-US'
      isBuiltin={false}
      isReadOnlyAssistant={false}
      isCreating={false}
      showSkills={false}
      defaultModelMode='auto'
      setDefaultModelMode={vi.fn()}
      defaultModelValue=''
      setDefaultModelValue={vi.fn()}
      defaultPermissionMode='auto'
      setDefaultPermissionMode={vi.fn()}
      defaultPermissionValue=''
      setDefaultPermissionValue={vi.fn()}
      defaultSkillsMode='auto'
      setDefaultSkillsMode={vi.fn()}
      defaultMcpMode='auto'
      setDefaultMcpMode={vi.fn()}
      modelOptions={[
        {
          key: 'default',
          value: 'default',
          label: 'Default',
          description: 'Use the default model currently configured by the CLI',
        },
      ]}
      permissionOptions={[
        {
          value: 'bypassPermissions',
          label: 'Bypass Permissions',
          description: 'Run without permission prompts',
        },
      ]}
      editableSkillOptions={[]}
      selectedSkillValues={[]}
      enabledMcpServers={[]}
      selectedMcpIds={[]}
      setSelectedMcpIds={vi.fn()}
      handleSkillSelectionChange={vi.fn()}
      selectedItemsLabel={(count) => `${count} selected`}
      autoDefaultOptionLabel='Remember last used automatically'
      readonlySelectionSummary={(items, emptyLabel) => (items.length > 0 ? items.join(', ') : emptyLabel)}
    />
  );

describe('DefaultsSection option descriptions', () => {
  it('renders default model descriptions in option tooltips', () => {
    renderDefaultsSection();

    expect(screen.queryByText('Use the default model currently configured by the CLI')).not.toBeInTheDocument();
    expect(screen.getByText('Default').closest('[data-tooltip-content]')).toHaveAttribute(
      'data-tooltip-content',
      'Use the default model currently configured by the CLI'
    );
    expect(screen.getByTestId('select-assistant-default-model').getAttribute('data-dropdown-class')).toBe('');
  });

  it('renders default permission descriptions in option tooltips', () => {
    renderDefaultsSection();

    expect(screen.queryByText('Run without permission prompts')).not.toBeInTheDocument();
    expect(screen.getByText('Bypass Permissions').closest('[data-tooltip-content]')).toHaveAttribute(
      'data-tooltip-content',
      'Run without permission prompts'
    );
  });
});
