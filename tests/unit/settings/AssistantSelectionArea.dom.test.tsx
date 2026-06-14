/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantSelectionArea from '@/renderer/pages/guid/components/AssistantSelectionArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn(() => null),
  resolveBackendAssetUrl: vi.fn((url?: string) => url),
}));

describe('AssistantSelectionArea', () => {
  it('returns the real assistant id when a pill is selected', () => {
    const onSelectAssistant = vi.fn();

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={onSelectAssistant}
        />
      </ConfigProvider>
    );

    fireEvent.click(screen.getByTestId('preset-pill-writer'));

    expect(onSelectAssistant).toHaveBeenCalledWith('writer');
  });

  it('renders assistant pills in sort_order order', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
        />
      </ConfigProvider>
    );

    const presetPills = screen
      .getAllByTestId(/preset-pill-/)
      .map((element) => element.getAttribute('data-testid')?.replace('preset-pill-', ''));

    expect(presetPills).toEqual(['writer', 'cowork']);
  });

  it('prefers localized assistant names for the active locale', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='academic-paper'
          assistants={[
            {
              id: 'academic-paper',
              source: 'builtin',
              name: 'Academic Paper',
              name_i18n: {
                'zh-CN': '学术论文助手',
              },
              description_i18n: {},
              enabled: true,
              sort_order: 1,
              preset_agent_type: 'claude',
              enabled_skills: [],
              custom_skill_names: [],
              disabled_builtin_skills: [],
              context_i18n: {},
              prompts: ['English prompt'],
              prompts_i18n: {
                'zh-CN': ['中文提示词'],
              },
              models: [],
              agent_status: 'online',
              team_selectable: true,
              deletable: false,
            },
          ]}
          localeKey='zh-CN'
          onSelectAssistant={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.getByText('学术论文助手')).toBeInTheDocument();
    expect(screen.queryByText('Academic Paper')).not.toBeInTheDocument();
  });

  const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

  const makeAssistant = (id: string, avatar?: string) => ({
    id,
    source: 'user' as const,
    name: id,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 1,
    preset_agent_type: 'claude',
    avatar,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
  });

  const renderList = (avatar?: string) =>
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='writer'
          assistants={[makeAssistant('writer', avatar)]}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
        />
      </ConfigProvider>
    );

  it('renders an assistant card image avatar as <img>, never as raw data-URL text', () => {
    const { container } = renderList(PNG_DATA_URL);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PNG_DATA_URL);
    expect(container.textContent).not.toContain('data:image');
  });

  it('renders an emoji assistant avatar as text', () => {
    const { container } = renderList('🐙');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('🐙');
  });

  it('falls back to the Robot icon when an assistant has no avatar', () => {
    const { container } = renderList(undefined);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

function assistants(): Assistant[] {
  return [
    {
      id: 'cowork',
      source: 'builtin',
      name: 'Cowork',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 20,
      preset_agent_type: 'claude',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
    {
      id: 'writer',
      source: 'user',
      name: 'Writer',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 10,
      preset_agent_type: 'claude',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: true,
    },
  ];
}
