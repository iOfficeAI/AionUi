/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TunnelProvider, TunnelStatus } from './types';

export interface TunnelAdapter {
  provider: Exclude<TunnelProvider, 'none'>;
  start(localPort: number): Promise<{ publicUrl?: string; message?: string }>;
  stop(): Promise<void>;
}

class CloudflareTunnelAdapter implements TunnelAdapter {
  provider: Exclude<TunnelProvider, 'none'> = 'cloudflare';

  async start(localPort: number): Promise<{ publicUrl?: string; message?: string }> {
    const configuredUrl = process.env.AIONUI_REMOTE_PUBLIC_URL?.trim();
    if (configuredUrl) {
      return {
        publicUrl: configuredUrl,
        message: `Cloudflare tunnel URL loaded from AIONUI_REMOTE_PUBLIC_URL (local port ${localPort})`,
      };
    }

    return {
      message:
        'Cloudflare adapter is ready, but no public URL is configured. Set AIONUI_REMOTE_PUBLIC_URL or implement cloudflared process bootstrap.',
    };
  }

  async stop(): Promise<void> {
    // Placeholder for cloudflared process shutdown in follow-up implementation.
  }
}

export class TunnelManager {
  private readonly adapters = new Map<Exclude<TunnelProvider, 'none'>, TunnelAdapter>();
  private status: TunnelStatus = {
    enabled: false,
    provider: 'none',
    updatedAt: Date.now(),
  };

  constructor() {
    this.adapters.set('cloudflare', new CloudflareTunnelAdapter());
  }

  async start(provider: Exclude<TunnelProvider, 'none'>, localPort: number): Promise<TunnelStatus> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unsupported tunnel provider: ${provider}`);
    }

    const result = await adapter.start(localPort);
    this.status = {
      enabled: true,
      provider,
      publicUrl: result.publicUrl,
      message: result.message,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    return this.status;
  }

  async stop(): Promise<TunnelStatus> {
    if (this.status.provider !== 'none') {
      const adapter = this.adapters.get(this.status.provider);
      if (adapter) {
        await adapter.stop();
      }
    }

    this.status = {
      enabled: false,
      provider: 'none',
      updatedAt: Date.now(),
    };
    return this.status;
  }

  getStatus(): TunnelStatus {
    return this.status;
  }
}
