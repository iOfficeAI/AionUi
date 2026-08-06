/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import {
  GeaLarkAuthService,
  GeaLarkAuthServiceError,
  startGeaMcpBridge,
  type GeaLarkAuthSession,
  type GeaMcpBridgeHandle,
  type GeaLarkAuthSessionStore,
  type WebHostLarkAuth,
} from '@aionui/web-host';
import type {
  LarkAuthStatus,
  LarkAuthUser,
  LarkQrLoginPollResult,
  PersonalModelSyncResult,
} from '@/common/types/platform/larkAuth';
import type { PersonalModelAuthClient } from './PersonalModelGatewayService';

export { GeaLarkAuthService as LarkAuthService, GeaLarkAuthServiceError as LarkAuthServiceError };

const GEA_AGENT_CODE = process.env.GEA_AGENT_CODE?.trim() || 'sales_forecast';
const LARK_AUTH_SESSION_FILE_NAME = 'lark-auth-session.bin';
// Desktop development uses AionCore's local identity so restarts do not require
// another QR scan. The GEA service remains unauthenticated until a real login.
const DEVELOPMENT_LOCAL_AUTH_STATUS: LarkAuthStatus = {
  authenticated: true,
  user: {
    id: 'system_default_user',
    realname: 'admin',
    username: 'admin',
  },
};
const sharedLarkAuthService = new GeaLarkAuthService();
let geaMcpBridgePromise: Promise<GeaMcpBridgeHandle> | null = null;
let sharedLarkAuthSessionStore: ElectronLarkAuthSessionStore | null = null;

type StoredLarkAuthSession = GeaLarkAuthSession & { version: 1 };

export type LarkAuthSafeStorageAdapter = Pick<
  typeof safeStorage,
  'decryptString' | 'encryptString' | 'getSelectedStorageBackend' | 'isEncryptionAvailable'
>;

export class ElectronLarkAuthSessionStore implements GeaLarkAuthSessionStore {
  private mutation: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly storage: LarkAuthSafeStorageAdapter = safeStorage
  ) {}

  async load(): Promise<GeaLarkAuthSession | null> {
    await this.mutation;
    if (!this.isAvailable()) return null;

    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    try {
      const parsed = JSON.parse(this.storage.decryptString(encrypted)) as unknown;
      return isStoredLarkAuthSession(parsed) ? { accessToken: parsed.accessToken } : await this.clearInvalidSession();
    } catch {
      return this.clearInvalidSession();
    }
  }

  save(session: GeaLarkAuthSession): Promise<void> {
    if (!this.isAvailable()) return Promise.resolve();
    return this.enqueueMutation(async () => {
      const contents: StoredLarkAuthSession = { version: 1, accessToken: session.accessToken };
      const encrypted = this.storage.encryptString(JSON.stringify(contents));
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      try {
        await writeFile(tempPath, encrypted, { mode: 0o600 });
        await rename(tempPath, this.filePath);
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });
  }

  clear(): Promise<void> {
    return this.enqueueMutation(async () => {
      await unlink(this.filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    });
  }

  private isAvailable(): boolean {
    if (!this.storage.isEncryptionAvailable()) return false;
    return process.platform !== 'linux' || this.storage.getSelectedStorageBackend() !== 'basic_text';
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    this.mutation = this.mutation.then(operation, operation);
    return this.mutation;
  }

  private async clearInvalidSession(): Promise<null> {
    await this.clear();
    return null;
  }
}

function isStoredLarkAuthSession(value: unknown): value is StoredLarkAuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredLarkAuthSession>;
  return session.version === 1 && typeof session.accessToken === 'string' && session.accessToken.trim() !== '';
}

type PersonalModelGatewayLifecycle = {
  deactivate: () => Promise<void>;
  sync: (user: LarkAuthUser, authClient: PersonalModelAuthClient) => Promise<PersonalModelSyncResult>;
};

let personalModelGateway: PersonalModelGatewayLifecycle | null = null;

export function configureSharedPersonalModelGateway(lifecycle: PersonalModelGatewayLifecycle): void {
  personalModelGateway = lifecycle;
}

export async function initializeSharedPersonalModelGateway(
  lifecycle: PersonalModelGatewayLifecycle
): Promise<PersonalModelSyncResult> {
  configureSharedPersonalModelGateway(lifecycle);
  return syncSharedPersonalModels();
}

export function initializeSharedLarkAuthSession(sessionStore: GeaLarkAuthSessionStore): Promise<void> {
  return sharedLarkAuthService.initializeSession(sessionStore);
}

export function getSharedLarkAuthSessionStore(): ElectronLarkAuthSessionStore {
  sharedLarkAuthSessionStore ??= new ElectronLarkAuthSessionStore(
    path.join(app.getPath('userData'), LARK_AUTH_SESSION_FILE_NAME)
  );
  return sharedLarkAuthSessionStore;
}

export async function pollSharedLarkAuthSession(qrcodeId: string): Promise<LarkQrLoginPollResult> {
  const result = await sharedLarkAuthService.pollQrSession(qrcodeId);
  if (result.status !== 'authenticated' || !result.user || !personalModelGateway) return result;
  let personalModelSync: PersonalModelSyncResult;
  try {
    personalModelSync = await personalModelGateway.sync(result.user, sharedLarkAuthService);
  } catch {
    personalModelSync = { configured: 0, failed: 1, skipped: 0, status: 'partial' };
  }
  return { ...result, personalModelSync };
}

export async function syncSharedPersonalModels(): Promise<PersonalModelSyncResult> {
  const status = sharedLarkAuthService.getStatus();
  if (!status.authenticated || !status.user) {
    return {
      configured: 0,
      failed: 0,
      reason: 'notAuthenticated',
      skipped: 0,
      status: 'notAuthenticated',
    };
  }
  if (!personalModelGateway) {
    return {
      configured: 0,
      failed: 1,
      reason: 'providerListFailed',
      skipped: 0,
      status: 'partial',
    };
  }
  return personalModelGateway.sync(status.user, sharedLarkAuthService);
}

export async function logoutSharedLarkAuthSession(): Promise<void> {
  await sharedLarkAuthService.logout();
  await personalModelGateway?.deactivate().catch(() => {});
}

export function resolveDesktopLarkAuthStatus(isPackaged: boolean, status: LarkAuthStatus): LarkAuthStatus {
  return isPackaged || (status.authenticated && status.user) ? status : DEVELOPMENT_LOCAL_AUTH_STATUS;
}

export function getSharedLarkAuthService(): GeaLarkAuthService {
  return sharedLarkAuthService;
}

export function createSharedWebHostLarkAuth(): WebHostLarkAuth {
  return {
    createQrSession: async () => {
      try {
        return { success: true, data: await sharedLarkAuthService.createQrSession() };
      } catch (error) {
        return {
          success: false,
          code: error instanceof GeaLarkAuthServiceError ? error.code : 'serverError',
        };
      }
    },
    pollQrSession: async (qrcodeId) => {
      try {
        return { success: true, data: await pollSharedLarkAuthSession(qrcodeId) };
      } catch (error) {
        return {
          success: false,
          code: error instanceof GeaLarkAuthServiceError ? error.code : 'serverError',
        };
      }
    },
    logout: logoutSharedLarkAuthSession,
  };
}

export function ensureGeaMcpBridgeStarted(): Promise<GeaMcpBridgeHandle> {
  geaMcpBridgePromise ??= startGeaMcpBridge(sharedLarkAuthService, GEA_AGENT_CODE);
  return geaMcpBridgePromise;
}
