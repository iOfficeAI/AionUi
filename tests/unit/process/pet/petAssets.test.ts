import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listCustomPetAssets } from '@process/pet/petAssets';

let tempDirs: string[] = [];

describe('petAssets', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it('loads custom spritesheet pets from valid manifests', async () => {
    const root = await createTempDir();
    const petDir = path.join(root, 'my-pet');
    await fs.mkdir(petDir, { recursive: true });
    await fs.writeFile(
      path.join(petDir, 'pet.json'),
      JSON.stringify({
        id: 'custom-pet',
        displayName: 'Custom Pet',
        description: 'Local spritesheet',
        spritesheetPath: 'spritesheet.webp',
      })
    );
    await fs.writeFile(path.join(petDir, 'spritesheet.webp'), 'image');

    const assets = await listCustomPetAssets(root);

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'custom-pet',
      displayName: 'Custom Pet',
      description: 'Local spritesheet',
      format: 'codex-spritesheet',
      source: 'custom',
    });
    expect(assets[0]?.spritesheetUrl).toContain('spritesheet.webp');
  });

  it('ignores manifests that try to escape the pet folder', async () => {
    const root = await createTempDir();
    const petDir = path.join(root, 'bad-pet');
    await fs.mkdir(petDir, { recursive: true });
    await fs.writeFile(path.join(petDir, 'pet.json'), JSON.stringify({ spritesheetPath: '../secret.webp' }));

    await expect(listCustomPetAssets(root)).resolves.toEqual([]);
  });

  it('returns an empty list when the custom directory does not exist', async () => {
    const root = await createTempDir();

    await expect(listCustomPetAssets(path.join(root, 'missing'))).resolves.toEqual([]);
  });
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-pet-assets-'));
  tempDirs.push(dir);
  return dir;
}
