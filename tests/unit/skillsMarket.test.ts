/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Skills Market feature tests — post-backend-migration scope only.
 *
 * The bundled `aionui-skills/SKILL.md` and its content-validation tests
 * moved into the backend (see `crates/aionui-app/assets/builtin-skills/`).
 * The local enable/disable flow tests were also backend-owned, so they
 * now live alongside that crate's tests.
 *
 * What's left here: renderer-side filesystem helpers.
 */

// Mock Electron app and initStorage before importing AcpSkillManager
vi.mock('electron', () => ({ app: { setName: vi.fn(), getPath: () => '/tmp/aionui-test' } }));
vi.mock('../../src/process/utils/initStorage', () => ({
  getSkillsDir: () => path.join('/tmp/aionui-test', 'skills'),
  getAutoSkillsDir: () => path.join('/tmp/aionui-test', 'skills', '_builtin'),
  getBuiltinSkillsCopyDir: () => path.join('/tmp/aionui-test', 'builtin-skills'),
}));

describe('Skills Market - enable/disable filesystem helpers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(import.meta.dirname || __dirname, 'skills-market-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('disable: removes aionui-skills directory completely', async () => {
    const builtinDir = path.join(tmpDir, '_builtin');
    const skillDir = path.join(builtinDir, 'aionui-skills');

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'test', 'utf-8');

    await fs.rm(skillDir, { recursive: true, force: true });

    await expect(fs.access(skillDir)).rejects.toThrow();
  });

  it('disable: fs.rm with force does not throw if directory does not exist', async () => {
    const skillDir = path.join(tmpDir, '_builtin', 'aionui-skills');

    await expect(fs.rm(skillDir, { recursive: true, force: true })).resolves.toBeUndefined();
  });
});
