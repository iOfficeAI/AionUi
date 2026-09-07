/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { GeaClientError } from '@/common/adapter/geaClient';

const requirementSchema = z.object({
  versionCode: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  versionName: z.string().min(1).max(50),
  releaseNotes: z.string(),
});

export type MandatoryUpdateRequirement = z.infer<typeof requirementSchema>;

const policySchema = z.object({
  schemaVersion: z.literal(1),
  environmentId: z.string().min(1),
  requirement: requirementSchema,
});

/** Stores one requirement per GEA environment without retaining download tickets. */
export class MandatoryUpdatePolicyStore {
  private readonly filePath: string;

  constructor(
    private readonly userDataDirectory: string,
    private readonly environmentId: string
  ) {
    const key = createHash('sha256').update(environmentId).digest('hex');
    this.filePath = path.join(userDataDirectory, 'gea-mandatory-updates', `${key}.json`);
  }

  async load(): Promise<MandatoryUpdateRequirement | null> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const parsed = policySchema.safeParse(JSON.parse(contents));
    if (!parsed.success || parsed.data.environmentId !== this.environmentId) {
      throw new GeaClientError('CLIENT_MANDATORY_POLICY_INVALID');
    }
    return parsed.data.requirement;
  }

  async save(requirement: MandatoryUpdateRequirement): Promise<void> {
    const parsed = requirementSchema.safeParse(requirement);
    if (!parsed.success) throw new GeaClientError('CLIENT_MANDATORY_POLICY_INVALID');
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(
        temporary,
        JSON.stringify({ schemaVersion: 1, environmentId: this.environmentId, requirement: parsed.data }),
        { flag: 'wx', mode: 0o600 }
      );
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
