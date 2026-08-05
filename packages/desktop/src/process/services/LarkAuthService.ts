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

export { GeaLarkAuthService as LarkAuthService, GeaLarkAuthServiceError as LarkAuthServiceError };

const GEA_AGENT_CODE = process.env.GEA_AGENT_CODE?.trim() || 'sales_forecast';
const sharedLarkAuthService = new GeaLarkAuthService();
let geaMcpBridgePromise: Promise<GeaMcpBridgeHandle> | null = null;

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
        return { success: true, data: await sharedLarkAuthService.pollQrSession(qrcodeId) };
      } catch (error) {
        return {
          success: false,
          code: error instanceof GeaLarkAuthServiceError ? error.code : 'serverError',
        };
      }
    },
  };
}

export function ensureGeaMcpBridgeStarted(): Promise<GeaMcpBridgeHandle> {
  geaMcpBridgePromise ??= startGeaMcpBridge(sharedLarkAuthService, GEA_AGENT_CODE);
  return geaMcpBridgePromise;
}
