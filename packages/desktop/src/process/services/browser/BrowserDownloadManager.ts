/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, session, type DownloadItem, type WebContents } from 'electron';
import type { DownloadOptions, DownloadRecord } from '@/common/browser/types';
import { DEFAULT_BROWSER_PROFILE_ID } from '@/common/browser/constants';

type DownloadWaitMatcher = {
  options: DownloadOptions;
  resolve: (record: DownloadRecord) => void;
  reject: (err: Error) => void;
  timeoutTimer: NodeJS.Timeout;
};

export class BrowserDownloadManager {
  private downloads: Map<string, DownloadRecord> = new Map();
  private waitQueue: Set<DownloadWaitMatcher> = new Set();
  private baseDir: string;
  private attachedSessions: Set<string> = new Set();

  constructor(options?: { baseDir?: string }) {
    this.baseDir = options?.baseDir || this.resolveDefaultBaseDir();
  }

  private resolveDefaultBaseDir(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'downloads');
      }
    } catch {
      // In test environment
    }
    return path.join(process.cwd(), 'downloads');
  }

  public setBaseDir(dir: string): void {
    this.baseDir = dir;
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getDownloads(): DownloadRecord[] {
    return Array.from(this.downloads.values());
  }

  public getDownload(id: string): DownloadRecord | undefined {
    return this.downloads.get(id);
  }

  public resolveSavePath(
    filename: string,
    options?: { profileId?: string; workspace?: string; targetDir?: string }
  ): string {
    const profile = options?.profileId || DEFAULT_BROWSER_PROFILE_ID;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const rootDir = options?.workspace
      ? path.join(options.workspace, 'browser-downloads', profile, dateStr)
      : options?.targetDir || path.join(this.baseDir, profile, dateStr);

    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    // Clean filename
    const cleanName = filename.replace(/[<>:"/\\|?*]/g, '_');
    let targetPath = path.join(rootDir, cleanName);

    // De-duplicate if file already exists
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(cleanName);
      const base = path.basename(cleanName, ext);
      let count = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(rootDir, `${base}_${count}${ext}`);
        count++;
      }
    }

    return targetPath;
  }

  public verifyDownloadedFile(filePath: string): { valid: boolean; size: number; error?: string } {
    if (!fs.existsSync(filePath)) {
      return { valid: false, size: 0, error: 'File does not exist on disk' };
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0) {
        return { valid: false, size: 0, error: 'Downloaded file has zero size' };
      }

      // Check temporary download suffixes
      if (filePath.endsWith('.crdownload') || filePath.endsWith('.download') || filePath.endsWith('.tmp')) {
        return { valid: false, size: stat.size, error: 'File appears incomplete (temporary extension)' };
      }

      return { valid: true, size: stat.size };
    } catch (err) {
      return { valid: false, size: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public registerSession(sess?: Electron.Session, profileId = DEFAULT_BROWSER_PROFILE_ID): void {
    const targetSession = sess || (session && session.defaultSession);
    if (!targetSession || typeof targetSession.on !== 'function') return;

    // Avoid duplicate attachment to the same partition
    const sessionKey = `${profileId}_attached`;
    if (this.attachedSessions.has(sessionKey)) return;
    this.attachedSessions.add(sessionKey);

    targetSession.on('will-download', (_event, item, _webContents) => {
      this.handleDownloadItem(item, { profileId });
    });
  }

  public handleDownloadItem(
    item: DownloadItem,
    options?: { profileId?: string; workspace?: string; targetDir?: string }
  ): DownloadRecord {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const originalName = item.getFilename();
    const finalPath = this.resolveSavePath(originalName, options);

    item.setSavePath(finalPath);

    const record: DownloadRecord = {
      id,
      url: item.getURL(),
      filename: path.basename(finalPath),
      savePath: finalPath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      mimeType: item.getMimeType(),
      state: 'progressing',
      startTime: Date.now(),
    };

    this.downloads.set(id, record);

    item.on('updated', (_evt, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      if (state === 'interrupted') {
        record.state = 'interrupted';
      }
    });

    item.on('done', (_evt, state) => {
      record.completedTime = Date.now();
      record.receivedBytes = item.getReceivedBytes();

      if (state === 'completed') {
        const verification = this.verifyDownloadedFile(finalPath);
        if (verification.valid) {
          record.state = 'completed';
          record.totalBytes = verification.size;
          this.notifyWaiters(record);
        } else {
          record.state = 'interrupted';
          record.error = verification.error;
          this.notifyWaitersError(record, new Error(verification.error));
        }
      } else {
        record.state = state === 'cancelled' ? 'cancelled' : 'interrupted';
        record.error = `Download ended with state: ${state}`;
        this.notifyWaitersError(record, new Error(record.error));
      }
    });

    return record;
  }

  public async waitForDownload(options: DownloadOptions = {}): Promise<DownloadRecord> {
    const timeoutMs = options.timeoutMs || 600000; // default up to 10 minutes for large media

    return new Promise<DownloadRecord>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.waitQueue.delete(matcher);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for download to complete`));
      }, timeoutMs);

      const matcher: DownloadWaitMatcher = {
        options,
        resolve: (rec) => {
          clearTimeout(timeoutTimer);
          resolve(rec);
        },
        reject: (err) => {
          clearTimeout(timeoutTimer);
          reject(err);
        },
        timeoutTimer,
      };

      this.waitQueue.add(matcher);
    });
  }

  private notifyWaiters(record: DownloadRecord): void {
    for (const matcher of Array.from(this.waitQueue)) {
      const { options, resolve } = matcher;
      let matches = true;

      if (options.expectedFilename && !record.filename.toLowerCase().includes(options.expectedFilename.toLowerCase())) {
        matches = false;
      }
      if (options.url && !record.url.includes(options.url)) {
        matches = false;
      }

      if (matches) {
        this.waitQueue.delete(matcher);
        resolve(record);
      }
    }
  }

  private notifyWaitersError(_record: DownloadRecord, error: Error): void {
    for (const matcher of Array.from(this.waitQueue)) {
      this.waitQueue.delete(matcher);
      matcher.reject(error);
    }
  }

  public async triggerBlobDownload(wc: WebContents, blobUrl: string, filename: string = 'download'): Promise<void> {
    const script = `
      (() => {
        const a = document.createElement('a');
        a.href = ${JSON.stringify(blobUrl)};
        a.download = ${JSON.stringify(filename)};
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })()
    `;
    await wc.executeJavaScript(script);
  }
}

let downloadManagerInstance: BrowserDownloadManager | null = null;

export function getBrowserDownloadManager(): BrowserDownloadManager {
  if (!downloadManagerInstance) {
    downloadManagerInstance = new BrowserDownloadManager();
  }
  return downloadManagerInstance;
}
