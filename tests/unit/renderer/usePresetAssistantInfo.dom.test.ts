/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';

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
      if (key === 'agents.detected') {
        return {
          data: [
            {
              id: 'runtime-social',
              name: 'Gemini Runtime',
              icon: '🧩',
              agent_source: 'custom',
            },
          ],
          isLoading: false,
        };
      }
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
    });
  });

  it('falls back to custom runtime metadata when no assistant identity exists', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key === 'assistants') return { data: [], isLoading: false };
      if (key === 'extensions.acpAdapters') return { data: [], isLoading: false };
      if (key === 'agents.detected') {
        return {
          data: [
            {
              id: 'runtime-social',
              name: 'Gemini Runtime',
              icon: '🧩',
              agent_source: 'custom',
            },
          ],
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });

    const conversation = makeConversation({
      agent_id: 'runtime-social',
      backend: 'gemini',
    });

    const { result } = renderHook(() => usePresetAssistantInfo(conversation));

    expect(result.current.info).toEqual({
      name: 'Gemini Runtime',
      logo: '🧩',
      isEmoji: true,
    });
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
