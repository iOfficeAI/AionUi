/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { GatewayStore } from './gatewayStore';
import { QuotaMonitor } from './quotaMonitor';
import { ComboRouter } from './comboRouter';
import { GatewayServer } from './gatewayServer';
import type { GatewayStatus } from '@/common/types/gateway/gatewayTypes';

class GatewayServiceManager {
  private store: GatewayStore;
  private quotaMonitor: QuotaMonitor;
  private router: ComboRouter;
  private server: GatewayServer;
  private isStarted = false;

  constructor() {
    this.store = new GatewayStore();
    this.quotaMonitor = new QuotaMonitor(this.store);
    this.router = new ComboRouter(this.store, this.quotaMonitor);
    this.server = new GatewayServer(this.store, this.router);
  }

  async start(): Promise<number> {
    if (this.isStarted) {
      return this.server.getPort();
    }
    const port = await this.server.start();
    this.isStarted = true;
    return port;
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    await this.server.stop();
    this.isStarted = false;
  }

  getStore(): GatewayStore {
    return this.store;
  }

  getQuotaMonitor(): QuotaMonitor {
    return this.quotaMonitor;
  }

  getRouter(): ComboRouter {
    return this.router;
  }

  getServer(): GatewayServer {
    return this.server;
  }

  getStatus(): GatewayStatus {
    const accounts = this.store.getAccounts();
    const combos = this.store.getCombos();
    const now = Date.now();
    const activeCooldowns = accounts.filter((a) => a.cooldownUntil && a.cooldownUntil > now).length;

    return {
      running: this.isStarted,
      port: this.server.getPort(),
      accountsCount: accounts.length,
      combosCount: combos.length,
      activeCooldownsCount: activeCooldowns,
    };
  }

  /**
   * Automatically registers or updates the native gateway as an active provider in aioncore (/api/providers).
   */
  async syncWithBackend(): Promise<void> {
    const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
    if (!port || !this.isStarted) {
      return;
    }

    try {
      const combos = this.store.getCombos().filter((c) => c.enabled);
      const accounts = this.store.getAccounts().filter((a) => a.enabled);

      const modelsSet = new Set<string>();
      for (const c of combos) {
        modelsSet.add(c.name);
        if (c.id !== c.name) {
          modelsSet.add(c.id);
        }
      }
      for (const a of accounts) {
        for (const m of a.models) {
          modelsSet.add(m);
          modelsSet.add(`${a.name}:${m}`);
        }
      }

      const models = Array.from(modelsSet);
      if (models.length === 0) {
        models.push('default-combo');
      }

      const providerPayload = {
        id: 'aionui-native-gateway',
        name: 'Gateway & Combos (OmniRoute)',
        platform: 'custom',
        base_url: `http://127.0.0.1:${this.server.getPort()}/v1`,
        api_key: 'sk-aionui-gateway',
        models,
        enabled: true,
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };

      const listRes = await fetch(`http://127.0.0.1:${port}/api/providers`);
      if (listRes.ok) {
        const providers = (await listRes.json()) as Array<{ id: string }>;
        const exists = Array.isArray(providers) && providers.some((p) => p.id === 'aionui-native-gateway');

        if (exists) {
          await fetch(`http://127.0.0.1:${port}/api/providers/aionui-native-gateway`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerPayload),
          });
        } else {
          await fetch(`http://127.0.0.1:${port}/api/providers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerPayload),
          });
        }
      }
    } catch (err) {
      console.warn('[GatewayService] Failed to sync provider with aioncore:', err);
    }
  }
}

let instance: GatewayServiceManager | null = null;

export function getGatewayService(): GatewayServiceManager {
  if (!instance) {
    instance = new GatewayServiceManager();
  }
  return instance;
}
