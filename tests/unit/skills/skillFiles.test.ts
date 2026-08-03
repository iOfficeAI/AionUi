/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSkillFileService } from '@process/services/skills';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('skill file service', () => {
  let sandbox = '';
  let customSkill = '';

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-skill-files-'));
    customSkill = path.join(sandbox, 'custom', 'demo');
    await fs.mkdir(path.join(customSkill, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(customSkill, 'SKILL.md'), '# Demo', 'utf8');
    await fs.writeFile(path.join(customSkill, 'notes.md'), 'Notes', 'utf8');
    await fs.writeFile(path.join(customSkill, 'scripts', 'run.js'), 'run();', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('pins SKILL.md and returns nested files relative to the skill root', async () => {
    const service = createSkillFileService();

    const nodes = await service.list(path.join(customSkill, 'SKILL.md'));

    expect(nodes[0]?.relativePath).toBe('SKILL.md');
    expect(nodes.find((node) => node.name === 'scripts')?.children?.[0]?.relativePath).toBe('scripts/run.js');
  });

  it('rejects paths that escape the selected skill directory', async () => {
    const service = createSkillFileService();

    await expect(service.read(customSkill, '../outside.txt')).rejects.toThrow('outside the skill directory');
  });

  it('reads files from a SKILL.md location', async () => {
    const service = createSkillFileService();

    await expect(service.read(path.join(customSkill, 'SKILL.md'), 'notes.md')).resolves.toBe('Notes');
  });
});
