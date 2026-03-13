/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { DeviceRegistry } from './DeviceRegistry';
import { SessionRegistry } from './SessionRegistry';
import { ApprovalQueue } from './ApprovalQueue';
import { TunnelManager } from './TunnelManager';
import type { ApprovalItem, RemoteDevice, RemoteHandoffSession, RemoteRuntimeSnapshot, TunnelStatus } from './types';

type DeviceConnectInput = {
  deviceId: string;
  userId: string;
  username: string;
  userAgent: string;
  ip?: string;
  capabilities?: string[];
};

type ApprovalCreateInput = {
  userId: string;
  title: string;
  summary: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  ttlMs?: number;
};

export class RemoteRuntimeHub extends EventEmitter {
  private readonly devices = new DeviceRegistry();
  private readonly sessions = new SessionRegistry();
  private readonly approvals = new ApprovalQueue();
  private readonly tunnel = new TunnelManager();
  private currentPort = 25808;

  configure(port: number): void {
    this.currentPort = port;
  }

  registerDevice(input: DeviceConnectInput): RemoteDevice {
    const device = this.devices.upsertConnected({
      id: input.deviceId,
      userId: input.userId,
      username: input.username,
      userAgent: input.userAgent,
      ip: input.ip,
      capabilities: input.capabilities,
    });

    this.emit('remote.devices.updated', {
      userId: input.userId,
      devices: this.listDevices(input.userId),
    });

    return device;
  }

  markDeviceAlive(userId: string, deviceId: string): RemoteDevice | null {
    const device = this.devices.markHeartbeat(deviceId);
    if (device && device.userId === userId) {
      this.emit('remote.devices.updated', { userId, devices: this.listDevices(userId) });
      return device;
    }
    return null;
  }

  unregisterDevice(userId: string, deviceId: string): RemoteDevice | null {
    const device = this.devices.disconnect(deviceId);
    if (!device || device.userId !== userId) return null;

    const changedSessions = this.sessions.detachDeviceFromAll(userId, deviceId);
    this.emit('remote.devices.updated', { userId, devices: this.listDevices(userId) });
    if (changedSessions.length > 0) {
      this.emit('remote.sessions.updated', { userId, sessions: this.listSessions(userId) });
    }

    return device;
  }

  listDevices(userId: string): RemoteDevice[] {
    return this.devices.listByUser(userId, true);
  }

  openSession(userId: string, title?: string, metadata?: Record<string, unknown>, sessionId?: string): RemoteHandoffSession {
    const session = this.sessions.openSession({
      userId,
      title,
      metadata,
      sessionId,
    });

    this.emit('remote.sessions.updated', {
      userId,
      sessions: this.listSessions(userId),
    });

    return session;
  }

  attachSession(userId: string, sessionId: string, deviceId: string): RemoteHandoffSession {
    const session = this.sessions.attachDevice(userId, sessionId, deviceId);
    this.emit('remote.sessions.updated', { userId, sessions: this.listSessions(userId) });
    return session;
  }

  detachSession(userId: string, sessionId: string, deviceId: string): RemoteHandoffSession {
    const session = this.sessions.detachDevice(userId, sessionId, deviceId);
    this.emit('remote.sessions.updated', { userId, sessions: this.listSessions(userId) });
    return session;
  }

  touchSession(userId: string, sessionId: string): RemoteHandoffSession {
    const session = this.sessions.touch(userId, sessionId);
    this.emit('remote.sessions.updated', { userId, sessions: this.listSessions(userId) });
    return session;
  }

  listSessions(userId: string): RemoteHandoffSession[] {
    return this.sessions.listByUser(userId);
  }

  createApproval(input: ApprovalCreateInput): ApprovalItem {
    const item = this.approvals.create(input);
    this.emit('remote.approvals.updated', {
      userId: input.userId,
      approvals: this.listPendingApprovals(input.userId),
    });
    return item;
  }

  resolveApproval(
    userId: string,
    approvalId: string,
    status: 'approved' | 'rejected',
    resolvedByDeviceId?: string,
    resolvedByUsername?: string,
    resolutionNote?: string
  ): ApprovalItem {
    const item = this.approvals.resolve({
      userId,
      approvalId,
      status,
      resolvedByDeviceId,
      resolvedByUsername,
      resolutionNote,
    });

    this.emit('remote.approvals.updated', {
      userId,
      approvals: this.listPendingApprovals(userId),
    });

    return item;
  }

  listPendingApprovals(userId: string): ApprovalItem[] {
    return this.approvals.listByUser(userId, 'pending');
  }

  listApprovals(userId: string): ApprovalItem[] {
    return this.approvals.listByUser(userId);
  }

  async startTunnel(provider: 'cloudflare' | 'custom'): Promise<TunnelStatus> {
    const status = provider === 'custom' ? await this.startCustomTunnel() : await this.tunnel.start(provider, this.currentPort);
    this.emit('remote.tunnel.updated', { status });
    return status;
  }

  async stopTunnel(): Promise<TunnelStatus> {
    const status = await this.tunnel.stop();
    this.emit('remote.tunnel.updated', { status });
    return status;
  }

  getTunnelStatus(): TunnelStatus {
    return this.tunnel.getStatus();
  }

  getSnapshot(userId: string): RemoteRuntimeSnapshot {
    return {
      devices: this.listDevices(userId),
      sessions: this.listSessions(userId),
      pendingApprovals: this.listPendingApprovals(userId),
      tunnel: this.getTunnelStatus(),
    };
  }

  private async startCustomTunnel(): Promise<TunnelStatus> {
    const configuredUrl = process.env.AIONUI_REMOTE_PUBLIC_URL?.trim();
    const now = Date.now();
    if (!configuredUrl) {
      return {
        enabled: true,
        provider: 'custom',
        updatedAt: now,
        startedAt: now,
        message: 'Custom tunnel mode enabled. Please set AIONUI_REMOTE_PUBLIC_URL to expose the public endpoint.',
      };
    }

    return {
      enabled: true,
      provider: 'custom',
      publicUrl: configuredUrl,
      updatedAt: now,
      startedAt: now,
      message: 'Custom public URL loaded from AIONUI_REMOTE_PUBLIC_URL.',
    };
  }
}

let runtimeHub: RemoteRuntimeHub | null = null;

export function initRemoteRuntimeHub(port: number): RemoteRuntimeHub {
  if (!runtimeHub) {
    runtimeHub = new RemoteRuntimeHub();
  }
  runtimeHub.configure(port);
  return runtimeHub;
}

export function getRemoteRuntimeHub(): RemoteRuntimeHub {
  if (!runtimeHub) {
    runtimeHub = new RemoteRuntimeHub();
  }
  return runtimeHub;
}
