/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; count?: number; name?: string }) => {
      let s = options?.defaultValue ?? _key;
      if (options?.count !== undefined) s = s.replace('{{count}}', String(options.count));
      if (options?.name !== undefined) s = s.replace('{{name}}', options.name);
      return s;
    },
  }),
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-identity' />,
}));

import TeamWarmupOverlay from '@/renderer/pages/team/components/TeamWarmupOverlay';
import type { TeamAssistant, TeamAgentRuntimeStatus } from '@/common/types/team/teamTypes';
import type { TeamWarmupMemberState } from '@/renderer/pages/team/hooks/useTeamWarmup';

function assistant(slot_id: string, role: 'leader' | 'teammate', name: string): TeamAssistant {
  return {
    slot_id,
    conversation_id: `conv-${slot_id}`,
    role,
    assistant_backend: 'codex',
    assistant_name: name,
    status: 'idle',
  } as TeamAssistant;
}

function runtime(entries: Array<[string, TeamAgentRuntimeStatus, string?]>): Map<string, TeamWarmupMemberState> {
  return new Map(entries.map(([slot, status, error]) => [slot, { status, error }]));
}

const colorOf = () => '#7583b2';

describe('TeamWarmupOverlay failure states', () => {
  it('renders a single-member failure with its simplified error', () => {
    render(
      <TeamWarmupOverlay
        phase='error'
        assistants={[assistant('l', 'leader', 'Codex'), assistant('m', 'teammate', 'Aion CLI')]}
        runtimeStatus={runtime([
          ['l', 'ready'],
          ['m', 'failed', "Invalid request: Bad request: Provider 'aionrs' not found"],
        ])}
        colorOf={colorOf}
        onRetry={() => {}}
      />
    );
    // single failure → title names the member
    expect(screen.getByText('Member Aion CLI failed to start')).toBeInTheDocument();
    // error is simplified (wrapper prefixes stripped)
    expect(screen.getByTestId('team-warmup-error')).toHaveTextContent("Provider 'aionrs' not found");
    // teammate is removable → hint mentions removal
    expect(screen.getByText(/remove the member/i)).toBeInTheDocument();
  });

  it('summarises multiple failures as a scrollable per-member list', () => {
    render(
      <TeamWarmupOverlay
        phase='error'
        assistants={[
          assistant('l', 'leader', 'Gemini'),
          assistant('a', 'teammate', 'Aion CLI'),
          assistant('c', 'teammate', 'CodeBuddy'),
        ]}
        runtimeStatus={runtime([
          ['l', 'failed', 'ACP error'],
          ['a', 'failed', "Bad request: Provider 'aionrs' not found"],
          ['c', 'ready'],
        ])}
        colorOf={colorOf}
        onRetry={() => {}}
      />
    );
    // multi failure → count title
    expect(screen.getByText('2 members failed to start')).toBeInTheDocument();
    // each failed member listed with its (simplified) error
    const box = screen.getByTestId('team-warmup-error');
    expect(box).toHaveTextContent('Gemini');
    expect(box).toHaveTextContent('ACP error');
    expect(box).toHaveTextContent('Aion CLI');
    expect(box).toHaveTextContent("Provider 'aionrs' not found");
    // a teammate is among the failures → removal is offered
    expect(screen.getByText(/remove the member/i)).toBeInTheDocument();
  });

  it('offers only model-switching when the sole failure is the lead', () => {
    render(
      <TeamWarmupOverlay
        phase='error'
        assistants={[assistant('l', 'leader', 'Gemini'), assistant('m', 'teammate', 'Codex')]}
        runtimeStatus={runtime([['l', 'failed', 'ACP error']])}
        colorOf={colorOf}
        onRetry={() => {}}
      />
    );
    expect(screen.getByText('Lead Gemini failed to start')).toBeInTheDocument();
    // lead is not removable → hint must not mention removal
    expect(screen.queryByText(/remove the member/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Switch its model/i)).toBeInTheDocument();
  });

  it('renders nothing when ready', () => {
    const { container } = render(
      <TeamWarmupOverlay phase='ready' assistants={[]} runtimeStatus={runtime([])} colorOf={colorOf} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
