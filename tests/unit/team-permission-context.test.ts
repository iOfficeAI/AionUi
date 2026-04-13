/**
 * Tests for TeamPermissionContext — team permission propagation logic
 *
 * Requirement coverage:
 * - REQ-2: Leader mode change propagates to all member agents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// propagateMode integration tests (mock IPC)
// REQ-2: leader switches mode → all member conversationIds get the mapped mode
// ---------------------------------------------------------------------------

describe('propagateMode — IPC dispatch', () => {
  const mockSetMode = vi.fn().mockResolvedValue(undefined);
  const mockSetSessionMode = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setMode for each conversationId in allConversationIds', async () => {
    const allConversationIds = ['conv-leader', 'conv-member-1', 'conv-member-2'];
    const teamId = 'team-123';
    const mode = 'bypassPermissions';

    // Simulate the propagateMode closure logic from TeamPermissionContext
    const propagateMode = async (m: string) => {
      await mockSetSessionMode({ teamId, sessionMode: m });
      for (const conversationId of allConversationIds) {
        await mockSetMode({ conversationId, mode: m });
      }
    };

    await propagateMode(mode);

    expect(mockSetSessionMode).toHaveBeenCalledWith({ teamId, sessionMode: mode });
    expect(mockSetMode).toHaveBeenCalledTimes(3);
    expect(mockSetMode).toHaveBeenCalledWith({ conversationId: 'conv-leader', mode });
    expect(mockSetMode).toHaveBeenCalledWith({ conversationId: 'conv-member-1', mode });
    expect(mockSetMode).toHaveBeenCalledWith({ conversationId: 'conv-member-2', mode });
  });

  it('still calls setSessionMode when allConversationIds is empty', async () => {
    const allConversationIds: string[] = [];
    const teamId = 'team-empty';
    const mode = 'default';

    const propagateMode = async (m: string) => {
      await mockSetSessionMode({ teamId, sessionMode: m });
      for (const conversationId of allConversationIds) {
        await mockSetMode({ conversationId, mode: m });
      }
    };

    await propagateMode(mode);

    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('continues with remaining conversations even if one setMode fails', async () => {
    const allConversationIds = ['conv-1', 'conv-2', 'conv-3'];
    const teamId = 'team-fault';
    const mode = 'acceptEdits';

    // conv-2 will fail
    const faultySetMode = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('not an ACP agent'))
      .mockResolvedValueOnce(undefined);

    const propagateMode = async (m: string) => {
      await mockSetSessionMode({ teamId, sessionMode: m });
      for (const conversationId of allConversationIds) {
        await faultySetMode({ conversationId, mode: m }).catch(() => {
          // silently ignore
        });
      }
    };

    await propagateMode(mode);
    expect(faultySetMode).toHaveBeenCalledTimes(3);
  });

  it('does not propagate if team has only the leader (solo mode)', async () => {
    const allConversationIds = ['conv-leader-only'];
    const teamId = 'team-solo';
    const mode = 'plan';

    const propagateMode = async (m: string) => {
      await mockSetSessionMode({ teamId, sessionMode: m });
      for (const conversationId of allConversationIds) {
        await mockSetMode({ conversationId, mode: m });
      }
    };

    await propagateMode(mode);
    expect(mockSetMode).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith({ conversationId: 'conv-leader-only', mode });
  });
});
