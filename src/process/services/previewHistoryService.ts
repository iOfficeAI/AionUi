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

// 管理预览面板快照：负责存储、索引和读取 / Manage preview panel snapshots: persistence, indexing and retrieval
class PreviewHistoryService {
  private getBaseDir(): string {
    return path.join(getSystemDir().cacheDir, HISTORY_FOLDER_NAME);
  }

  // 确保历史目录存在（递归创建）/ Ensure history directory exists
  private async ensureDir(targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
  }

  // 根据目标生成稳定的标识和摘要，作为索引/存储路径 / Build stable identity & digest for indexing
  private buildIdentity(target: PreviewHistoryTarget): { identity: string; digest: string } {
    const keyParts = [target.filePath ? `path:${target.filePath}` : '', target.workspace ? `workspace:${target.workspace}` : '', target.fileName ? `file:${target.fileName}` : '', target.title ? `title:${target.title}` : '', target.language ? `lang:${target.language}` : '', target.conversationId ? `conversation:${target.conversationId}` : '', `type:${target.contentType}`].filter(Boolean);

    const identity = keyParts.join('|') || `anonymous|${target.contentType}`;
    const digest = crypto.createHash('sha1').update(identity).digest('hex');
    return { identity, digest };
  }

  // 读取目标索引文件，若不存在则返回默认结构 / Read snapshot index or fallback to empty structure
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

  // 将内存索引写回磁盘 / Persist in-memory index to disk
  private async writeIndex(targetDir: string, index: PreviewHistoryIndex): Promise<void> {
    const indexPath = path.join(targetDir, INDEX_FILE_NAME);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private getSnapshotFileName(snapshotId: string): string {
    return `${snapshotId}.md`;
  }

  // 组装快照元数据，记录储存路径 / Build snapshot metadata with storage path info
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

  // 列出对应目标的快照清单（只返回对外结构）/ List snapshots for given target (public info only)
  public async list(target: PreviewHistoryTarget): Promise<PreviewSnapshotInfo[]> {
    const { identity, digest } = this.buildIdentity(target);
    const targetDir = path.join(this.getBaseDir(), digest);
    const index = await this.readIndex(targetDir, identity, target);
    return index.versions.map((item) => this.normalizeSnapshot(item));
  }

  // 保存快照：写入文件并维护索引、数量限制 / Save snapshot file and maintain bounded index
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

  // 获取指定快照的原始内容 / Retrieve raw content for a snapshot
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
