import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsPromises from 'fs/promises';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Tests for the builtin skills sync logic used in initStorage.
 * Verifies: copy new skills, overwrite modified skills, remove stale skills.
 *
 * The sync logic is inlined here (not imported from utils.ts) to avoid
 * pulling in Electron dependencies through the import chain.
 */
describe('builtin skills sync', () => {
  let tmpDir: string;
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aionui-test-'));
    srcDir = path.join(tmpDir, 'source');
    destDir = path.join(tmpDir, 'builtin-skills');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(destDir, { recursive: true });
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  // Minimal recursive copy (mirrors copyDirectoryRecursively with overwrite: true)
  const copyRecursive = async (src: string, dest: string) => {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    const entries = await fsPromises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });
        await copyRecursive(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  };

  // Recursive prune that mirrors pruneDirectoryToMatch in utils.ts:
  // removes entries in dest (at any depth) that no longer exist in src.
  const pruneRecursive = async (src: string, dest: string) => {
    if (!existsSync(src) || !existsSync(dest)) return;
    const srcEntries = await fsPromises.readdir(src, { withFileTypes: true });
    const srcByName = new Map(srcEntries.map((e) => [e.name, e]));
    const destEntries = await fsPromises.readdir(dest, { withFileTypes: true });
    for (const destEntry of destEntries) {
      const destPath = path.join(dest, destEntry.name);
      const srcEntry = srcByName.get(destEntry.name);
      if (!srcEntry) {
        await fsPromises.rm(destPath, { recursive: true, force: true });
        continue;
      }
      if (srcEntry.isDirectory() !== destEntry.isDirectory()) {
        await fsPromises.rm(destPath, { recursive: true, force: true });
        continue;
      }
      if (destEntry.isDirectory()) {
        await pruneRecursive(path.join(src, destEntry.name), destPath);
      }
    }
  };

  // Replicate the sync logic from initStorage: prune FIRST, then copy
  const syncBuiltinSkills = async () => {
    await pruneRecursive(srcDir, destDir);
    await copyRecursive(srcDir, destDir);
  };

  // Helper: create a skill directory with SKILL.md
  const createSkill = async (base: string, name: string, content: string) => {
    const dir = path.join(base, name);
    mkdirSync(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  };

  it('should copy new skills from source to dest', async () => {
    await createSkill(srcDir, 'moltbook', '# Moltbook Skill');
    await createSkill(srcDir, 'docx', '# Docx Skill');

    await syncBuiltinSkills();

    expect(existsSync(path.join(destDir, 'moltbook', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(destDir, 'docx', 'SKILL.md'))).toBe(true);
    expect(await fsPromises.readFile(path.join(destDir, 'moltbook', 'SKILL.md'), 'utf-8')).toBe('# Moltbook Skill');
  });

  it('should overwrite modified skills', async () => {
    await createSkill(srcDir, 'moltbook', '# Version 1');
    await syncBuiltinSkills();
    expect(await fsPromises.readFile(path.join(destDir, 'moltbook', 'SKILL.md'), 'utf-8')).toBe('# Version 1');

    // Update source
    await fsPromises.writeFile(path.join(srcDir, 'moltbook', 'SKILL.md'), '# Version 2', 'utf-8');
    await syncBuiltinSkills();
    expect(await fsPromises.readFile(path.join(destDir, 'moltbook', 'SKILL.md'), 'utf-8')).toBe('# Version 2');
  });

  it('should remove stale skills from dest that no longer exist in source', async () => {
    await createSkill(srcDir, 'moltbook', '# Moltbook');
    await createSkill(srcDir, 'old-skill', '# Old Skill');
    await syncBuiltinSkills();
    expect(existsSync(path.join(destDir, 'old-skill'))).toBe(true);

    // Remove old-skill from source
    await fsPromises.rm(path.join(srcDir, 'old-skill'), { recursive: true });
    await syncBuiltinSkills();

    expect(existsSync(path.join(destDir, 'moltbook'))).toBe(true);
    expect(existsSync(path.join(destDir, 'old-skill'))).toBe(false);
  });

  it('should handle add + remove in a single sync', async () => {
    await createSkill(srcDir, 'skill-a', '# A');
    await createSkill(srcDir, 'skill-b', '# B');
    await syncBuiltinSkills();

    // Remove skill-a, add skill-c
    await fsPromises.rm(path.join(srcDir, 'skill-a'), { recursive: true });
    await createSkill(srcDir, 'skill-c', '# C');
    await syncBuiltinSkills();

    const entries = readdirSync(destDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .toSorted();
    expect(entries).toEqual(['skill-b', 'skill-c']);
  });

  it('should remove stale files within a skill when the source deletes them', async () => {
    // Simulate a skill that had auxiliary files (creating.md/editing.md) later merged away
    const skillSrc = path.join(srcDir, 'officecli-xlsx');
    mkdirSync(skillSrc, { recursive: true });
    await fsPromises.writeFile(path.join(skillSrc, 'SKILL.md'), '# v1', 'utf-8');
    await fsPromises.writeFile(path.join(skillSrc, 'creating.md'), 'legacy', 'utf-8');
    await fsPromises.writeFile(path.join(skillSrc, 'editing.md'), 'legacy', 'utf-8');
    await syncBuiltinSkills();
    expect(existsSync(path.join(destDir, 'officecli-xlsx', 'creating.md'))).toBe(true);

    // Source deletes the auxiliary files; only SKILL.md remains
    await fsPromises.rm(path.join(skillSrc, 'creating.md'));
    await fsPromises.rm(path.join(skillSrc, 'editing.md'));
    await syncBuiltinSkills();

    expect(existsSync(path.join(destDir, 'officecli-xlsx', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(destDir, 'officecli-xlsx', 'creating.md'))).toBe(false);
    expect(existsSync(path.join(destDir, 'officecli-xlsx', 'editing.md'))).toBe(false);
  });

  it('should replace a dest file with a dir (or vice versa) when source changes type', async () => {
    // Source: a file named "notes" at top level
    await fsPromises.writeFile(path.join(srcDir, 'notes'), 'content', 'utf-8');
    await syncBuiltinSkills();
    expect(existsSync(path.join(destDir, 'notes'))).toBe(true);

    // Source replaces the file with a directory of the same name
    await fsPromises.rm(path.join(srcDir, 'notes'));
    mkdirSync(path.join(srcDir, 'notes'));
    await fsPromises.writeFile(path.join(srcDir, 'notes', 'README.md'), 'now a dir', 'utf-8');
    await syncBuiltinSkills();

    const stat = await fsPromises.stat(path.join(destDir, 'notes'));
    expect(stat.isDirectory()).toBe(true);
    expect(existsSync(path.join(destDir, 'notes', 'README.md'))).toBe(true);
  });
});
