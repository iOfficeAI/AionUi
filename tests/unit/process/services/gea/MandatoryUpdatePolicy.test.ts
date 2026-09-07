import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MandatoryUpdatePolicyStore,
  type MandatoryUpdateRequirement,
} from '@process/services/gea/MandatoryUpdatePolicy';

describe('MandatoryUpdatePolicyStore', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'gea-mandatory-update-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps requirements isolated by GEA environment', async () => {
    const production = new MandatoryUpdatePolicyStore(directory, 'production');
    const staging = new MandatoryUpdatePolicyStore(directory, 'staging');
    const requirement: MandatoryUpdateRequirement = {
      versionCode: 120,
      versionName: '2.2.0',
      releaseNotes: 'Security update',
    };

    await production.save(requirement);

    await expect(production.load()).resolves.toEqual(requirement);
    await expect(staging.load()).resolves.toBeNull();
  });

  it('removes only the active environment requirement', async () => {
    const production = new MandatoryUpdatePolicyStore(directory, 'production');
    const staging = new MandatoryUpdatePolicyStore(directory, 'staging');
    await production.save({ versionCode: 120, versionName: '2.2.0', releaseNotes: '' });
    await staging.save({ versionCode: 130, versionName: '2.3.0', releaseNotes: '' });

    await production.clear();

    await expect(production.load()).resolves.toBeNull();
    await expect(staging.load()).resolves.toMatchObject({ versionCode: 130 });
  });
});
