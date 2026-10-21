import { describe, expect, it } from 'vitest';
import {
  categorizeToolName,
  getToolTitleKey,
  mapAcpKindToCategory,
  TOOL_BLOCK_META,
  type ToolCategory,
} from './toolBlockConstants';

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

describe('getToolTitleKey', () => {
  it('maps known tool names to specific title keys (beyond category defaults)', () => {
    expect(getToolTitleKey('Write')).toBe('messages.toolBlocks.writeFile');
    expect(getToolTitleKey('replace_string')).toBe('messages.toolBlocks.replaceString');
    expect(getToolTitleKey('apply_patch')).toBe('messages.toolBlocks.applyPatch');
    expect(getToolTitleKey('TodoWrite')).toBe('messages.toolBlocks.todoTitle');
    expect(getToolTitleKey('Glob')).toBe('messages.toolBlocks.fileMatch');
    expect(getToolTitleKey('WebSearch')).toBe('messages.toolBlocks.webSearch');
    expect(getToolTitleKey('execute_command')).toBe('messages.toolBlocks.executeCommand');
  });

  it('maps no-underscore agent variants (gemini/codex naming)', () => {
    expect(getToolTitleKey('ReadFile')).toBe('messages.toolBlocks.readTitle');
    expect(getToolTitleKey('WriteToFile')).toBe('messages.toolBlocks.writeFile');
    expect(getToolTitleKey('ListDirectory')).toBe('messages.toolBlocks.listFilesTitle');
    expect(getToolTitleKey('SearchText')).toBe('messages.toolBlocks.searchTitle');
    expect(getToolTitleKey('GoogleWebSearch')).toBe('messages.toolBlocks.webSearch');
    expect(getToolTitleKey('DeleteFile')).toBe('messages.toolBlocks.deleteFile');
    expect(getToolTitleKey('RunCommand')).toBe('messages.toolBlocks.bashTitle');
  });

  it('returns undefined for unknown names so the caller can prettify', () => {
    expect(getToolTitleKey('SomeMcpTool')).toBeUndefined();
    expect(getToolTitleKey(undefined)).toBeUndefined();
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
