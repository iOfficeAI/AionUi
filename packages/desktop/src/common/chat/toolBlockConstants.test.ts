import { describe, expect, it } from 'vitest';
import { categorizeToolName, mapAcpKindToCategory, TOOL_BLOCK_META, type ToolCategory } from './toolBlockConstants';

describe('categorizeToolName', () => {
  it.each([
    ['Edit', 'edit'],
    ['edit_file', 'edit'],
    ['Replace', 'edit'],
    ['replace_string', 'edit'],
    ['WriteFile', 'edit'],
    ['Write', 'edit'],
    ['write_to_file', 'edit'],
    ['Bash', 'bash'],
    ['run_terminal_cmd', 'bash'],
    ['execute_command', 'bash'],
    ['ShellCommand', 'bash'],
    ['Read', 'read'],
    ['read_file', 'read'],
    ['ViewFile', 'read'],
    ['Grep', 'search'],
    ['Glob', 'search'],
    ['WebSearch', 'search'],
    ['Fetch', 'search'],
    ['Search', 'search'],
    ['Task', 'task'],
    ['Agent', 'task'],
    ['TodoWrite', 'todo'],
    ['todo_write', 'todo'],
  ] as Array<[string, ToolCategory]>)('maps %s -> %s', (name, expected) => {
    expect(categorizeToolName(name)).toBe(expected);
  });

  it('falls back to generic for unknown tool names', () => {
    expect(categorizeToolName('SomeMcpTool')).toBe('generic');
    expect(categorizeToolName('')).toBe('generic');
  });
});

describe('mapAcpKindToCategory', () => {
  it.each([
    ['read', 'read'],
    ['edit', 'edit'],
    ['execute', 'bash'],
    ['search', 'search'],
    ['grep', 'search'],
    ['glob', 'search'],
    ['write', 'edit'],
    ['fetch', 'search'],
    ['think', 'generic'],
  ] as Array<[string, ToolCategory]>)('maps kind %s -> %s', (kind, expected) => {
    expect(mapAcpKindToCategory(kind)).toBe(expected);
  });
});

describe('TOOL_BLOCK_META', () => {
  it('covers every category with an i18n key', () => {
    const categories: ToolCategory[] = ['edit', 'bash', 'read', 'search', 'task', 'todo', 'generic'];
    for (const c of categories) {
      expect(TOOL_BLOCK_META[c].titleKey).toMatch(/^messages\.toolBlocks\./);
    }
  });
});
