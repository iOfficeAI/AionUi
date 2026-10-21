/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgentRuntimeCatalog: () => [
    { id: 'agent-antigravity', name: 'Antigravity', backend: 'antigravity', command: 'agy' },
  ],
}));

describe('AssistantSelectionArea favorites', () => {
  it('renders a favorite toggle on front-row pills and toggles the pinned id', () => {
    const onToggleFavorite = vi.fn();
    const onReorderFavorites = vi.fn();

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={['writer']}
          onToggleFavorite={onToggleFavorite}
          onReorderFavorites={onReorderFavorites}
        />
      </ConfigProvider>
    );

    const writerToggle = screen.getByTestId('assistant-favorite-toggle-writer');
    const coworkToggle = screen.getByTestId('assistant-favorite-toggle-cowork');
    expect(writerToggle.getAttribute('data-favorite')).toBe('true');
    expect(coworkToggle.getAttribute('data-favorite')).toBe('false');

    fireEvent.click(writerToggle);
    expect(onToggleFavorite).toHaveBeenCalledWith('writer');

    fireEvent.click(coworkToggle);
    expect(onToggleFavorite).toHaveBeenCalledWith('cowork');
  });

  it('toggles the favorite via keyboard on the pin button', () => {
    const onToggleFavorite = vi.fn();

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={['writer']}
          onToggleFavorite={onToggleFavorite}
          onReorderFavorites={vi.fn()}
        />
      </ConfigProvider>
    );

    const writerToggle = screen.getByTestId('assistant-favorite-toggle-writer');
    fireEvent.keyDown(writerToggle, { key: 'Enter' });
    expect(onToggleFavorite).toHaveBeenCalledWith('writer');

    fireEvent.keyDown(writerToggle, { key: ' ' });
    expect(onToggleFavorite).toHaveBeenCalledTimes(2);
  });

  it('keeps behaviour identical when favorite props are absent', () => {
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

    expect(screen.queryByTestId('assistant-favorite-toggle-writer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-drag-handle-writer')).not.toBeInTheDocument();

    const presetPills = screen
      .getAllByTestId(/preset-pill-/)
      .map((element) => element.getAttribute('data-testid')?.replace('preset-pill-', ''));
    expect(presetPills).toEqual(['writer', 'cowork']);

    fireEvent.click(screen.getByTestId('preset-pill-cowork'));
    expect(onSelectAssistant).toHaveBeenCalledWith('cowork');
  });

  it('renders the pinned front row in pinned order when favorites exist', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='writer'
          assistants={[...assistants(), thirdAssistant('reviewer')]}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={['reviewer', 'writer']}
          onToggleFavorite={vi.fn()}
          onReorderFavorites={vi.fn()}
        />
      </ConfigProvider>
    );

    const presetPills = screen
      .getAllByTestId(/preset-pill-/)
      .map((element) => element.getAttribute('data-testid')?.replace('preset-pill-', ''));
    expect(presetPills).toEqual(['reviewer', 'writer']);
  });

  it('passes the favorite state to overflow pills and keeps search filtering', () => {
    const onToggleFavorite = vi.fn();
    const fillers = Array.from({ length: 25 }, (_, index) =>
      overflowAssistant(`filler-${index}`, `Filler ${index}`, index + 1)
    );
    // Pin five favorites so the fifth one lands in the overflow panel.
    const favoriteIds = ['filler-0', 'filler-1', 'filler-2', 'filler-3', 'filler-4'];

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId={null}
          assistants={fillers}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onReorderFavorites={vi.fn()}
        />
      </ConfigProvider>
    );

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    const overflowToggle = screen.getByTestId('assistant-favorite-toggle-filler-4');
    expect(overflowToggle.getAttribute('data-favorite')).toBe('true');
    expect(screen.getByTestId('assistant-overflow-filler-10')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'filler 4' } });
    expect(screen.getByTestId('assistant-overflow-filler-4')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-overflow-filler-10')).not.toBeInTheDocument();
  });

  it('shows drag handles only on favorite front-row pills', () => {
    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={[...assistants(), thirdAssistant('reviewer')]}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={['reviewer']}
          onToggleFavorite={vi.fn()}
          onReorderFavorites={vi.fn()}
        />
      </ConfigProvider>
    );

    expect(screen.getByTestId('assistant-drag-handle-reviewer')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-drag-handle-writer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-drag-handle-cowork')).not.toBeInTheDocument();
  });

  it('calls onReorderFavorites with the arrayMove result after a drag', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const onReorderFavorites = vi.fn();

    try {
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const testId = this.getAttribute?.('data-testid');
        if (testId === 'assistant-drag-handle-writer-container') {
          return rect(0);
        }
        if (testId === 'assistant-drag-handle-cowork-container') {
          return rect(100);
        }
        return originalGetBoundingClientRect.call(this);
      };

      render(
        <ConfigProvider>
          <AssistantSelectionArea
            selectedAssistantId='cowork'
            assistants={assistants()}
            localeKey='en-US'
            onSelectAssistant={vi.fn()}
            favoriteAssistantIds={['writer', 'cowork']}
            onToggleFavorite={vi.fn()}
            onReorderFavorites={onReorderFavorites}
          />
        </ConfigProvider>
      );

      const handle = screen.getByTestId('assistant-drag-handle-writer');
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10, button: 0, isPrimary: true });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 130, clientY: 10, button: 0, isPrimary: true });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 150, clientY: 10, button: 0, isPrimary: true });
      fireEvent.pointerUp(document, { pointerId: 1, clientX: 150, clientY: 10, button: 0, isPrimary: true });

      expect(onReorderFavorites).toHaveBeenCalledWith(['cowork', 'writer']);
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('uses localized pin labels through favoriteLabelFn', () => {
    const favoriteLabelFn = vi.fn((isFavorite: boolean) => (isFavorite ? '取消常用助手' : '设为常用助手'));

    render(
      <ConfigProvider>
        <AssistantSelectionArea
          selectedAssistantId='cowork'
          assistants={assistants()}
          localeKey='zh-CN'
          onSelectAssistant={vi.fn()}
          favoriteAssistantIds={['writer']}
          onToggleFavorite={vi.fn()}
          onReorderFavorites={vi.fn()}
          favoriteLabelFn={favoriteLabelFn}
        />
      </ConfigProvider>
    );

    expect(favoriteLabelFn).toHaveBeenCalledWith(true);
    expect(favoriteLabelFn).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('assistant-favorite-toggle-writer').getAttribute('aria-label')).toBe('取消常用助手');
    expect(screen.getByTestId('assistant-favorite-toggle-cowork').getAttribute('aria-label')).toBe('设为常用助手');
  });

  it('does not call onReorderFavorites when a drag ends on the same item', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const onReorderFavorites = vi.fn();

    try {
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const testId = this.getAttribute?.('data-testid');
        if (testId === 'assistant-drag-handle-writer-container') {
          return rect(0);
        }
        if (testId === 'assistant-drag-handle-cowork-container') {
          return rect(100);
        }
        return originalGetBoundingClientRect.call(this);
      };

      render(
        <ConfigProvider>
          <AssistantSelectionArea
            selectedAssistantId='cowork'
            assistants={assistants()}
            localeKey='en-US'
            onSelectAssistant={vi.fn()}
            favoriteAssistantIds={['writer', 'cowork']}
            onToggleFavorite={vi.fn()}
            onReorderFavorites={onReorderFavorites}
          />
        </ConfigProvider>
      );

      const handle = screen.getByTestId('assistant-drag-handle-writer');
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10, button: 0, isPrimary: true });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 20, clientY: 10, button: 0, isPrimary: true });
      fireEvent.pointerUp(document, { pointerId: 1, clientX: 20, clientY: 10, button: 0, isPrimary: true });

      expect(onReorderFavorites).not.toHaveBeenCalled();
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});

function rect(left: number): DOMRect {
  return {
    top: 0,
    left,
    right: left + 100,
    bottom: 40,
    width: 100,
    height: 40,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function overflowAssistant(id: string, name: string, sortOrder: number): Assistant {
  return {
    id,
    source: 'builtin',
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: sortOrder,
    agent_id: `agent-${id}`,
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
  } as Assistant;
}

function thirdAssistant(id: string): Assistant {
  return {
    id,
    source: 'builtin',
    name: id,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 30,
    agent_id: `agent-${id}`,
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
  } as Assistant;
}

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
