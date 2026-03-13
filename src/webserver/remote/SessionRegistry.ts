/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type { RemoteHandoffSession } from './types';

type OpenSessionInput = {
  userId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
};

export class SessionRegistry {
  private readonly sessions = new Map<string, RemoteHandoffSession>();

  openSession(input: OpenSessionInput): RemoteHandoffSession {
    const now = Date.now();
    const sessionId = input.sessionId || crypto.randomUUID();
    const existing = this.sessions.get(sessionId);

    if (existing) {
      this.assertOwnership(existing, input.userId);
      const next: RemoteHandoffSession = {
        ...existing,
        title: input.title ?? existing.title,
        metadata: input.metadata ?? existing.metadata,
        status: 'active',
        lastActiveAt: now,
      };
      this.sessions.set(next.id, next);
      return next;
    }

    const created: RemoteHandoffSession = {
      id: sessionId,
      userId: input.userId,
      title: input.title || 'Untitled session',
      metadata: input.metadata,
      status: 'active',
      attachedDeviceIds: [],
      createdAt: now,
      lastActiveAt: now,
    };

    this.sessions.set(created.id, created);
    return created;
  }

  attachDevice(userId: string, sessionId: string, deviceId: string): RemoteHandoffSession {
    const existing = this.getOwnedSessionOrThrow(userId, sessionId);
    const nextSet = new Set(existing.attachedDeviceIds);
    nextSet.add(deviceId);

    const next: RemoteHandoffSession = {
      ...existing,
      status: 'active',
      attachedDeviceIds: Array.from(nextSet),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  detachDevice(userId: string, sessionId: string, deviceId: string): RemoteHandoffSession {
    const existing = this.getOwnedSessionOrThrow(userId, sessionId);
    const nextSet = new Set(existing.attachedDeviceIds);
    nextSet.delete(deviceId);

    const next: RemoteHandoffSession = {
      ...existing,
      status: nextSet.size > 0 ? 'active' : 'idle',
      attachedDeviceIds: Array.from(nextSet),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  touch(userId: string, sessionId: string): RemoteHandoffSession {
    const existing = this.getOwnedSessionOrThrow(userId, sessionId);
    const next: RemoteHandoffSession = {
      ...existing,
      lastActiveAt: Date.now(),
      status: existing.attachedDeviceIds.length > 0 ? 'active' : existing.status,
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  closeSession(userId: string, sessionId: string): RemoteHandoffSession {
    const existing = this.getOwnedSessionOrThrow(userId, sessionId);
    const next: RemoteHandoffSession = {
      ...existing,
      status: 'closed',
      attachedDeviceIds: [],
      lastActiveAt: Date.now(),
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  detachDeviceFromAll(userId: string, deviceId: string): RemoteHandoffSession[] {
    const updated: RemoteHandoffSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      if (!session.attachedDeviceIds.includes(deviceId)) continue;

      const nextSet = new Set(session.attachedDeviceIds);
      nextSet.delete(deviceId);

      const next: RemoteHandoffSession = {
        ...session,
        attachedDeviceIds: Array.from(nextSet),
        status: nextSet.size > 0 ? 'active' : 'idle',
        lastActiveAt: Date.now(),
      };

      this.sessions.set(next.id, next);
      updated.push(next);
    }

    return updated;
  }

  listByUser(userId: string): RemoteHandoffSession[] {
    return Array.from(this.sessions.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  getByUserAndId(userId: string, sessionId: string): RemoteHandoffSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }

  private getOwnedSessionOrThrow(userId: string, sessionId: string): RemoteHandoffSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.assertOwnership(session, userId);
    return session;
  }

  private assertOwnership(session: RemoteHandoffSession, userId: string): void {
    if (session.userId !== userId) {
      throw new Error('Session access denied');
    }
  }
}
