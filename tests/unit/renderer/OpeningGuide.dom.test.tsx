/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the first-launch opening guide (F-OPEN): the real-data loader
 * (dedupe, empty-state branch, avatar resolution) and the three-page container
 * (paging, skip, finish callback). Locks in the pure renderer-layer contract —
 * data comes only from existing backend APIs.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// t() echoes the key so copy is assertable without locale files.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

const { getManagedAgents, listAssistants, getAgentLogos } = vi.hoisted(() => ({
  getManagedAgents: vi.fn(),
  listAssistants: vi.fn(),
  getAgentLogos: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getManagedAgents: { invoke: getManagedAgents },
      getAgentLogos: { invoke: getAgentLogos },
    },
    assistants: { list: { invoke: listAssistants } },
  },
}));

import OpeningGuide from '@/renderer/pages/onboarding/OpeningGuide';
import { useOnboardingData } from '@/renderer/pages/onboarding/hooks/useOnboardingData';

const managedFixture = [
  { id: 'aionrs', backend: 'aionrs', agent_type: 'aionrs', name: 'Aion CLI', enabled: true, installed: true },
  { id: 'claude', backend: 'claude', agent_type: 'acp', name: 'Claude Code', enabled: true, installed: true },
  // Duplicate backend row — must be deduped.
  { id: 'claude-dup', backend: 'claude', agent_type: 'acp', name: 'Claude Code', enabled: true, installed: true },
  // Not installed — must be filtered out.
  { id: 'gemini', backend: 'gemini', agent_type: 'acp', name: 'Gemini CLI', enabled: true, installed: false },
];

const assistantsFixture = [
  {
    id: 'butler',
    name: 'AionUi Butler',
    enabled: true,
    avatar: '/api/assistants/butler/avatar',
    agent: { type: 'acp', acp_backend: 'claude' },
  },
  { id: 'emoji-helper', name: 'Emoji Helper', enabled: true, avatar: '🥎', agent: { type: 'aionrs' } },
  { id: 'disabled', name: 'Disabled', enabled: false, avatar: '', agent: { type: 'aionrs' } },
];

const logosFixture = [
  { backend: 'aionrs', logo: '/api/assets/logos/brand/aion.svg' },
  { backend: 'claude', logo: '/api/assets/logos/ai-major/claude.svg' },
];

const HookProbe: React.FC<{ onData: (d: ReturnType<typeof useOnboardingData>) => void }> = ({ onData }) => {
  const data = useOnboardingData();
  onData(data);
  return null;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = '#/guid';
  getManagedAgents.mockResolvedValue(managedFixture);
  listAssistants.mockResolvedValue(assistantsFixture);
  getAgentLogos.mockResolvedValue(logosFixture);
});

describe('useOnboardingData', () => {
  it('dedupes tools by backend, filters uninstalled, and keeps builtin first', async () => {
    let latest: ReturnType<typeof useOnboardingData> | undefined;
    render(<HookProbe onData={(d) => (latest = d)} />);
    await waitFor(() => expect(latest?.loading).toBe(false));

    const backends = latest!.tools.map((t) => t.backend);
    expect(backends).toEqual(['aionrs', 'claude']); // dup + uninstalled dropped
    expect(latest!.tools[0].builtin).toBe(true);
    expect(latest!.hasExternalTools).toBe(true);
  });

  it('maps assistants with avatar kinds and drops disabled ones', async () => {
    let latest: ReturnType<typeof useOnboardingData> | undefined;
    render(<HookProbe onData={(d) => (latest = d)} />);
    await waitFor(() => expect(latest?.loading).toBe(false));

    const ids = latest!.assistants.map((a) => a.id);
    expect(ids).toEqual(['butler', 'emoji-helper']);
    expect(latest!.assistants[0].avatar.kind).toBe('image');
    expect(latest!.assistants[1].avatar.kind).toBe('emoji');
  });

  it('degrades gracefully when every backend call fails', async () => {
    getManagedAgents.mockRejectedValue(new Error('down'));
    listAssistants.mockRejectedValue(new Error('down'));
    getAgentLogos.mockRejectedValue(new Error('down'));

    let latest: ReturnType<typeof useOnboardingData> | undefined;
    render(<HookProbe onData={(d) => (latest = d)} />);
    await waitFor(() => expect(latest?.loading).toBe(false));

    // Builtin AionCLI still present so the guide never renders empty.
    expect(latest!.tools.map((t) => t.backend)).toEqual(['aionrs']);
    expect(latest!.hasExternalTools).toBe(false);
    expect(latest!.assistants).toEqual([]);
  });

  it('supports the onboardingEmpty=1 QA switch (empty-state preview)', async () => {
    window.location.hash = '#/guid?onboardingEmpty=1';
    let latest: ReturnType<typeof useOnboardingData> | undefined;
    render(<HookProbe onData={(d) => (latest = d)} />);
    await waitFor(() => expect(latest?.loading).toBe(false));

    expect(latest!.hasExternalTools).toBe(false);
    expect(latest!.tools).toHaveLength(1);
  });
});

describe('OpeningGuide', () => {
  it('pages forward and only calls onFinish on the last page', async () => {
    const onFinish = vi.fn();
    render(<OpeningGuide onFinish={onFinish} />);
    await waitFor(() => expect(getManagedAgents).toHaveBeenCalled());

    // Page 1 → 2 → 3: button label flips from next to start on the last page.
    fireEvent.click(screen.getByText('onboarding.next'));
    fireEvent.click(screen.getByText('onboarding.next'));
    expect(onFinish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('onboarding.start'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skip finishes immediately from the first page', async () => {
    const onFinish = vi.fn();
    render(<OpeningGuide onFinish={onFinish} />);
    await waitFor(() => expect(getManagedAgents).toHaveBeenCalled());

    fireEvent.click(screen.getByText('onboarding.skip'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders the scanned tools from real data on page 1', async () => {
    render(<OpeningGuide onFinish={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy());
    expect(screen.getByText('Aion CLI')).toBeTruthy();
    // Uninstalled tool must not appear.
    expect(screen.queryByText('Gemini CLI')).toBeNull();
  });
});
