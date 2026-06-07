/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  snapshotHasPlaintextPassword,
  type EncryptedCredentialBlob,
  type HttpServerConnectionKey,
  type HttpServerCredentialEncryptor,
  type HttpServerCredentialPayload,
  type HttpServerCredentialStore,
  type HttpServerRegistrySnapshot,
} from '@/common/registry';
import { resolveChislServersJsonPath } from './paths';

export type ChislServerRegistryFileStore = {
  load(): HttpServerRegistrySnapshot;
  save(snapshot: HttpServerRegistrySnapshot): void;
};

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createChislServerRegistryFileStore(
  jsonPath = resolveChislServersJsonPath()
): ChislServerRegistryFileStore {
  return {
    load(): HttpServerRegistrySnapshot {
      try {
        if (!existsSync(jsonPath)) return { list: [] };
        const raw = readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return { list: [] };
        const obj = parsed as { list?: unknown; activeKey?: unknown };
        if (!Array.isArray(obj.list)) return { list: [] };
        if (snapshotHasPlaintextPassword(obj as { list: unknown[] })) {
          return { list: [] };
        }
        return {
          list: obj.list as HttpServerRegistrySnapshot['list'],
          activeKey: typeof obj.activeKey === 'string' ? (obj.activeKey as HttpServerConnectionKey) : undefined,
        };
      } catch {
        return { list: [] };
      }
    },

    save(snapshot: HttpServerRegistrySnapshot): void {
      if (snapshotHasPlaintextPassword(snapshot)) {
        throw new Error('[registry] Refusing to persist snapshot containing plaintext passwords');
      }
      ensureDir(jsonPath);
      writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8');
    },
  };
}

export type ChislServerCredentialSidecarEntry = {
  key: string;
  blob: EncryptedCredentialBlob;
};

export type ChislServerCredentialSidecarFile = {
  credentials: ChislServerCredentialSidecarEntry[];
};

export type ChislServerCredentialFileStore = HttpServerCredentialStore & {
  load(): void;
  flush(): void;
};

export function createChislServerCredentialFileStore(
  encryptor: HttpServerCredentialEncryptor,
  sidecarPath?: string
): ChislServerCredentialFileStore {
  const resolvedPath = sidecarPath ?? resolveChislServersJsonPath().replace(/\.json$/, '-credentials.json');
  const memory = new Map<string, HttpServerCredentialPayload>();

  function loadFromDisk(): ChislServerCredentialSidecarEntry[] {
    try {
      if (!existsSync(resolvedPath)) return [];
      const raw = readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return [];
      const obj = parsed as { credentials?: unknown };
      if (!Array.isArray(obj.credentials)) return [];
      return obj.credentials as ChislServerCredentialSidecarEntry[];
    } catch {
      return [];
    }
  }

  function saveToDisk(entries: ChislServerCredentialSidecarEntry[]): void {
    ensureDir(resolvedPath);
    const data: ChislServerCredentialSidecarFile = { credentials: entries };
    writeFileSync(resolvedPath, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    load(): void {
      memory.clear();
      const entries = loadFromDisk();
      for (const entry of entries) {
        const plaintext = encryptor.decrypt(entry.blob);
        if (plaintext !== undefined) {
          const payload = JSON.parse(plaintext) as HttpServerCredentialPayload;
          memory.set(entry.key, payload);
        }
      }
    },

    flush(): void {
      const entries: ChislServerCredentialSidecarEntry[] = [];
      for (const [key, payload] of memory) {
        const blob = encryptor.encrypt(JSON.stringify(payload));
        if (blob) {
          entries.push({ key, blob });
        }
      }
      saveToDisk(entries);
    },

    get(key: HttpServerConnectionKey): HttpServerCredentialPayload | undefined {
      return memory.get(key);
    },

    set(key: HttpServerConnectionKey, payload: HttpServerCredentialPayload): void {
      memory.set(key, payload);
    },

    delete(key: HttpServerConnectionKey): void {
      memory.delete(key);
    },

    has(key: HttpServerConnectionKey): boolean {
      return memory.has(key);
    },
  };
}
