/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import {
  matchesFilters,
  normalizeEntry,
  parentOf,
  sortEntries,
} from '@/renderer/components/workspace/webFsPickerUtils';

describe('normalizeEntry', () => {
  it('accepts the snake_case shape the backend actually returns', () => {
    expect(normalizeEntry({ name: 'app', full_path: '/data/app', is_dir: true, is_file: false })).toEqual({
      name: 'app',
      fullPath: '/data/app',
      isDir: true,
    });
  });

  it('accepts the camelCase shape declared by IDirOrFile', () => {
    expect(normalizeEntry({ name: 'notes.md', fullPath: '/data/notes.md', isDir: false })).toEqual({
      name: 'notes.md',
      fullPath: '/data/notes.md',
      isDir: false,
    });
  });

  it('prefers camelCase when both spellings are present', () => {
    expect(
      normalizeEntry({ name: 'app', fullPath: '/camel', full_path: '/snake', isDir: true, is_dir: false })
    ).toEqual({ name: 'app', fullPath: '/camel', isDir: true });
  });

  it('treats a missing directory flag as a file', () => {
    expect(normalizeEntry({ name: 'x', full_path: '/x' })?.isDir).toBe(false);
  });

  it.each([
    ['null', null],
    ['a primitive', 'nope'],
    ['a row without a path', { name: 'x' }],
    ['a row without a name', { full_path: '/x' }],
    ['a row with an empty path', { name: 'x', full_path: '' }],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeEntry(raw)).toBeNull();
  });
});

describe('sortEntries', () => {
  it('lists directories before files and sorts each group by name', () => {
    const sorted = sortEntries([
      { name: 'readme.md', fullPath: '/readme.md', isDir: false },
      { name: 'src', fullPath: '/src', isDir: true },
      { name: 'app', fullPath: '/app', isDir: true },
      { name: 'LICENSE', fullPath: '/LICENSE', isDir: false },
    ]);

    expect(sorted.map((e) => e.name)).toEqual(['app', 'src', 'LICENSE', 'readme.md']);
  });

  it('does not mutate its input', () => {
    const input = [
      { name: 'b', fullPath: '/b', isDir: false },
      { name: 'a', fullPath: '/a', isDir: true },
    ];
    sortEntries(input);
    expect(input.map((e) => e.name)).toEqual(['b', 'a']);
  });
});

describe('parentOf', () => {
  it.each([
    ['/data/easy-my', '/data'],
    ['/data', '/'],
    ['/', '/'],
    ['', '/'],
    ['/data/easy-my/', '/data'],
    ['/data/easy-my///', '/data'],
  ])('maps %s to %s', (input, expected) => {
    expect(parentOf(input)).toBe(expected);
  });

  it('never walks above the filesystem root', () => {
    let dir = '/a/b/c';
    for (let i = 0; i < 10; i++) dir = parentOf(dir);
    expect(dir).toBe('/');
  });
});

describe('matchesFilters', () => {
  it('accepts everything when no filter is supplied', () => {
    expect(matchesFilters('anything.bin', undefined)).toBe(true);
    expect(matchesFilters('anything.bin', [])).toBe(true);
  });

  it('matches on extension case-insensitively', () => {
    const filters = [{ name: 'Images', extensions: ['png', 'jpg'] }];
    expect(matchesFilters('logo.png', filters)).toBe(true);
    expect(matchesFilters('LOGO.PNG', filters)).toBe(true);
    expect(matchesFilters('notes.md', filters)).toBe(false);
  });

  it('treats a wildcard filter as "show everything"', () => {
    expect(matchesFilters('notes.md', [{ name: 'All', extensions: ['*'] }])).toBe(true);
  });

  it('does not hide every candidate when a filter carries no usable extension', () => {
    expect(matchesFilters('notes.md', [{ name: 'Broken', extensions: [] }])).toBe(true);
  });

  it('combines extensions across multiple filter groups', () => {
    const filters = [
      { name: 'Archives', extensions: ['zip'] },
      { name: 'Docs', extensions: ['md'] },
    ];
    expect(matchesFilters('skill.zip', filters)).toBe(true);
    expect(matchesFilters('readme.md', filters)).toBe(true);
    expect(matchesFilters('image.png', filters)).toBe(false);
  });

  it('requires a dot separator so suffix lookalikes do not match', () => {
    expect(matchesFilters('notzip', [{ name: 'Archives', extensions: ['zip'] }])).toBe(false);
  });
});
