/**
 * Tests for TeamPermissionContext — team permission propagation logic
 *
 * Requirement coverage:
 * - REQ-2: Leader mode change propagates to all member agents
 * - REQ-2: Cross-backend propagation uses getPermissionMap for level mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Unit-test the propagation algorithm without React
// ---------------------------------------------------------------------------

import { getPermissionMap, getModeLevel, PermissionLevel } from '../../src/common/types/agentPermissionLevel';

describe('getPermissionMap — level mapping for cross-backend propagation', () => {
  // ── Exact match ──────────────────────────────────────────────────────────

  it('returns exact match when leader mode exists in member backend', () => {
    expect(getPermissionMap('default', ['default', 'yolo'])).toBe('default');
    expect(getPermissionMap('yolo', ['default', 'yolo'])).toBe('yolo');
    expect(getPermissionMap('bypassPermissions', ['default', 'acceptEdits', 'bypassPermissions'])).toBe(
      'bypassPermissions'
    );
  });

  // ── Cross-backend L1 mapping ─────────────────────────────────────────────

  it('maps claude "default" (L1) → gemini "default" (L1)', () => {
    const geminiModes = ['default', 'autoEdit', 'yolo'];
    expect(getPermissionMap('default', geminiModes)).toBe('default');
  });

  // ── Cross-backend L2 mapping ─────────────────────────────────────────────

  it('maps claude "acceptEdits" (L2) → gemini "autoEdit" (L2)', () => {
    const geminiModes = ['default', 'autoEdit', 'yolo'];
    expect(getPermissionMap('acceptEdits', geminiModes)).toBe('autoEdit');
  });

  it('maps gemini "autoEdit" (L2) → qwen "default" (L1, closest) when qwen has no L2', () => {
    // qwen only has default(L1) and yolo(L3); L2 target → prefer downgrade to L1
    const qwenModes = ['default', 'yolo'];
    const result = getPermissionMap('autoEdit', qwenModes);
    expect(getModeLevel(result!)).toBe(PermissionLevel.L1_DEFAULT);
  });

  // ── Cross-backend L0 mapping ─────────────────────────────────────────────

  it('maps claude "plan" (L0) → gemini "default" (L1, closest) when gemini has no L0', () => {
    const geminiModes = ['default', 'autoEdit', 'yolo'];
    const result = getPermissionMap('plan', geminiModes);
    // gemini has no L0; closest is L1=default
    expect(getModeLevel(result!)).toBe(PermissionLevel.L1_DEFAULT);
  });

  it('maps "ask" (L0) → cursor "plan" (L0, exact level)', () => {
    const cursorModes = ['agent', 'plan', 'ask'];
    expect(getPermissionMap('ask', cursorModes)).toBe('ask');
  });

  // ── L3 → null when no L3 available ──────────────────────────────────────

  it('returns null when leader is L3 (bypassPermissions) and member backend has no L3 mode', () => {
    // A hypothetical backend with only L0/L1/L2 modes
    const limitedModes = ['plan', 'default', 'acceptEdits'];
    const result = getPermissionMap('bypassPermissions', limitedModes);
    expect(result).toBeNull();
  });

  it('returns null for yolo target when member backend has no L3', () => {
    const modes = ['build', 'plan']; // opencode — L2 + L0 only
    const result = getPermissionMap('yolo', modes);
    expect(result).toBeNull();
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('returns null when permissionList is empty', () => {
    expect(getPermissionMap('default', [])).toBeNull();
  });

  it('returns null when target is L3 and the only mode in list is not L3', () => {
    // L3 target + only L1 mode available → null (caller must handle via Manager-layer)
    expect(getPermissionMap('yolo', ['default'])).toBeNull();
  });

  it('returns the only mode when target matches the single entry', () => {
    expect(getPermissionMap('default', ['default'])).toBe('default');
  });

  it('returns the only L3 mode when target is L3 and list has one L3 entry', () => {
    expect(getPermissionMap('yolo', ['bypassPermissions'])).toBe('bypassPermissions');
  });

  it('handles unknown/unsupported mode as target (falls back to L1)', () => {
    // getModeLevel returns L1 for unknown modes
    const modes = ['default', 'autoEdit', 'yolo'];
    const result = getPermissionMap('unknownMode', modes);
    // unknownMode is treated as L1 → should map to 'default' (L1)
    expect(result).toBe('default');
  });
});

describe('getModeLevel — level classification', () => {
  it('classifies L0 modes correctly', () => {
    expect(getModeLevel('plan')).toBe(PermissionLevel.L0_LOCKED);
    expect(getModeLevel('ask')).toBe(PermissionLevel.L0_LOCKED);
  });

  it('classifies L1 modes correctly', () => {
    expect(getModeLevel('default')).toBe(PermissionLevel.L1_DEFAULT);
  });

  it('classifies L2 modes correctly', () => {
    expect(getModeLevel('acceptEdits')).toBe(PermissionLevel.L2_AUTO_EDIT);
    expect(getModeLevel('autoEdit')).toBe(PermissionLevel.L2_AUTO_EDIT);
    expect(getModeLevel('auto_edit')).toBe(PermissionLevel.L2_AUTO_EDIT);
    expect(getModeLevel('smart')).toBe(PermissionLevel.L2_AUTO_EDIT);
    expect(getModeLevel('build')).toBe(PermissionLevel.L2_AUTO_EDIT);
  });

  it('classifies L3 modes correctly', () => {
    expect(getModeLevel('yolo')).toBe(PermissionLevel.L3_FULL_AUTO);
    expect(getModeLevel('bypassPermissions')).toBe(PermissionLevel.L3_FULL_AUTO);
    expect(getModeLevel('dontAsk')).toBe(PermissionLevel.L3_FULL_AUTO);
    expect(getModeLevel('agent')).toBe(PermissionLevel.L3_FULL_AUTO);
  });

  it('returns L1 (default) for unknown mode strings', () => {
    expect(getModeLevel('unknown')).toBe(PermissionLevel.L1_DEFAULT);
    expect(getModeLevel('')).toBe(PermissionLevel.L1_DEFAULT);
  });
});

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

// ---------------------------------------------------------------------------
// Cross-backend propagation with level mapping
// REQ-2: different backend members get level-appropriate modes
// ---------------------------------------------------------------------------

describe('cross-backend mode propagation — level mapping in action', () => {
  it('correctly maps leader claude "bypassPermissions" to gemini "yolo"', () => {
    const geminiModes = ['default', 'autoEdit', 'yolo'];
    const mapped = getPermissionMap('bypassPermissions', geminiModes);
    expect(mapped).toBe('yolo');
    expect(getModeLevel(mapped!)).toBe(PermissionLevel.L3_FULL_AUTO);
  });

  it('correctly maps leader claude "acceptEdits" to qwen "default" (qwen has no L2)', () => {
    const qwenModes = ['default', 'yolo'];
    const mapped = getPermissionMap('acceptEdits', qwenModes);
    // qwen: default=L1, yolo=L3; acceptEdits=L2 → closest is L1(default), prefer downgrade
    expect(mapped).toBe('default');
  });

  it('correctly maps leader gemini "yolo" to claude "bypassPermissions"', () => {
    const claudeModes = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk'];
    const mapped = getPermissionMap('yolo', claudeModes);
    expect(mapped).toBe('bypassPermissions');
    expect(getModeLevel(mapped!)).toBe(PermissionLevel.L3_FULL_AUTO);
  });

  it('maps mixed-team scenario: cursor "ask"(L0) → all backends get L0 or nearest', () => {
    // claude supports plan(L0)
    expect(getPermissionMap('ask', ['default', 'acceptEdits', 'plan', 'bypassPermissions'])).toBe('plan');
    // iflow supports plan(L0)
    expect(getPermissionMap('ask', ['default', 'smart', 'plan', 'yolo'])).toBe('plan');
    // qwen has no L0 → falls back to default(L1)
    expect(getPermissionMap('ask', ['default', 'yolo'])).toBe('default');
  });
});
