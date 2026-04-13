import { describe, expect, it } from 'vitest';
import { getBackendModes, getModeLevel, getPermissionMap, PermissionLevel } from '@/common/types/agentPermissionLevel';

// ── getModeLevel ─────────────────────────────────────────────────────

describe('getModeLevel', () => {
  it.each([
    ['plan', PermissionLevel.L0_LOCKED],
    ['ask', PermissionLevel.L0_LOCKED],
    ['default', PermissionLevel.L1_DEFAULT],
    ['acceptEdits', PermissionLevel.L2_AUTO_EDIT],
    ['autoEdit', PermissionLevel.L2_AUTO_EDIT],
    ['auto_edit', PermissionLevel.L2_AUTO_EDIT],
    ['smart', PermissionLevel.L2_AUTO_EDIT],
    ['build', PermissionLevel.L2_AUTO_EDIT],
    ['yolo', PermissionLevel.L3_FULL_AUTO],
    ['bypassPermissions', PermissionLevel.L3_FULL_AUTO],
    ['dontAsk', PermissionLevel.L3_FULL_AUTO],
    ['agent', PermissionLevel.L3_FULL_AUTO],
    ['auto', PermissionLevel.L3_FULL_AUTO],
    ['yoloNoSandbox', PermissionLevel.L3_FULL_AUTO],
  ])('returns correct level for %s', (mode, expected) => {
    expect(getModeLevel(mode)).toBe(expected);
  });

  it('returns L1_DEFAULT for unknown modes', () => {
    expect(getModeLevel('unknownMode')).toBe(PermissionLevel.L1_DEFAULT);
    expect(getModeLevel('')).toBe(PermissionLevel.L1_DEFAULT);
  });
});

// ── getBackendModes ──────────────────────────────────────────────────

describe('getBackendModes', () => {
  it('returns modes for known backends', () => {
    expect(getBackendModes('claude')).toContain('bypassPermissions');
    expect(getBackendModes('gemini')).toContain('yolo');
    expect(getBackendModes('cursor')).toContain('agent');
    expect(getBackendModes('codebuddy')).toContain('acceptEdits');
  });

  it('returns empty array for unknown backends', () => {
    expect(getBackendModes('unknown')).toEqual([]);
    expect(getBackendModes('')).toEqual([]);
  });

  it('claude has bypassPermissions before dontAsk (canonical ordering)', () => {
    const modes = getBackendModes('claude');
    const bpIndex = modes.indexOf('bypassPermissions');
    const daIndex = modes.indexOf('dontAsk');
    expect(bpIndex).toBeLessThan(daIndex);
  });
});

// ── getPermissionMap ─────────────────────────────────────────────────

describe('getPermissionMap', () => {
  describe('exact match', () => {
    it('returns exact match when available', () => {
      expect(getPermissionMap('yolo', ['default', 'yolo'])).toBe('yolo');
      expect(getPermissionMap('default', ['default', 'yolo'])).toBe('default');
      expect(getPermissionMap('plan', ['agent', 'plan', 'ask'])).toBe('plan');
    });
  });

  describe('closest match', () => {
    it('maps claude acceptEdits to gemini autoEdit (both L2)', () => {
      const geminiModes = getBackendModes('gemini');
      expect(getPermissionMap('acceptEdits', geminiModes)).toBe('autoEdit');
    });

    it('maps claude bypassPermissions to gemini yolo (both L3)', () => {
      const geminiModes = getBackendModes('gemini');
      expect(getPermissionMap('bypassPermissions', geminiModes)).toBe('yolo');
    });

    it('maps claude plan to cursor plan (both L0)', () => {
      const cursorModes = getBackendModes('cursor');
      expect(getPermissionMap('plan', cursorModes)).toBe('plan');
    });

    it('maps claude default to qwen default (both L1)', () => {
      const qwenModes = getBackendModes('qwen');
      expect(getPermissionMap('default', qwenModes)).toBe('default');
    });

    it('maps claude acceptEdits (L2) to qwen default (L1, closest)', () => {
      const qwenModes = getBackendModes('qwen');
      expect(getPermissionMap('acceptEdits', qwenModes)).toBe('default');
    });
  });

  describe('equidistant tiebreak (prefer downgrade)', () => {
    it('claude plan (L0) → cursor: plan found as exact L0 match', () => {
      const cursorModes = getBackendModes('cursor');
      // cursor has [agent(L3), plan(L0), ask(L0)] — plan is exact match
      expect(getPermissionMap('plan', cursorModes)).toBe('plan');
    });

    it('equidistant prefers lower level (downgrade)', () => {
      // L1 target with [L0, L2] available — equidistant, prefer L0
      expect(getPermissionMap('default', ['plan', 'autoEdit'])).toBe('plan');
    });
  });

  describe('null fallback for L3 target without L3 option', () => {
    it('returns null when target is L3 but no L3 mode available', () => {
      // opencode only has build(L2) and plan(L0) — no L3
      const opencodeModes = getBackendModes('opencode');
      expect(getPermissionMap('bypassPermissions', opencodeModes)).toBeNull();
      expect(getPermissionMap('yolo', opencodeModes)).toBeNull();
    });

    it('returns mode when target is L3 and L3 mode exists', () => {
      const geminiModes = getBackendModes('gemini');
      expect(getPermissionMap('bypassPermissions', geminiModes)).toBe('yolo');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty permission list', () => {
      expect(getPermissionMap('default', [])).toBeNull();
    });

    it('handles unknown target mode (falls back to L1)', () => {
      const geminiModes = getBackendModes('gemini');
      // Unknown mode → L1, gemini default is L1 → exact level match
      expect(getPermissionMap('unknownMode', geminiModes)).toBe('default');
    });
  });

  describe('end-to-end with real backend modes', () => {
    it.each([
      // claude → gemini
      ['bypassPermissions', 'gemini', 'yolo'],
      ['acceptEdits', 'gemini', 'autoEdit'],
      ['default', 'gemini', 'default'],
      ['plan', 'gemini', 'default'],

      // claude → qwen
      ['bypassPermissions', 'qwen', 'yolo'],
      ['default', 'qwen', 'default'],

      // claude → cursor
      ['bypassPermissions', 'cursor', 'agent'],
      ['default', 'cursor', 'plan'],
      ['plan', 'cursor', 'plan'],

      // claude → iflow
      ['bypassPermissions', 'iflow', 'yolo'],
      ['acceptEdits', 'iflow', 'smart'],
      ['plan', 'iflow', 'plan'],

      // claude → codebuddy
      ['bypassPermissions', 'codebuddy', 'bypassPermissions'],
      ['acceptEdits', 'codebuddy', 'acceptEdits'],
      ['default', 'codebuddy', 'default'],
    ])('claude %s → %s = %s', (leaderMode, memberBackend, expected) => {
      const memberModes = getBackendModes(memberBackend);
      expect(getPermissionMap(leaderMode, memberModes)).toBe(expected);
    });

    it.each([
      // L3 targets on backends without L3 → null
      ['bypassPermissions', 'opencode'],
      ['yolo', 'opencode'],
    ])('claude %s → %s = null (Manager fallback)', (leaderMode, memberBackend) => {
      const memberModes = getBackendModes(memberBackend);
      expect(getPermissionMap(leaderMode, memberModes)).toBeNull();
    });
  });
});
