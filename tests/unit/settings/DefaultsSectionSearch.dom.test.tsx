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
      showSearch,
      filterOption,
      'data-testid': testId,
    }: {
      children?: React.ReactNode;
      showSearch?: boolean;
      filterOption?: (input: string, option: React.ReactElement) => boolean;
      'data-testid'?: string;
    }) => {
      // Expose the filter behavior declaratively so tests can assert it without
      // simulating Arco's internal search input.
      const filtered =
        filterOption &&
        React.Children.toArray(children)
          .filter((child): child is React.ReactElement => React.isValidElement(child))
          .filter((child) => filterOption('SKILL-1', child))
          .map((child) => (child.props as { value?: string }).value)
          .join(',');
      return (
        <div data-testid={testId} data-show-search={showSearch ? 'true' : 'false'} data-filtered={filtered ?? ''}>
          {children}
        </div>
      );
    },
    {
      Option: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
        <div role='option' data-value={value}>
          {children}
        </div>
      ),
    }
  );

  return {
    Button: ({ children }: { children?: React.ReactNode }) => <button type='button'>{children}</button>,
    Select,
    Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
});

const makeSkillOptions = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ value: `skill-${i}`, label: `skill-${i}` }));

const makeModelOptions = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: `m-${i}`, value: `m-${i}`, label: `Model ${i}` }));

const makeMcpServers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `mcp-${i}`, name: `server-${i}` }) as never);

const renderDefaultsSection = (overrides: Partial<React.ComponentProps<typeof DefaultsSection>> = {}) =>
  render(
    <DefaultsSection
      localeKey='en-US'
      isBuiltin={false}
      isReadOnlyAssistant={false}
      isCreating={false}
      showSkills
      defaultModelMode='auto'
      setDefaultModelMode={vi.fn()}
      defaultModelValue=''
      setDefaultModelValue={vi.fn()}
      defaultPermissionMode='auto'
      setDefaultPermissionMode={vi.fn()}
      defaultPermissionValue=''
      setDefaultPermissionValue={vi.fn()}
      defaultThoughtLevelMode='auto'
      setDefaultThoughtLevelMode={vi.fn()}
      defaultThoughtLevelValue=''
      setDefaultThoughtLevelValue={vi.fn()}
      defaultSkillsMode='fixed'
      setDefaultSkillsMode={vi.fn()}
      defaultMcpMode='fixed'
      setDefaultMcpMode={vi.fn()}
      modelOptions={makeModelOptions(8)}
      permissionOptions={[]}
      showThoughtLevelDefault={false}
      thoughtLevelOptions={[]}
      editableSkillOptions={makeSkillOptions(8)}
      selectedSkillValues={[]}
      enabledMcpServers={makeMcpServers(8)}
      selectedMcpIds={[]}
      setSelectedMcpIds={vi.fn()}
      handleSkillSelectionChange={vi.fn()}
      selectedItemsLabel={(count) => `${count} selected`}
      autoDefaultOptionLabel='Remember last used automatically'
      readonlySelectionSummary={(items, emptyLabel) => (items.length > 0 ? items.join(', ') : emptyLabel)}
      {...overrides}
    />
  );

describe('DefaultsSection dropdown search', () => {
  it('enables search on model, skills and MCP selects when options exceed the threshold', () => {
    renderDefaultsSection();

    expect(screen.getByTestId('select-assistant-default-model')).toHaveAttribute('data-show-search', 'true');
    expect(screen.getByTestId('select-assistant-default-skills')).toHaveAttribute('data-show-search', 'true');
    expect(screen.getByTestId('select-assistant-default-mcp')).toHaveAttribute('data-show-search', 'true');
  });

  it('keeps search disabled when option counts stay at or below the threshold', () => {
    renderDefaultsSection({
      modelOptions: makeModelOptions(5),
      editableSkillOptions: makeSkillOptions(5),
      enabledMcpServers: makeMcpServers(5),
    });

    expect(screen.getByTestId('select-assistant-default-model')).toHaveAttribute('data-show-search', 'false');
    expect(screen.getByTestId('select-assistant-default-skills')).toHaveAttribute('data-show-search', 'false');
    expect(screen.getByTestId('select-assistant-default-mcp')).toHaveAttribute('data-show-search', 'false');
  });

  it('filters options case-insensitively while always keeping the auto option visible', () => {
    renderDefaultsSection();

    // The mock runs filterOption with input 'SKILL-1' over every option:
    // only skill-1 matches by label, plus the always-visible __AUTO__ option.
    expect(screen.getByTestId('select-assistant-default-skills')).toHaveAttribute('data-filtered', '__AUTO__,skill-1');
  });
});
