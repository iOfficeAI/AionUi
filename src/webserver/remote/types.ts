/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type RemoteClientType = 'desktop' | 'mobile' | 'web' | 'unknown';

export type RemoteSessionStatus = 'active' | 'idle' | 'closed';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type TunnelProvider = 'none' | 'cloudflare' | 'custom';

export interface RemoteDevice {
  id: string;
  userId: string;
  username: string;
  label: string;
  clientType: RemoteClientType;
  userAgent: string;
  ip?: string;
  capabilities: string[];
  connected: boolean;
  connectionCount: number;
  connectedAt: number;
  lastSeenAt: number;
}

export interface RemoteHandoffSession {
  id: string;
  userId: string;
  title: string;
  status: RemoteSessionStatus;
  attachedDeviceIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastActiveAt: number;
}

export interface ApprovalItem {
  id: string;
  userId: string;
  sessionId?: string;
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  resolvedByDeviceId?: string;
  resolvedByUsername?: string;
  resolutionNote?: string;
}

export interface TunnelStatus {
  enabled: boolean;
  provider: TunnelProvider;
  publicUrl?: string;
  message?: string;
  startedAt?: number;
  updatedAt: number;
}

export interface RemoteRuntimeSnapshot {
  devices: RemoteDevice[];
  sessions: RemoteHandoffSession[];
  pendingApprovals: ApprovalItem[];
  tunnel: TunnelStatus;
}
