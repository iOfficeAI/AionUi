/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/unused') },
  safeStorage: {},
}));

vi.mock('@/common', () => ({ ipcBridge: { mode: {} } }));

import { ElectronSafeStorageVault, type SafeStorageAdapter } from '@/process/services/gea/PersonalModelGatewayRuntime';
import { PersonalModelGatewayService } from '@/process/services/gea/PersonalModelGatewayService';

const xor = (value: Buffer): Buffer => Buffer.from(value.map((byte) => byte ^ 0xa5));

describe('ElectronSafeStorageVault', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('persists the personal secret only as encrypted bytes', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-personal-vault-'));
    const filePath = path.join(tempDir, 'vault.bin');
    const storage: SafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (value) => xor(Buffer.from(value, 'utf8')),
      decryptString: (value) => xor(value).toString('utf8'),
    };
    const vault = new ElectronSafeStorageVault(filePath, storage);
    const record = {
      environmentId: 'gea-env-a',
      userId: 'user-1',
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      tenantId: '0',
      baseUrl: 'https://gea.example/v1',
      proxyKey: 'local-proxy-key',
      secret: 'sk-user-sensitive',
    };

    await vault.put(record);

    const persisted = await readFile(filePath);
    expect(persisted.toString('utf8')).not.toContain(record.secret);
    await expect(vault.get(record.environmentId, record.userId, record.credentialId, '0')).resolves.toEqual(record);
  });

  it('falls back to process memory when encryption is unavailable', async () => {
    const storage: SafeStorageAdapter = {
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => 'unknown',
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };
    const vault = new ElectronSafeStorageVault('/unused', storage);
    const record = {
      environmentId: 'gea-env-a',
      userId: 'user-1',
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      tenantId: '0',
      baseUrl: 'https://gea.example/v1',
      proxyKey: 'local-proxy-key',
      secret: 'sk-user-sensitive',
    };

    expect(vault.isAvailable()).toBe(true);
    await vault.put(record);
    await expect(vault.get(record.environmentId, record.userId, record.credentialId, '0')).resolves.toEqual(record);
    expect(storage.encryptString).not.toHaveBeenCalled();
    expect(storage.decryptString).not.toHaveBeenCalled();
  });

  it('still claims and configures personal models when encrypted persistence is unavailable', async () => {
    const vault = new ElectronSafeStorageVault('/unused', {
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => 'unknown',
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    });
    const providers: Array<Record<string, unknown>> = [];
    const authClient = {
      listPersonalModelCredentials: vi.fn().mockResolvedValue([
        {
          credentialId: 'credential-1',
          accessKeyId: 'uk-gea-1',
          status: 'PENDING_CLAIM',
        },
      ]),
      claimPersonalModelCredential: vi.fn().mockResolvedValue({
        credentialId: 'credential-1',
        accessKeyId: 'uk-gea-1',
        status: 'ACTIVE',
        baseUrl: 'https://gea.example/v1',
        secret: 'sk-user-sensitive',
      }),
      listPersonalModels: vi.fn().mockResolvedValue(['deepseek-chat']),
    };
    const service = new PersonalModelGatewayService(
      vault,
      {
        list: vi.fn().mockResolvedValue(providers),
        save: vi.fn(async (provider) => {
          providers.push(provider);
        }),
      },
      'gea-env-a',
      {
        deactivate: vi.fn().mockResolvedValue(undefined),
        register: vi.fn().mockResolvedValue({ apiKey: 'local-key', baseUrl: 'http://127.0.0.1:1/personal/p' }),
      }
    );

    await expect(
      service.sync({ id: 'user-1', username: 'zhangsan', realname: '张三' }, authClient, ['sales-forecast'])
    ).resolves.toMatchObject({ configured: 1, failed: 0, status: 'completed' });
    expect(authClient.claimPersonalModelCredential).toHaveBeenCalledOnce();
    expect(authClient.listPersonalModels).toHaveBeenCalledWith(
      'https://gea.example/v1',
      'sk-user-sensitive',
      'sales-forecast'
    );
  });

  it('keeps credentials in memory without probing secure storage when persistence is disabled', async () => {
    const storage: SafeStorageAdapter = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'keychain'),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };
    const vault = new ElectronSafeStorageVault('/unused', storage, false);
    const record = {
      environmentId: 'gea-env-a',
      userId: 'user-1',
      credentialId: 'credential-1',
      accessKeyId: 'uk-gea-1',
      tenantId: '0',
      baseUrl: 'https://gea.example/v1',
      proxyKey: 'local-proxy-key',
      secret: 'sk-user-sensitive',
    };

    expect(vault.isAvailable()).toBe(true);
    await vault.put(record);
    await expect(vault.get(record.environmentId, record.userId, record.credentialId, '0')).resolves.toEqual(record);
    await vault.delete(record.environmentId, record.userId, record.credentialId, '0');
    await expect(vault.get(record.environmentId, record.userId, record.credentialId, '0')).resolves.toBeNull();
    expect(storage.isEncryptionAvailable).not.toHaveBeenCalled();
    expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled();
    expect(storage.encryptString).not.toHaveBeenCalled();
    expect(storage.decryptString).not.toHaveBeenCalled();
  });

  it.each([1, 2])('does not reuse version %s legacy per-Agent vault records', async (version) => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-personal-vault-'));
    const filePath = path.join(tempDir, 'vault.bin');
    const storage: SafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (value) => xor(Buffer.from(value, 'utf8')),
      decryptString: (value) => xor(value).toString('utf8'),
    };
    await writeFile(
      filePath,
      storage.encryptString(
        JSON.stringify({
          version,
          entries: {
            legacy: {
              userId: 'user-1',
              credentialId: 'credential-1',
              accessKeyId: 'uk-gea-1',
              tenantId: '0',
              baseUrl: 'https://gea.example/v1',
              proxyKey: 'local-proxy-key',
              secret: 'sk-user-sensitive',
            },
          },
        })
      )
    );
    const vault = new ElectronSafeStorageVault(filePath, storage);

    await expect(vault.get('gea-env-a', 'user-1', 'credential-1', '0')).resolves.toBeNull();
  });
});
