/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TChatConversation } from '../../src/common/config/storage';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const swrStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('swr', () => ({
  default: vi.fn((key: string | null, _fetcher?: () => unknown) => {
    if (!key) return { data: undefined, isLoading: false };
    return { data: swrStore.get(key), isLoading: swrStore.get(`${key}:loading`) ?? false };
  }),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    extensions: {
      getAssistants: { invoke: vi.fn().mockResolvedValue([]) },
      getAcpAdapters: { invoke: vi.fn().mockResolvedValue([]) },
    },
    remoteAgent: {
      get: { invoke: vi.fn().mockResolvedValue({ name: 'RemoteBot', avatar: '🤖' }) },
    },
  },
}));

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: { get: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: [],
}));

vi.mock('../../src/renderer/assets/icons/cowork.svg', () => ({ default: 'cowork.svg' }));

vi.mock('../../src/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn(() => null),
}));

import { usePresetAssistantInfo } from '../../src/renderer/hooks/agent/usePresetAssistantInfo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(overrides: Partial<TChatConversation> = {}): TChatConversation {
  return {
    id: 'conv-1',
    name: 'Test',
    type: 'gemini',
    extra: {},
    model: '',
    status: 'finished',
    createdAt: 0,
    updatedAt: 0,
    user_id: 'u1',
    ...overrides,
  } as TChatConversation;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePresetAssistantInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrStore.clear();
  });

  it('returns null for undefined conversation', () => {
    const { result } = renderHook(() => usePresetAssistantInfo(undefined));
    expect(result.current.info).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null for conversation without presetAssistantId', () => {
    const { result } = renderHook(() => usePresetAssistantInfo(makeConversation()));
    expect(result.current.info).toBeNull();
  });

  it('returns remote agent info for remote conversation type', () => {
    swrStore.set('remote-agent.get.agent-1', { name: 'MyRemoteBot', avatar: '🚀' });

    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: { remoteAgentId: 'agent-1' },
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'MyRemoteBot',
      logo: '🚀',
      isEmoji: true,
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isLoading true while remote agent data is loading', () => {
    swrStore.set('remote-agent.get.agent-1:loading', true);

    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: { remoteAgentId: 'agent-1' },
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns null when remote agent not found', () => {
    // No data in swrStore for this key
    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: { remoteAgentId: 'missing-agent' },
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('normalizes image avatar for remote agent', () => {
    swrStore.set('remote-agent.get.agent-2', { name: 'ImageBot', avatar: 'bot.png' });

    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: { remoteAgentId: 'agent-2' },
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info?.name).toBe('ImageBot');
    expect(result.current.info?.isEmoji).toBe(false);
  });

  it('uses default emoji when remote agent has no avatar', () => {
    swrStore.set('remote-agent.get.agent-3', { name: 'NoAvatarBot' });

    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: { remoteAgentId: 'agent-3' },
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info?.logo).toBe('🤖');
    expect(result.current.info?.isEmoji).toBe(true);
  });

  it('returns null for remote conversation without remoteAgentId', () => {
    const conversation = makeConversation({
      type: 'remote' as TChatConversation['type'],
      extra: {},
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toBeNull();
  });
});
