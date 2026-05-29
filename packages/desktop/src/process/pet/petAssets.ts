/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDataPath } from '@process/utils/utils';

export type PetAssetFormat = 'svg-states' | 'codex-spritesheet';

export type PetAssetPackage = {
  id: string;
  displayName: string;
  description: string;
  format: PetAssetFormat;
  source: 'builtin' | 'custom';
  spritesheetUrl?: string;
};

type CustomPetManifest = {
  id?: unknown;
  displayName?: unknown;
  description?: unknown;
  spritesheetPath?: unknown;
};

const BUILTIN_SVG_PET: PetAssetPackage = {
  id: 'aionui-default',
  displayName: 'AionUi',
  description: '',
  format: 'svg-states',
  source: 'builtin',
};

const BUILTIN_SPRITESHEET_PETS: PetAssetPackage[] = (
  [
    ['builtin-codex', 'Codex', 'codex.webp'],
    ['builtin-dewey', 'Dewey', 'dewey.webp'],
    ['builtin-fireball', 'Fireball', 'fireball.webp'],
    ['builtin-rocky', 'Rocky', 'rocky.webp'],
    ['builtin-seedy', 'Seedy', 'seedy.webp'],
    ['builtin-stacky', 'Stacky', 'stacky.webp'],
    ['builtin-bsod', 'BSOD', 'bsod.webp'],
    ['builtin-null-signal', 'Null Signal', 'null-signal.webp'],
  ] as const
).map(
  ([id, displayName, fileName]): PetAssetPackage => ({
    id,
    displayName,
    description: '',
    format: 'codex-spritesheet',
    source: 'builtin',
    spritesheetUrl: `../pet-spritesheets/${fileName}`,
  })
);

const PET_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function getCustomPetsDir(): string {
  return path.join(getDataPath(), 'pets');
}

export async function listPetAssets(): Promise<PetAssetPackage[]> {
  const customPets = await listCustomPetAssets(getCustomPetsDir());
  return [BUILTIN_SVG_PET, ...BUILTIN_SPRITESHEET_PETS, ...customPets];
}

export async function resolvePetAsset(assetId: string | null | undefined): Promise<PetAssetPackage> {
  const assets = await listPetAssets();
  return assets.find((asset) => asset.id === assetId) ?? BUILTIN_SVG_PET;
}

export async function listCustomPetAssets(petsDir: string): Promise<PetAssetPackage[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(petsDir);
  } catch {
    return [];
  }

  const assets = await Promise.all(entries.map((entry) => readCustomPetAsset(petsDir, entry)));
  return assets.filter((asset): asset is PetAssetPackage => asset !== null);
}

async function readCustomPetAsset(petsDir: string, folderName: string): Promise<PetAssetPackage | null> {
  if (!PET_ID_PATTERN.test(folderName)) return null;

  const rootDir = path.join(petsDir, folderName);
  const manifestPath = path.join(rootDir, 'pet.json');
  let manifest: CustomPetManifest;

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as CustomPetManifest;
  } catch {
    return null;
  }

  const id = typeof manifest.id === 'string' && PET_ID_PATTERN.test(manifest.id) ? manifest.id : folderName;
  const displayName =
    typeof manifest.displayName === 'string' && manifest.displayName.trim() ? manifest.displayName : id;
  const description =
    typeof manifest.description === 'string' && manifest.description.trim() ? manifest.description : '';
  const spritesheetPath =
    typeof manifest.spritesheetPath === 'string' && manifest.spritesheetPath.trim()
      ? manifest.spritesheetPath
      : 'spritesheet.webp';

  if (path.isAbsolute(spritesheetPath) || spritesheetPath.includes('..')) return null;

  const spritesheetFile = path.join(rootDir, spritesheetPath);
  try {
    const stat = await fs.stat(spritesheetFile);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  return {
    id,
    displayName,
    description,
    format: 'codex-spritesheet',
    source: 'custom',
    spritesheetUrl: pathToFileURL(spritesheetFile).toString(),
  };
}
