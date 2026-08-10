import type { TChatConversation } from '@/common/config/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversationOrNull, ensureConversationRuntime } = vi.hoisted(() => ({
  getConversationOrNull: vi.fn(),
  ensureConversationRuntime: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({ getConversationOrNull }));
vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({ ensureConversationRuntime }));

import {
  ensureStandaloneConversationRuntime,
  isTeamManagedRuntime,
} from '@/renderer/pages/conversation/utils/runtimeGate';

const conversation = (extra: TChatConversation['extra'] = {}): TChatConversation => ({ extra }) as TChatConversation;

describe('runtimeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes a standalone conversation runtime', async () => {
    getConversationOrNull.mockResolvedValue(conversation());

    await ensureStandaloneConversationRuntime('conversation-1');

    expect(ensureConversationRuntime).toHaveBeenCalledWith('conversation-1');
  });

  it('does not initialize a promoted team conversation runtime', async () => {
    getConversationOrNull.mockResolvedValue(conversation({ teamId: 'team-1' }));

    await ensureStandaloneConversationRuntime('conversation-1');

    expect(ensureConversationRuntime).not.toHaveBeenCalled();
  });

  it('propagates a conversation lookup failure without initializing a runtime', async () => {
    getConversationOrNull.mockRejectedValue(new Error('lookup failed'));

    await expect(ensureStandaloneConversationRuntime('conversation-1')).rejects.toThrow('lookup failed');

    expect(ensureConversationRuntime).not.toHaveBeenCalled();
  });

  it('does not classify missing or empty team ownership as team-managed', () => {
    expect(isTeamManagedRuntime(null)).toBe(false);
    expect(isTeamManagedRuntime(conversation({ teamId: '' }))).toBe(false);
  });
});
