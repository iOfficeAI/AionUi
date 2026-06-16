/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { resolveAssistantConfigId, usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';

const useSWRMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn() },
    },
    extensions: {
      getAcpAdapters: { invoke: vi.fn() },
    },
    remoteAgent: {
      get: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (value: string | undefined) => value,
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: (...args: unknown[]) => useSWRMock(...args),
}));

describe('usePresetAssistantInfo', () => {
  beforeEach(() => {
    useSWRMock.mockReset();
  });

  it('prefers preset assistant avatar over custom runtime metadata when both identities exist', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') {
        return {
          data: [
            {
              id: 'assistant-social',
              name: 'Social Job Publisher',
              avatar: 'http://127.0.0.1:56663/api/assistants/social-job-publisher/avatar',
              name_i18n: {},
            },
          ],
          isLoading: false,
        };
      }
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      agent_id: 'runtime-social',
      custom_agent_id: 'assistant-social',
      preset_assistant_id: 'assistant-social',
      backend: 'gemini',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Social Job Publisher',
      logo: 'http://127.0.0.1:56663/api/assistants/social-job-publisher/avatar',
      isEmoji: false,
      assistantId: 'assistant-social',
    });
  });

  it('falls back to custom runtime metadata when no assistant identity exists', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') return { data: [], isLoading: false };
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      agent_id: 'runtime-social',
      agent_name: 'Gemini Runtime',
      backend: 'gemini',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Gemini Runtime',
      logo: '🤖',
      isEmoji: true,
    });
  });

  it('falls back to custom runtime metadata when legacy custom_agent_id is only a runtime row id', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') return { data: [], isLoading: false };
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      custom_agent_id: 'runtime-social',
      agent_name: 'Gemini Runtime',
      backend: 'gemini',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Gemini Runtime',
      logo: '🤖',
      isEmoji: true,
    });
  });

  it('restores assistant info from a legacy custom_agent_id when it still matches an assistant id', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') {
        return {
          data: [
            {
              id: 'assistant-legacy',
              name: 'Legacy Planner',
              avatar: '🧭',
              name_i18n: {},
            },
          ],
          isLoading: false,
        };
      }
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      custom_agent_id: 'assistant-legacy',
      backend: 'claude',
      preset_context: '# Legacy Planner',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Legacy Planner',
      logo: '🧭',
      isEmoji: true,
      assistantId: 'assistant-legacy',
    });
  });

  it('falls back to a capitalized backend name when legacy runtime rows lack agent_name', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') return { data: [], isLoading: false };
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      agent_id: 'runtime-social',
      backend: 'openclaw-gateway',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Openclaw Gateway',
      logo: '🤖',
      isEmoji: true,
    });
  });

  it('treats legacy custom_agent_id as runtime-only when resolving explicit assistant identity', () => {
    expect(
      resolveAssistantConfigId(
        makeConversation({
          custom_agent_id: 'runtime-social',
        })
      )
    ).toBeNull();

    expect(
      resolveAssistantConfigId(
        makeConversation({
          preset_assistant_id: 'assistant-modern',
          custom_agent_id: 'runtime-social',
        })
      )
    ).toBe('assistant-modern');
  });
});

function makeConversation(extra: Record<string, unknown>): TChatConversation {
  return {
    id: 'conv-1',
    user_id: 'user-1',
    name: '测试',
    type: 'acp',
    model: {},
    extra,
    status: 'finished',
    source: 'aionui',
    created_at: 1,
    modified_at: 1,
    pinned: false,
  } as TChatConversation;
}
