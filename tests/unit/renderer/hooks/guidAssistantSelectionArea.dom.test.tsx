/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantSelectionArea, {
  hasTruncatedAssistantLabels,
  resolveAssistantVisibleLimit,
} from '@/renderer/pages/guid/components/AssistantSelectionArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      useMessage: () => [{ warning: vi.fn() }, <div key='message-holder' />],
    },
  };
});

describe('AssistantSelectionArea', () => {
  it('maps available width to 4, 3, 2, then 1 visible assistant slots', () => {
    expect(resolveAssistantVisibleLimit(800)).toBe(4);
    expect(resolveAssistantVisibleLimit(680)).toBe(3);
    expect(resolveAssistantVisibleLimit(520)).toBe(2);
    expect(resolveAssistantVisibleLimit(390)).toBe(1);
  });

  it('detects labels that are visually truncated', () => {
    const root = document.createElement('div');
    const label = document.createElement('span');
    label.setAttribute('data-assistant-label', 'true');
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    root.appendChild(label);

    expect(hasTruncatedAssistantLabels(root)).toBe(true);

    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 80 });

    expect(hasTruncatedAssistantLabels(root)).toBe(false);
  });

  it('keeps the assistant picker visible after an assistant is selected', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-add-preset')).not.toBeInTheDocument();
    expect(screen.queryByText('Select an assistant to start a task')).not.toBeInTheDocument();
    expect(screen.queryByText('Try these example prompts:')).not.toBeInTheDocument();
    expect(screen.queryByText('Summarize today')).not.toBeInTheDocument();
  });

  it('moves overflow assistants into a more dropdown', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // Selection lists group by source: CLI (generated) → user → official
    // (builtin). So the top row is [bare-aionrs, user-research, user-review,
    // user-translate] and the official Writer + trailing user-finance overflow.
    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-research')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-review')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-translate')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-builtin-writer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    expect(await screen.findByTestId('assistant-overflow-user-finance')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-overflow-builtin-writer')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-overflow-bare-aionrs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-overflow-user-research')).not.toBeInTheDocument();
  });

  it('limits the top assistant row when a smaller visible count is provided', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        maxVisibleAssistants={1}
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-research')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-review')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    expect(await screen.findByTestId('assistant-overflow-user-research')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-overflow-user-review')).toBeInTheDocument();
  });

  it('reports the real assistant id when a pill is selected', () => {
    const onSelectAssistant = vi.fn();

    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        onSelectAssistant={onSelectAssistant}
      />
    );

    fireEvent.click(screen.getByTestId('preset-pill-builtin-writer'));

    expect(onSelectAssistant).toHaveBeenCalledWith('builtin-writer');
  });

  it('orders assistant pills by group then sort_order before applying overflow', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={[
          mkAssistant('late', 'Late', 'user', 'claude', 90),
          mkAssistant('early', 'Early', 'user', 'claude', 5),
          ...assistants(),
          mkAssistant('mid', 'Mid', 'user', 'claude', 15),
        ]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // CLI (generated) first, then user-created by sort_order (Early 5, Mid 15,
    // Late 90); the official Writer sinks to the bottom group and overflows.
    expect(
      screen
        .getAllByRole('button')
        .slice(0, 4)
        .map((node) => node.textContent?.trim())
    ).toEqual(['Aion CLI', 'Early', 'Mid', 'Late']);
  });

  it('keeps a selected overflow assistant visible in the top pill row', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='user-finance'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // The selected overflow assistant (finance) is pulled into the top row;
    // translate (the last of the visible-4 before pull-in) drops to overflow.
    expect(screen.getByTestId('preset-pill-user-finance')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-translate')).not.toBeInTheDocument();
  });

  it('uses the last visible slot for an overflow selection at smaller visible counts', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='user-finance'
        assistants={manyAssistants()}
        localeKey='en-US'
        maxVisibleAssistants={2}
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getAllByTestId(/^preset-pill-/).map((node) => node.getAttribute('data-assistant-id'))).toEqual([
      'bare-aionrs',
      'user-finance',
    ]);
    expect(screen.queryByTestId('preset-pill-user-research')).not.toBeInTheDocument();
  });

  it('can re-render from an empty assistant catalog without breaking hook order', () => {
    const { rerender } = render(
      <AssistantSelectionArea
        selectedAssistantId={null}
        assistants={[]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(() =>
      rerender(
        <AssistantSelectionArea
          selectedAssistantId='bare-aionrs'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
        />
      )
    ).not.toThrow();

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
  });
});

function assistants(): Assistant[] {
  return [
    {
      id: 'bare-aionrs',
      source: 'generated',
      name: 'Aion CLI',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 10,
      preset_agent_type: 'aionrs',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: ['Summarize today'],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
    {
      id: 'builtin-writer',
      source: 'builtin',
      name: 'Writer',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 20,
      preset_agent_type: 'claude',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: ['Draft a post'],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
  ];
}

function manyAssistants(): Assistant[] {
  return [
    ...assistants(),
    mkAssistant('user-research', 'Researcher', 'user', 'gemini', 30),
    mkAssistant('user-review', 'Reviewer', 'user', 'codex', 40),
    mkAssistant('user-translate', 'Translator', 'user', 'qwen', 50),
    mkAssistant('user-finance', 'Finance', 'user', 'claude', 60),
  ];
}

function mkAssistant(
  id: string,
  name: string,
  source: Assistant['source'],
  preset_agent_type: string,
  sort_order: number
): Assistant {
  return {
    id,
    source,
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order,
    preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: source === 'user',
  };
}
