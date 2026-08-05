/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeaLarkAuthService,
  GeaLarkAuthServiceError,
  startGeaMcpBridge,
  type GeaMcpBridgeHandle,
  type WebHostLarkAuth,
} from '@aionui/web-host';
import type { LarkAuthUser, LarkQrLoginPollResult, PersonalModelSyncResult } from '@/common/types/platform/larkAuth';
import type { PersonalModelAuthClient } from './PersonalModelGatewayService';

export { GeaLarkAuthService as LarkAuthService, GeaLarkAuthServiceError as LarkAuthServiceError };

const GEA_AGENT_CODE = process.env.GEA_AGENT_CODE?.trim() || 'sales_forecast';
const sharedLarkAuthService = new GeaLarkAuthService();
let geaMcpBridgePromise: Promise<GeaMcpBridgeHandle> | null = null;

type PersonalModelGatewayLifecycle = {
  deactivate: () => Promise<void>;
  sync: (user: LarkAuthUser, authClient: PersonalModelAuthClient) => Promise<PersonalModelSyncResult>;
};

let personalModelGateway: PersonalModelGatewayLifecycle | null = null;

export function configureSharedPersonalModelGateway(lifecycle: PersonalModelGatewayLifecycle): void {
  personalModelGateway = lifecycle;
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
  sharedLarkAuthService.logout();
  await personalModelGateway?.deactivate().catch(() => {});
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
