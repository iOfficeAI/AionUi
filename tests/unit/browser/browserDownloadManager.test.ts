/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserDownloadManager } from '@/process/services/browser/BrowserDownloadManager';
import type { DownloadItem, WebContents } from 'electron';

describe('BrowserDownloadManager', () => {
  let tmpDir: string;
  let manager: BrowserDownloadManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-dl-test-'));
    manager = new BrowserDownloadManager({ baseDir: tmpDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('resolveSavePath', () => {
    it('generates structured date-based directory and de-duplicates filenames', () => {
      const workspace = path.join(tmpDir, 'my-workspace');
      const filename = 'generated-video:test?.mp4';

      const resolved = manager.resolveSavePath(filename, {
        profileId: 'test-profile',
        workspace,
      });

      // Cleans invalid chars
      expect(path.basename(resolved)).not.toContain(':');
      expect(path.basename(resolved)).not.toContain('?');
      expect(resolved).toContain('browser-downloads');
      expect(resolved).toContain('test-profile');

      // Creates the directory
      expect(fs.existsSync(path.dirname(resolved))).toBe(true);

      // Now create the file to test de-duplication
      fs.writeFileSync(resolved, 'dummy content');
      const secondResolved = manager.resolveSavePath(filename, {
        profileId: 'test-profile',
        workspace,
      });

      expect(secondResolved).not.toBe(resolved);
      expect(secondResolved).toMatch(/_1\.mp4$/);
    });
  });

  describe('verifyDownloadedFile', () => {
    it('rejects nonexistent files', () => {
      const result = manager.verifyDownloadedFile(path.join(tmpDir, 'nonexistent.mp4'));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('rejects zero-byte files', () => {
      const zeroPath = path.join(tmpDir, 'empty.mp4');
      fs.writeFileSync(zeroPath, '');
      const result = manager.verifyDownloadedFile(zeroPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('zero size');
    });

    it('rejects temporary incomplete download files', () => {
      const tempPath = path.join(tmpDir, 'video.mp4.crdownload');
      fs.writeFileSync(tempPath, 'in-progress bytes');
      const result = manager.verifyDownloadedFile(tempPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('incomplete');
    });

    it('accepts complete, valid non-zero files', () => {
      const validPath = path.join(tmpDir, 'video.mp4');
      fs.writeFileSync(validPath, 'video content payload');
      const result = manager.verifyDownloadedFile(validPath);
      expect(result.valid).toBe(true);
      expect(result.size).toBe(21);
    });
  });

  describe('handleDownloadItem & waitForDownload', () => {
    it('tracks progress and resolves waiters on completion', async () => {
      const listeners: Record<string, Function[]> = {};

      const mockItem = {
        getFilename: () => 'flow-output.mp4',
        getURL: () => 'https://flow.google.com/output/123.mp4',
        setSavePath: vi.fn(),
        getTotalBytes: () => 1024,
        getReceivedBytes: () => 0,
        getMimeType: () => 'video/mp4',
        on: (event: string, callback: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
          return mockItem;
        },
      } as unknown as DownloadItem;

      // Start waiting before the download is triggered
      const waitPromise = manager.waitForDownload({
        expectedFilename: 'flow-output',
        timeoutMs: 3000,
      });

      const record = manager.handleDownloadItem(mockItem, {
        profileId: 'default',
        targetDir: tmpDir,
      });

      expect(record.state).toBe('progressing');
      expect(record.filename).toBe('flow-output.mp4');
      expect(mockItem.setSavePath).toHaveBeenCalled();

      // Simulate partial progress update
      vi.spyOn(mockItem, 'getReceivedBytes').mockReturnValue(512);
      listeners['updated']?.forEach((cb) => cb({}, 'progressing'));

      const currentRecord = manager.getDownload(record.id);
      expect(currentRecord?.receivedBytes).toBe(512);

      // Create the file so verification succeeds on completion
      fs.writeFileSync(record.savePath, 'completed file bytes');
      vi.spyOn(mockItem, 'getReceivedBytes').mockReturnValue(20);
      listeners['done']?.forEach((cb) => cb({}, 'completed'));

      const completedRecord = await waitPromise;
      expect(completedRecord.state).toBe('completed');
      expect(completedRecord.totalBytes).toBe(20);
      expect(completedRecord.savePath).toBe(record.savePath);
    });

    it('rejects waitForDownload when timeout occurs', async () => {
      await expect(
        manager.waitForDownload({
          expectedFilename: 'never-arriving-file.mp4',
          timeoutMs: 50,
        })
      ).rejects.toThrow('Timed out');
    });

    it('rejects waiters when download is cancelled or interrupted', async () => {
      const listeners: Record<string, Function[]> = {};

      const mockItem = {
        getFilename: () => 'cancelled-file.zip',
        getURL: () => 'https://example.com/cancelled.zip',
        setSavePath: vi.fn(),
        getTotalBytes: () => 500,
        getReceivedBytes: () => 10,
        getMimeType: () => 'application/zip',
        on: (event: string, callback: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
          return mockItem;
        },
      } as unknown as DownloadItem;

      const waitPromise = manager.waitForDownload({
        expectedFilename: 'cancelled-file',
        timeoutMs: 2000,
      });

      manager.handleDownloadItem(mockItem, { targetDir: tmpDir });

      listeners['done']?.forEach((cb) => cb({}, 'cancelled'));

      await expect(waitPromise).rejects.toThrow('cancelled');
    });
  });

  describe('triggerBlobDownload', () => {
    it('executes client-side anchor click in web contents', async () => {
      const mockWc = {
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
      } as unknown as WebContents;

      await manager.triggerBlobDownload(mockWc, 'blob:https://flow.google.com/abc-123', 'video.mp4');

      expect(mockWc.executeJavaScript).toHaveBeenCalled();
      const script = (mockWc.executeJavaScript as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(script).toContain('blob:https://flow.google.com/abc-123');
      expect(script).toContain('video.mp4');
    });
  });
});
