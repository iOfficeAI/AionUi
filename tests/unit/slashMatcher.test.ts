import { describe, expect, it } from 'vitest';
import { matchSlashQuery } from '@/renderer/hooks/chat/useSlashCommandController';

describe('matchSlashQuery', () => {
  it('matches slash pattern ^/([a-zA-Z0-9_-]*)$', () => {
    expect(matchSlashQuery('/')).toBe('');
    expect(matchSlashQuery('/abc')).toBe('abc');
    expect(matchSlashQuery('/abc-def')).toBe('abc-def');
    expect(matchSlashQuery('/abc def')).toBeNull();
    expect(matchSlashQuery(' /abc')).toBeNull();
  });

  it('handles edge cases', () => {
    // Empty string
    expect(matchSlashQuery('')).toBeNull();

    // Plain text without slash
    expect(matchSlashQuery('hello')).toBeNull();

    // Alphanumeric with underscore and hyphen
    expect(matchSlashQuery('/test_command-123')).toBe('test_command-123');

    // Slash in command name is not allowed (no longer matches)
    expect(matchSlashQuery('/abc/def')).toBeNull();

    // Tab after slash (whitespace breaks match)
    expect(matchSlashQuery('/abc\tdef')).toBeNull();

    // Special characters not allowed
    expect(matchSlashQuery('/abc@def')).toBeNull();
    expect(matchSlashQuery('/abc.def')).toBeNull();
  });

  it('only matches at start of string', () => {
    expect(matchSlashQuery('hello /world')).toBeNull();
    expect(matchSlashQuery('/world')).toBe('world');
  });
});
