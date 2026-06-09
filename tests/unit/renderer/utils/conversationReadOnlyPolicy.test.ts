import { describe, expect, it } from 'vitest';

import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';

describe('conversation read-only policy', () => {
  it('marks deprecated runtime conversations as read-only', () => {
    expect(isLegacyReadOnlyConversationType('acp')).toBe(false);
    expect(isLegacyReadOnlyConversationType('aionrs')).toBe(false);

    expect(isLegacyReadOnlyConversationType('codex')).toBe(true);
    expect(isLegacyReadOnlyConversationType('openclaw-gateway')).toBe(true);
    expect(isLegacyReadOnlyConversationType('nanobot')).toBe(true);
    expect(isLegacyReadOnlyConversationType('remote')).toBe(true);
    expect(isLegacyReadOnlyConversationType('gemini')).toBe(true);
  });

  it('does not mark missing type as read-only', () => {
    expect(isLegacyReadOnlyConversationType(undefined)).toBe(false);
    expect(isLegacyReadOnlyConversationType(null)).toBe(false);
  });
});
