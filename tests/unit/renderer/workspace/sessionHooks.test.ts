import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  getConversationEnabledHooks,
  resolveConversationHookBackend,
} from '@/renderer/pages/conversation/Workspace/utils/sessionHooks';

describe('getConversationEnabledHooks', () => {
  it('returns a normalized list of string hook names', () => {
    const conversation = {
      type: 'gemini',
      extra: {
        enabledHooks: [' prompt-guard ', '', 1, 'reviewer'],
      },
    } as unknown as TChatConversation;

    expect(getConversationEnabledHooks(conversation)).toEqual(['prompt-guard', 'reviewer']);
  });

  it('returns an empty array when enabledHooks is missing', () => {
    const conversation = {
      type: 'gemini',
      extra: {},
    } as unknown as TChatConversation;

    expect(getConversationEnabledHooks(conversation)).toEqual([]);
  });
});

describe('resolveConversationHookBackend', () => {
  it('uses the conversation type for gemini sessions', () => {
    const conversation = {
      type: 'gemini',
      extra: {},
    } as unknown as TChatConversation;

    expect(resolveConversationHookBackend(conversation)).toBe('gemini');
  });

  it('prefers extra.backend for acp sessions', () => {
    const conversation = {
      type: 'acp',
      extra: {
        backend: 'claude',
      },
    } as unknown as TChatConversation;

    expect(resolveConversationHookBackend(conversation)).toBe('claude');
  });

  it('falls back to openclaw-gateway for openclaw sessions without backend metadata', () => {
    const conversation = {
      type: 'openclaw-gateway',
      extra: {},
    } as unknown as TChatConversation;

    expect(resolveConversationHookBackend(conversation)).toBe('openclaw-gateway');
  });
});
