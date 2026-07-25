/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Assistant } from '@/common/types/agent/assistantTypes';

const resolveAgentLogoMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

// Isolate the badge from SWR / ipcBridge-backed logo fetching.
vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: (...args: unknown[]) => resolveAgentLogoMock(...args),
}));

import RuntimeBadge from '@/renderer/pages/settings/AssistantSettings/home/RuntimeBadge';

const makeAssistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  id: 'a1',
  source: 'generated',
  name: 'CLI Assistant',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  agent_id: 'agent-1',
  agent: { type: 'claude', source: 'internal' },
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  ...overrides,
});

describe('RuntimeBadge', () => {
  beforeEach(() => {
    resolveAgentLogoMock.mockReset();
    resolveAgentLogoMock.mockReturnValue(null);
  });

  it('renders the runtime label by default and hides it when showLabel is false', () => {
    const assistant = makeAssistant();
    const { rerender } = render(<RuntimeBadge assistant={assistant} />);
    expect(screen.getByText('runtime:')).toBeInTheDocument();

    rerender(<RuntimeBadge assistant={assistant} showLabel={false} />);
    expect(screen.queryByText('runtime:')).not.toBeInTheDocument();
  });

  it('shows the backend name only when showName is set', () => {
    const assistant = makeAssistant({ agent: { type: 'gemini', source: 'internal' } });
    const { rerender } = render(<RuntimeBadge assistant={assistant} />);
    expect(screen.queryByText('gemini')).not.toBeInTheDocument();

    rerender(<RuntimeBadge assistant={assistant} showName />);
    expect(screen.getByText('gemini')).toBeInTheDocument();
  });

  it('prefers acp_backend over agent type for the runtime name', () => {
    const assistant = makeAssistant({ agent: { type: 'acp', source: 'extension', acp_backend: 'claude-code' } });
    render(<RuntimeBadge assistant={assistant} showName />);
    expect(screen.getByText('claude-code')).toBeInTheDocument();
  });

  it('renders the resolved logo image when a logo is available', () => {
    resolveAgentLogoMock.mockReturnValue('http://127.0.0.1/logo.png');
    render(<RuntimeBadge assistant={makeAssistant({ id: 'with-logo' })} />);

    const badge = screen.getByTestId('assistant-runtime-with-logo');
    const img = badge.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('http://127.0.0.1/logo.png');
  });

  it('falls back to the robot icon when no logo resolves', () => {
    resolveAgentLogoMock.mockReturnValue(null);
    render(<RuntimeBadge assistant={makeAssistant({ id: 'no-logo' })} />);

    const badge = screen.getByTestId('assistant-runtime-no-logo');
    expect(badge.querySelector('img')).toBeNull();
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
