import { describe, expect, it } from 'vitest';
import { isSlashCommandListEnabled } from '@/common/chat/slash/availability';

describe('isSlashCommandListEnabled', () => {
  it('returns true for non-codex conversations', () => {
    expect(isSlashCommandListEnabled({ conversationType: 'gemini' })).toBe(true);
    expect(isSlashCommandListEnabled({ conversationType: 'acp' })).toBe(true);
  });

  it('returns false for codex before session_active', () => {
    expect(isSlashCommandListEnabled({ conversationType: 'codex', codexStatus: null })).toBe(false);
    expect(isSlashCommandListEnabled({ conversationType: 'codex', codexStatus: 'connecting' })).toBe(false);
    expect(isSlashCommandListEnabled({ conversationType: 'codex', codexStatus: 'connected' })).toBe(false);
  });

  it('returns true for codex when session is active', () => {
    expect(isSlashCommandListEnabled({ conversationType: 'codex', codexStatus: 'session_active' })).toBe(true);
  });

  it('handles edge cases', () => {
    // Empty/undefined conversationType defaults to enabled
    expect(isSlashCommandListEnabled({})).toBe(true);
    expect(isSlashCommandListEnabled({ conversationType: undefined })).toBe(true);

    // Unknown conversation types are enabled
    expect(isSlashCommandListEnabled({ conversationType: 'unknown-type' })).toBe(true);

    // Empty string codexStatus is not session_active
    expect(isSlashCommandListEnabled({ conversationType: 'codex', codexStatus: '' })).toBe(false);
  });
});
