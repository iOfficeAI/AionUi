/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteClientType, RemoteDevice } from './types';

type UpsertDeviceInput = {
  id: string;
  userId: string;
  username: string;
  userAgent: string;
  ip?: string;
  capabilities?: string[];
};

function inferClientType(userAgent: string): RemoteClientType {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('android') || ua.includes('iphone') || ua.includes('ipad') || ua.includes('mobile')) return 'mobile';
  if (ua.includes('electron')) return 'desktop';
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox')) return 'web';
  return 'unknown';
}

function deriveLabel(userAgent: string, fallback: string): string {
  const trimmed = userAgent.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

export class DeviceRegistry {
  private readonly devices = new Map<string, RemoteDevice>();

  upsertConnected(input: UpsertDeviceInput): RemoteDevice {
    const now = Date.now();
    const existing = this.devices.get(input.id);

    if (existing) {
      const next: RemoteDevice = {
        ...existing,
        userId: input.userId,
        username: input.username,
        userAgent: input.userAgent || existing.userAgent,
        ip: input.ip || existing.ip,
        capabilities: input.capabilities ?? existing.capabilities,
        connected: true,
        connectionCount: existing.connectionCount + 1,
        lastSeenAt: now,
      };
      this.devices.set(input.id, next);
      return next;
    }

    const created: RemoteDevice = {
      id: input.id,
      userId: input.userId,
      username: input.username,
      label: deriveLabel(input.userAgent, `device-${input.id.slice(0, 8)}`),
      clientType: inferClientType(input.userAgent),
      userAgent: input.userAgent,
      ip: input.ip,
      capabilities: input.capabilities ?? [],
      connected: true,
      connectionCount: 1,
      connectedAt: now,
      lastSeenAt: now,
    };

    this.devices.set(input.id, created);
    return created;
  }

  markHeartbeat(deviceId: string): RemoteDevice | null {
    const existing = this.devices.get(deviceId);
    if (!existing) return null;

    const next: RemoteDevice = {
      ...existing,
      connected: true,
      lastSeenAt: Date.now(),
    };
    this.devices.set(deviceId, next);
    return next;
  }

  disconnect(deviceId: string): RemoteDevice | null {
    const existing = this.devices.get(deviceId);
    if (!existing) return null;

    const nextCount = Math.max(existing.connectionCount - 1, 0);
    const next: RemoteDevice = {
      ...existing,
      connectionCount: nextCount,
      connected: nextCount > 0,
      lastSeenAt: Date.now(),
    };
    this.devices.set(deviceId, next);
    return next;
  }

  listByUser(userId: string, includeOffline = true): RemoteDevice[] {
    return Array.from(this.devices.values())
      .filter((item) => item.userId === userId)
      .filter((item) => (includeOffline ? true : item.connected))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  getById(deviceId: string): RemoteDevice | null {
    return this.devices.get(deviceId) ?? null;
  }
}
