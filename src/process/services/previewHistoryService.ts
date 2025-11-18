/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '@/common/types/preview';
import { getSystemDir } from '../initStorage';

interface StoredSnapshot extends PreviewSnapshotInfo {
  storagePath: string; // 相对 baseDir 的路径 / Path relative to base dir
}

interface PreviewHistoryIndex {
  identity: string;
  target: PreviewHistoryTarget;
  versions: StoredSnapshot[];
}

const HISTORY_FOLDER_NAME = 'preview-history';
const INDEX_FILE_NAME = 'index.json';
const MAX_VERSIONS_PER_TARGET = 50;

class PreviewHistoryService {
  private getBaseDir(): string {
    return path.join(getSystemDir().cacheDir, HISTORY_FOLDER_NAME);
  }

  private async ensureDir(targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
  }

  private buildIdentity(target: PreviewHistoryTarget): { identity: string; digest: string } {
    const keyParts = [target.filePath ? `path:${target.filePath}` : '', target.workspace ? `workspace:${target.workspace}` : '', target.fileName ? `file:${target.fileName}` : '', target.title ? `title:${target.title}` : '', target.language ? `lang:${target.language}` : '', target.conversationId ? `conversation:${target.conversationId}` : '', `type:${target.contentType}`].filter(Boolean);

    const identity = keyParts.join('|') || `anonymous|${target.contentType}`;
    const digest = crypto.createHash('sha1').update(identity).digest('hex');
    return { identity, digest };
  }

  private async readIndex(targetDir: string, identity: string, target: PreviewHistoryTarget): Promise<PreviewHistoryIndex> {
    await this.ensureDir(targetDir);
    const indexPath = path.join(targetDir, INDEX_FILE_NAME);

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(content) as PreviewHistoryIndex;
      // 兼容旧数据 / Backward compatibility for future schema changes
      if (!Array.isArray(parsed.versions)) {
        parsed.versions = [];
      }
      return parsed;
    } catch (error) {
      return {
        identity,
        target,
        versions: [],
      };
    }
  }

  private async writeIndex(targetDir: string, index: PreviewHistoryIndex): Promise<void> {
    const indexPath = path.join(targetDir, INDEX_FILE_NAME);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private getSnapshotFileName(snapshotId: string): string {
    return `${snapshotId}.md`;
  }

  private createSnapshotInfo(params: { snapshotId: string; content: string; createdAt: number; target: PreviewHistoryTarget; relativePath: string }): StoredSnapshot {
    const { snapshotId, content, createdAt, target, relativePath } = params;
    return {
      id: snapshotId,
      label: new Date(createdAt).toISOString(),
      createdAt,
      size: Buffer.byteLength(content, 'utf-8'),
      contentType: target.contentType,
      fileName: target.fileName,
      filePath: target.filePath,
      storagePath: relativePath,
    };
  }

  private normalizeSnapshot(snapshot: StoredSnapshot): PreviewSnapshotInfo {
    const { storagePath: _storagePath, ...publicInfo } = snapshot;
    return publicInfo;
  }

  public async list(target: PreviewHistoryTarget): Promise<PreviewSnapshotInfo[]> {
    const { identity, digest } = this.buildIdentity(target);
    const targetDir = path.join(this.getBaseDir(), digest);
    const index = await this.readIndex(targetDir, identity, target);
    return index.versions.map((item) => this.normalizeSnapshot(item));
  }

  public async save(target: PreviewHistoryTarget, content: string): Promise<PreviewSnapshotInfo> {
    const { identity, digest } = this.buildIdentity(target);
    const baseDir = this.getBaseDir();
    await this.ensureDir(baseDir);

    const targetDir = path.join(baseDir, digest);
    const index = await this.readIndex(targetDir, identity, target);

    const createdAt = Date.now();
    const snapshotId = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = this.getSnapshotFileName(snapshotId);
    const snapshotPath = path.join(targetDir, fileName);

    await fs.writeFile(snapshotPath, content, 'utf-8');

    const storedSnapshot = this.createSnapshotInfo({
      snapshotId,
      content,
      createdAt,
      target,
      relativePath: path.relative(this.getBaseDir(), snapshotPath),
    });

    index.versions.unshift(storedSnapshot);

    // 限制快照数量，删除最旧的记录 / Limit number of snapshots per target
    while (index.versions.length > MAX_VERSIONS_PER_TARGET) {
      const removed = index.versions.pop();
      if (removed) {
        const obsoletePath = path.join(this.getBaseDir(), removed.storagePath);
        void fs.rm(obsoletePath, { force: true }).catch((): void => undefined);
      }
    }

    await this.writeIndex(targetDir, index);
    return this.normalizeSnapshot(storedSnapshot);
  }

  public async getContent(target: PreviewHistoryTarget, snapshotId: string): Promise<{ snapshot: PreviewSnapshotInfo; content: string } | null> {
    const { identity, digest } = this.buildIdentity(target);
    const targetDir = path.join(this.getBaseDir(), digest);
    const index = await this.readIndex(targetDir, identity, target);

    const storedSnapshot = index.versions.find((item) => item.id === snapshotId);
    if (!storedSnapshot) {
      return null;
    }

    const absolutePath = path.join(this.getBaseDir(), storedSnapshot.storagePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    return {
      snapshot: this.normalizeSnapshot(storedSnapshot),
      content,
    };
  }
}

export const previewHistoryService = new PreviewHistoryService();
