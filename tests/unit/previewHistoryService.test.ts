import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { PreviewHistoryTarget } from '../../src/common/types/preview';

let tmpDir: string;

const mockTarget: PreviewHistoryTarget = {
  contentType: 'markdown',
  fileName: 'test.md',
};

vi.mock('../../src/process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: tmpDir,
  }),
}));

describe('PreviewHistoryService', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-history-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves and lists snapshots in a normal directory', async () => {
    const { previewHistoryService } = await import('../../src/process/services/previewHistoryService');
    const snapshot = await previewHistoryService.save(mockTarget, '# Hello');
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.contentType).toBe('markdown');

    const list = await previewHistoryService.list(mockTarget);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snapshot.id);
  });

  it('recovers when a parent path is a regular file (ENOTDIR)', async () => {
    // Simulate the Sentry issue: cacheDir exists as a regular file
    // instead of a directory, causing fs.mkdir to throw ENOTDIR.
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.writeFile(tmpDir, 'blocking file');

    const { previewHistoryService } = await import('../../src/process/services/previewHistoryService');
    const snapshot = await previewHistoryService.save(mockTarget, '# Recovered');
    expect(snapshot.id).toBeTruthy();

    const list = await previewHistoryService.list(mockTarget);
    expect(list.length).toBe(1);
  });

  it('retrieves saved snapshot content', async () => {
    const { previewHistoryService } = await import('../../src/process/services/previewHistoryService');
    const content = '# Snapshot content';
    const snapshot = await previewHistoryService.save(mockTarget, content);

    const result = await previewHistoryService.getContent(mockTarget, snapshot.id);
    expect(result).not.toBeNull();
    expect(result!.content).toBe(content);
    expect(result!.snapshot.id).toBe(snapshot.id);
  });

  it('returns null for non-existent snapshot', async () => {
    const { previewHistoryService } = await import('../../src/process/services/previewHistoryService');
    const result = await previewHistoryService.getContent(mockTarget, 'non-existent-id');
    expect(result).toBeNull();
  });
});
