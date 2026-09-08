/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import {
  PersonalModelGatewayService,
  type PersonalModelProviderStore,
  type PersonalModelSecretRecord,
  type PersonalModelSecretVault,
} from './PersonalModelGatewayService';
import { shouldUsePersistentCredentialStorage } from './CredentialStoragePolicy';
import { getGeaEnvironment } from './GeaEnvironmentService';

const VAULT_FILE_NAME = 'personal-model-vault.bin';

type VaultContents = {
  entries: Record<string, PersonalModelSecretRecord>;
  version: 3;
};

export type SafeStorageAdapter = Pick<
  typeof safeStorage,
  'decryptString' | 'encryptString' | 'getSelectedStorageBackend' | 'isEncryptionAvailable'
>;

export class ElectronSafeStorageVault implements PersonalModelSecretVault {
  private mutation: Promise<void> = Promise.resolve();
  private persistentStorageAvailable: boolean | undefined;
  private readonly volatileEntries = new Map<string, PersonalModelSecretRecord>();

  constructor(
    private readonly filePath: string,
    private readonly storage: SafeStorageAdapter = safeStorage,
    private readonly enabled = true
  ) {}

  isAvailable(): boolean {
    // Secrets can always remain process-local when encrypted persistence is unavailable.
    return true;
  }

  async get(
    environmentId: string,
    userId: string,
    credentialId: string,
    tenantId: string
  ): Promise<PersonalModelSecretRecord | null> {
    if (!this.canPersist()) {
      return this.volatileEntries.get(vaultKey(environmentId, userId, credentialId, tenantId)) ?? null;
    }
    await this.mutation;
    const contents = await this.readContents();
    const record = contents.entries[vaultKey(environmentId, userId, credentialId, tenantId)] ?? null;
    return record?.environmentId === environmentId &&
      record.userId === userId &&
      record.credentialId === credentialId &&
      record.tenantId === tenantId
      ? record
      : null;
  }

  put(record: PersonalModelSecretRecord): Promise<void> {
    if (!this.canPersist()) {
      this.volatileEntries.set(
        vaultKey(record.environmentId, record.userId, record.credentialId, record.tenantId),
        record
      );
      return Promise.resolve();
    }
    return this.enqueueMutation(async () => {
      const contents = await this.readContents();
      contents.entries[vaultKey(record.environmentId, record.userId, record.credentialId, record.tenantId)] = record;
      await this.writeContents(contents);
    });
  }

  delete(environmentId: string, userId: string, credentialId: string, tenantId: string): Promise<void> {
    if (!this.canPersist()) {
      this.volatileEntries.delete(vaultKey(environmentId, userId, credentialId, tenantId));
      return Promise.resolve();
    }
    return this.enqueueMutation(async () => {
      const contents = await this.readContents();
      delete contents.entries[vaultKey(environmentId, userId, credentialId, tenantId)];
      await this.writeContents(contents);
    });
  }

  private canPersist(): boolean {
    if (!this.enabled) return false;
    if (this.persistentStorageAvailable !== undefined) return this.persistentStorageAvailable;
    try {
      this.persistentStorageAvailable =
        this.storage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || this.storage.getSelectedStorageBackend() !== 'basic_text');
    } catch {
      this.persistentStorageAvailable = false;
    }
    return this.persistentStorageAvailable;
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    this.mutation = this.mutation.then(operation, operation);
    return this.mutation;
  }

  private async readContents(): Promise<VaultContents> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 3, entries: {} };
      }
      throw error;
    }
    const parsed = JSON.parse(this.storage.decryptString(encrypted)) as unknown;
    if (isLegacyVaultContents(parsed)) {
      // V1 lacked environment identity; V2 held legacy per-Agent secrets. Neither can be reused as a user key.
      return { version: 3, entries: {} };
    }
    if (!isVaultContents(parsed)) {
      throw new Error('GEA_PERSONAL_VAULT_INVALID');
    }
    return parsed;
  }

  private async writeContents(contents: VaultContents): Promise<void> {
    const encrypted = this.storage.encryptString(JSON.stringify(contents));
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await writeFile(tempPath, encrypted, { mode: 0o600 });
      await rename(tempPath, this.filePath);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }
}

class AionCoreProviderStore implements PersonalModelProviderStore {
  async list(): Promise<IProvider[]> {
    return (await ipcBridge.mode.listProviders.invoke()) ?? [];
  }

  async save(provider: IProvider, exists: boolean): Promise<void> {
    if (exists) {
      const { id, ...updates } = provider;
      await ipcBridge.mode.updateProvider.invoke({ id, ...updates });
      return;
    }
    await ipcBridge.mode.createProvider.invoke(provider);
  }
}

let runtime: PersonalModelGatewayService | null = null;
let runtimeEnvironmentId: string | null = null;

export function getPersonalModelGatewayRuntime(): PersonalModelGatewayService {
  const environmentId = getGeaEnvironment().environmentId;
  if (runtimeEnvironmentId !== environmentId) {
    // The environment switch owner has already deactivated the previous runtime.
    runtime = null;
    runtimeEnvironmentId = environmentId;
  }
  runtime ??= new PersonalModelGatewayService(
    new ElectronSafeStorageVault(
      path.join(app.getPath('userData'), VAULT_FILE_NAME),
      safeStorage,
      shouldUsePersistentCredentialStorage()
    ),
    new AionCoreProviderStore(),
    getGeaEnvironment().environmentId
  );
  return runtime;
}

function vaultKey(environmentId: string, userId: string, credentialId: string, tenantId: string): string {
  return createHash('sha256').update(`${environmentId}\0${tenantId}\0${userId}\0${credentialId}`).digest('hex');
}

function isVaultContents(value: unknown): value is VaultContents {
  if (!value || typeof value !== 'object') return false;
  const raw = value as { entries?: unknown; version?: unknown };
  if (raw.version !== 3 || !raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) return false;
  return Object.values(raw.entries as Record<string, unknown>).every(isSecretRecord);
}

function isLegacyVaultContents(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const raw = value as { entries?: unknown; version?: unknown };
  return (
    (raw.version === 1 || raw.version === 2) &&
    raw.entries !== null &&
    typeof raw.entries === 'object' &&
    !Array.isArray(raw.entries)
  );
}

function isSecretRecord(value: unknown): value is PersonalModelSecretRecord {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return ['accessKeyId', 'tenantId', 'baseUrl', 'credentialId', 'environmentId', 'proxyKey', 'secret', 'userId'].every(
    (key) => typeof raw[key] === 'string' && (raw[key] as string).length > 0
  );
}
