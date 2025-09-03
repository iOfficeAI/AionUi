/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/storage';
import type { AcpBackend } from './AcpConnection';

export interface AcpBackendConfig {
  authMethodId?: string;
  authToken?: string;
  lastAuthTime?: number;
  cliPath?: string;
}

export class AcpConfigManager {
  private static async getConfig(): Promise<Record<string, AcpBackendConfig | undefined>> {
    try {
      const config = await ConfigStorage.get('acp.config');
      return config || {};
    } catch (error) {
      return {};
    }
  }

  private static async setConfig(config: Record<string, AcpBackendConfig | undefined>): Promise<void> {
    try {
      await ConfigStorage.set('acp.config', config);
    } catch (error) {}
  }

  static async getBackendConfig(backend: AcpBackend): Promise<AcpBackendConfig | undefined> {
    const config = await this.getConfig();
    return config[backend];
  }

  static async setBackendConfig(backend: AcpBackend, backendConfig: AcpBackendConfig): Promise<void> {
    const config = await this.getConfig();
    config[backend] = backendConfig;
    await this.setConfig(config);
  }

  static async saveAuthInfo(backend: AcpBackend, authMethodId: string, authToken?: string): Promise<void> {
    const existingConfig = await this.getBackendConfig(backend);
    await this.setBackendConfig(backend, {
      ...existingConfig,
      authMethodId,
      authToken,
      lastAuthTime: Date.now(),
    });
  }

  static async clearAuthInfo(backend: AcpBackend): Promise<void> {
    const existingConfig = await this.getBackendConfig(backend);
    await this.setBackendConfig(backend, {
      ...existingConfig,
      authMethodId: undefined,
      authToken: undefined,
      lastAuthTime: undefined,
    });
  }

  static async isAuthValid(backend: AcpBackend, maxAge: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    const config = await this.getBackendConfig(backend);
    if (!config?.authMethodId || !config?.lastAuthTime) {
      return false;
    }

    const age = Date.now() - config.lastAuthTime;
    return age < maxAge;
  }

  static async getValidAuthInfo(backend: AcpBackend): Promise<{ authMethodId: string; authToken?: string } | null> {
    const isValid = await this.isAuthValid(backend);
    if (!isValid) {
      return null;
    }

    const config = await this.getBackendConfig(backend);
    if (!config?.authMethodId) {
      return null;
    }

    return {
      authMethodId: config.authMethodId,
      authToken: config.authToken,
    };
  }

  static async saveCliPath(backend: AcpBackend, cliPath: string): Promise<void> {
    const existingConfig = await this.getBackendConfig(backend);
    await this.setBackendConfig(backend, {
      ...existingConfig,
      cliPath,
    });
  }

  static async getCliPath(backend: AcpBackend): Promise<string | undefined> {
    const config = await this.getBackendConfig(backend);
    return config?.cliPath;
  }

  static async clearAllConfig(): Promise<void> {
    await this.setConfig({});
  }
}
