/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock initStorage before importing AcpSkillManager
vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: vi.fn(() => '/mock/skills'),
  getBuiltinSkillsDir: vi.fn(() => '/mock/skills/_builtin'),
}));

// Mock ExtensionRegistry
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getSkills: () => [],
    }),
  },
}));

// Mock fs and fs/promises
const mockFiles: Record<string, string> = {};
const mockDirs: Record<string, Array<{ name: string; isDirectory: boolean; isSymbolicLink: boolean }>> = {};

vi.mock('fs', () => ({
  existsSync: (p: string) => p in mockFiles || p in mockDirs,
}));

vi.mock('fs/promises', () => ({
  default: {
    readdir: async (dirPath: string, _opts: unknown) => {
      const entries = mockDirs[dirPath];
      if (!entries) throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: 'ENOENT' });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory,
        isSymbolicLink: () => e.isSymbolicLink,
      }));
    },
    readFile: async (filePath: string, _encoding: string) => {
      const content = mockFiles[filePath];
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return content;
    },
  },
}));

function addMockSkill(dir: string, skillName: string, frontmatter: { name?: string; description?: string }) {
  const skillDir = path.join(dir, skillName);
  const skillFile = path.join(skillDir, 'SKILL.md');

  // Register directory entry
  if (!mockDirs[dir]) mockDirs[dir] = [];
  mockDirs[dir].push({ name: skillName, isDirectory: true, isSymbolicLink: false });

  // Register directory existence
  mockDirs[skillDir] = [];

  // Register SKILL.md content
  const parts: string[] = ['---'];
  if (frontmatter.name) parts.push(`name: ${frontmatter.name}`);
  if (frontmatter.description) parts.push(`description: ${frontmatter.description}`);
  parts.push('---', '', 'Skill body content');
  mockFiles[skillFile] = parts.join('\n');
}

function addMockDir(dir: string, name: string) {
  if (!mockDirs[dir]) mockDirs[dir] = [];
  mockDirs[dir].push({ name, isDirectory: true, isSymbolicLink: false });
  mockDirs[path.join(dir, name)] = [];
}

describe('AcpSkillManager - User Skills Discovery', () => {
  beforeEach(() => {
    // Clear mocks
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    Object.keys(mockDirs).forEach((k) => delete mockDirs[k]);

    // Set up base directories
    mockDirs['/mock/skills'] = [];
    mockDirs['/mock/skills/_builtin'] = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createManager() {
    // Dynamic import to get fresh module with current mocks
    const { AcpSkillManager } = await import('../../src/process/task/AcpSkillManager');
    AcpSkillManager.resetInstance();
    return AcpSkillManager.getInstance();
  }

  it('discovers user-installed skills from the skills directory', async () => {
    addMockSkill('/mock/skills', 'my-skill', { name: 'my-skill', description: 'A user skill' });
    addMockSkill('/mock/skills', 'another-skill', { name: 'another-skill', description: 'Another skill' });

    const manager = await createManager();
    await manager.discoverSkills();

    const index = manager.getSkillsIndex();
    const names = index.map((s) => s.name);
    expect(names).toContain('my-skill');
    expect(names).toContain('another-skill');
  });

  it('excludes _builtin/ directory from user skill discovery', async () => {
    addMockSkill('/mock/skills/_builtin', 'cron', { name: 'cron', description: 'Builtin cron' });
    // _builtin is a special directory, not a user skill
    mockDirs['/mock/skills'].push({ name: '_builtin', isDirectory: true, isSymbolicLink: false });

    const manager = await createManager();
    await manager.discoverSkills();

    const userIndex = manager.getUserSkillsIndex();
    const userNames = userIndex.map((s) => s.name);
    expect(userNames).not.toContain('cron');
    expect(userNames).not.toContain('_builtin');
  });

  it('skips entries already registered as builtin skills (collision → builtin wins)', async () => {
    // Add a builtin skill
    addMockSkill('/mock/skills/_builtin', 'shared-name', {
      name: 'shared-name',
      description: 'Builtin version',
    });
    // Add a user skill with same directory name
    addMockSkill('/mock/skills', 'shared-name', {
      name: 'shared-name',
      description: 'User version',
    });

    const manager = await createManager();
    await manager.discoverSkills();

    // The user version should be skipped; builtin wins
    const userIndex = manager.getUserSkillsIndex();
    expect(userIndex.map((s) => s.name)).not.toContain('shared-name');

    // But the builtin should be in the overall index
    const builtinIndex = manager.getBuiltinSkillsIndex();
    expect(builtinIndex.map((s) => s.name)).toContain('shared-name');
  });

  it('skips directories without SKILL.md', async () => {
    addMockDir('/mock/skills', 'no-skill-file');

    const manager = await createManager();
    await manager.discoverSkills();

    const userIndex = manager.getUserSkillsIndex();
    expect(userIndex).toHaveLength(0);
  });

  it('returns empty map for empty skills directory', async () => {
    // mockDirs['/mock/skills'] is already empty from beforeEach

    const manager = await createManager();
    await manager.discoverSkills();

    const userIndex = manager.getUserSkillsIndex();
    expect(userIndex).toHaveLength(0);
    expect(manager.hasAnySkills()).toBe(false);
  });

  it('handles non-existent skills directory without throwing', async () => {
    // Remove the skills directory from mocks
    delete mockDirs['/mock/skills'];

    const manager = await createManager();

    // Should not throw
    await expect(manager.discoverSkills()).resolves.not.toThrow();

    const userIndex = manager.getUserSkillsIndex();
    expect(userIndex).toHaveLength(0);
  });

  it('includes user skills in getSkillsIndex() between builtin and optional', async () => {
    addMockSkill('/mock/skills/_builtin', 'builtin-skill', {
      name: 'builtin-skill',
      description: 'A builtin',
    });
    addMockSkill('/mock/skills', 'user-skill', {
      name: 'user-skill',
      description: 'A user skill',
    });

    const manager = await createManager();
    await manager.discoverSkills();

    const index = manager.getSkillsIndex();
    const names = index.map((s) => s.name);
    expect(names).toContain('builtin-skill');
    expect(names).toContain('user-skill');

    // Builtin should appear before user skill
    const builtinIdx = names.indexOf('builtin-skill');
    const userIdx = names.indexOf('user-skill');
    expect(builtinIdx).toBeLessThan(userIdx);
  });

  it('hasSkill() finds user-installed skills', async () => {
    addMockSkill('/mock/skills', 'findable', { name: 'findable', description: 'Can be found' });

    const manager = await createManager();
    await manager.discoverSkills();

    expect(manager.hasSkill('findable')).toBe(true);
    expect(manager.hasSkill('nonexistent')).toBe(false);
  });

  it('getSkill() returns user skill definition with correct location', async () => {
    addMockSkill('/mock/skills', 'detailed', { name: 'detailed', description: 'Detailed skill' });

    const manager = await createManager();
    await manager.discoverSkills();

    const skill = await manager.getSkill('detailed');
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('detailed');
    expect(skill!.description).toBe('Detailed skill');
    expect(skill!.location).toBe(path.join('/mock/skills', 'detailed', 'SKILL.md'));
    expect(skill!.body).toBe('Skill body content');
  });

  it('discoverSkills() with empty enabledSkills still returns user skills', async () => {
    addMockSkill('/mock/skills', 'always-visible', {
      name: 'always-visible',
      description: 'Should be visible without enabledSkills',
    });

    const manager = await createManager();
    // Call with empty enabledSkills — user skills should still be discovered
    await manager.discoverSkills([]);

    const index = manager.getSkillsIndex();
    expect(index.map((s) => s.name)).toContain('always-visible');
  });

  it('discoverSkills() with enabledSkills returns both user skills and enabled optional skills', async () => {
    addMockSkill('/mock/skills', 'user-skill', { name: 'user-skill', description: 'User installed' });
    addMockSkill('/mock/skills', 'optional-skill', { name: 'optional-skill', description: 'Preset enabled' });

    const manager = await createManager();
    // Enable only 'optional-skill' — user-skill should still be discovered as a user skill
    await manager.discoverSkills(['optional-skill']);

    const index = manager.getSkillsIndex();
    const names = index.map((s) => s.name);
    expect(names).toContain('user-skill');
    expect(names).toContain('optional-skill');
  });

  it('no duplicate when user skill name matches enabledSkills entry', async () => {
    addMockSkill('/mock/skills', 'shared', { name: 'shared', description: 'Shared skill' });

    const manager = await createManager();
    // 'shared' is both a user-installed skill and in enabledSkills
    await manager.discoverSkills(['shared']);

    const index = manager.getSkillsIndex();
    const sharedEntries = index.filter((s) => s.name === 'shared');
    // Should appear only once (as user skill; optional discovery skips it)
    expect(sharedEntries).toHaveLength(1);
  });
});
