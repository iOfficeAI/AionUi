/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Skills Market feature tests
 *
 * Tests the enable/disable flow for the aionui-skills builtin skill:
 * - Bundled SKILL.md content validation
 * - Enable: copy bundled SKILL.md → user builtin skills directory
 * - Disable: remove the skill directory
 * - AcpSkillManager reset on toggle
 */

// Path to the bundled SKILL.md in the project
const BUNDLED_SKILL_PATH = path.resolve(
  __dirname,
  '../../src/process/resources/skills/_builtin/aionui-skills/SKILL.md'
);

// Mock Electron app and initStorage before importing AcpSkillManager
vi.mock('electron', () => ({ app: { setName: vi.fn(), getPath: () => '/tmp/aionui-test' } }));
vi.mock('../../src/process/utils/initStorage', () => ({
  getSkillsDir: () => path.join('/tmp/aionui-test', 'skills'),
  getAutoSkillsDir: () => path.join('/tmp/aionui-test', 'skills', '_builtin'),
  getBuiltinSkillsCopyDir: () => path.join('/tmp/aionui-test', 'builtin-skills'),
}));

describe('Skills Market - Bundled SKILL.md', () => {
  it('bundled SKILL.md file exists', async () => {
    const stat = await fs.stat(BUNDLED_SKILL_PATH);
    expect(stat.isFile()).toBe(true);
  });

  it('has valid frontmatter with name and description', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();

    const frontmatter = frontmatterMatch![1];

    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    expect(nameMatch).not.toBeNull();
    expect(nameMatch![1].trim()).toBe('aionui-skills');

    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1]).toContain('AionUI Skills');
  });

  it('contains the curl command for fetching full SKILL.md', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    expect(content).toContain('curl -s https://skills.aionui.com/SKILL.md');
  });

  it('contains the 3-step setup guide', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    expect(content).toContain('Step 1');
    expect(content).toContain('Step 2');
    expect(content).toContain('Step 3');
  });

  it('references the standard credentials path', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    expect(content).toContain('~/.config/aionui-skills');
  });

  it('is concise enough for [LOAD_SKILL] injection (under 50 lines)', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(50);
  });

  it('does NOT contain the full API documentation', async () => {
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    // Full SKILL.md contains detailed API endpoints; the bundled version should not
    expect(content).not.toContain('POST /api/v1/agents/register');
    expect(content).not.toContain('GET /api/v1/skills?q=');
    expect(content).not.toContain('X-AionUI-Skills-Checksum');
  });
});

describe('Skills Market - Enable/Disable flow', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(import.meta.dirname || __dirname, 'skills-market-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('enable: creates aionui-skills directory with SKILL.md', async () => {
    const builtinDir = path.join(tmpDir, '_builtin');
    const skillDir = path.join(builtinDir, 'aionui-skills');

    // Simulate enable flow
    await fs.mkdir(skillDir, { recursive: true });
    const content = await fs.readFile(BUNDLED_SKILL_PATH, 'utf-8');
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

    // Verify
    const written = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8');
    expect(written).toBe(content);
    expect(written).toContain('name: aionui-skills');
  });

  it('disable: removes aionui-skills directory completely', async () => {
    const builtinDir = path.join(tmpDir, '_builtin');
    const skillDir = path.join(builtinDir, 'aionui-skills');

    // Setup: create the skill
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'test', 'utf-8');

    // Simulate disable flow
    await fs.rm(skillDir, { recursive: true, force: true });

    // Verify directory is gone
    await expect(fs.access(skillDir)).rejects.toThrow();
  });

  it('disable: fs.rm with force does not throw if directory does not exist', async () => {
    const skillDir = path.join(tmpDir, '_builtin', 'aionui-skills');

    // Should not throw even if directory doesn't exist
    await expect(fs.rm(skillDir, { recursive: true, force: true })).resolves.toBeUndefined();
  });
});

describe('Skills Market - AcpSkillManager integration', () => {
  it('resetInstance clears the singleton so new discoveries happen', async () => {
    const { AcpSkillManager } = await import('../../src/process/task/AcpSkillManager');

    // Get an instance (creates singleton)
    const instance1 = AcpSkillManager.getInstance();
    expect(instance1).toBeDefined();

    // Same call returns same instance
    const instance1b = AcpSkillManager.getInstance();
    expect(instance1b).toBe(instance1);

    // Reset clears it
    AcpSkillManager.resetInstance();

    // New call creates a fresh instance
    const instance2 = AcpSkillManager.getInstance();
    expect(instance2).not.toBe(instance1);

    // Cleanup
    AcpSkillManager.resetInstance();
  });
});
