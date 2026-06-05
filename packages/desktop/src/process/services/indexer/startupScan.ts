/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdir } from 'fs/promises';
import path from 'path';
import { shouldIgnoreIndexPath, type IndexIgnoreOptions } from './ignore';
import { scheduleFileReindexIfChanged, type IndexInvalidationOptions } from './invalidation';
import type { ChislIndexStore } from './repository';

export type StartupScanResult = {
  scanned: number;
  jobsScheduled: number;
  skippedIgnored: number;
  skippedUnchanged: number;
};

async function enumerateWorkspaceFiles(
  workspaceRoot: string,
  options: IndexIgnoreOptions
): Promise<{ relativePath: string; absolutePath: string }[]> {
  const root = path.resolve(workspaceRoot);
  const results: { relativePath: string; absolutePath: string }[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');

      if (shouldIgnoreIndexPath(relativePath, absolutePath, options)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        results.push({ relativePath, absolutePath });
      }
    }
  }

  await walk(root);
  return results;
}

/**
 * Enumerates workspace files and schedules index jobs only for missing or changed content hashes.
 */
export async function runStartupIndexScan(
  store: ChislIndexStore,
  options: IndexInvalidationOptions
): Promise<StartupScanResult> {
  const files = await enumerateWorkspaceFiles(options.workspaceRoot, options);
  let jobsScheduled = 0;
  let skippedIgnored = 0;
  let skippedUnchanged = 0;

  for (const { relativePath, absolutePath } of files) {
    if (shouldIgnoreIndexPath(relativePath, absolutePath, options)) {
      skippedIgnored += 1;
      continue;
    }

    const scheduled = await scheduleFileReindexIfChanged(store, options, relativePath, absolutePath);
    if (scheduled) {
      jobsScheduled += 1;
    } else {
      skippedUnchanged += 1;
    }
  }

  return {
    scanned: files.length,
    jobsScheduled,
    skippedIgnored,
    skippedUnchanged,
  };
}
