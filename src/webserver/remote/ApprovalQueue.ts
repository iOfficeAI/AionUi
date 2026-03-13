/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type { ApprovalItem, ApprovalStatus } from './types';

type CreateApprovalInput = {
  userId: string;
  title: string;
  summary: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  ttlMs?: number;
};

type ResolveApprovalInput = {
  userId: string;
  approvalId: string;
  status: Extract<ApprovalStatus, 'approved' | 'rejected'>;
  resolvedByDeviceId?: string;
  resolvedByUsername?: string;
  resolutionNote?: string;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class ApprovalQueue {
  private readonly approvals = new Map<string, ApprovalItem>();

  create(input: CreateApprovalInput): ApprovalItem {
    const now = Date.now();
    const item: ApprovalItem = {
      id: crypto.randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
    };

    this.approvals.set(item.id, item);
    return item;
  }

  resolve(input: ResolveApprovalInput): ApprovalItem {
    this.expireStale();
    const existing = this.approvals.get(input.approvalId);
    if (!existing) {
      throw new Error(`Approval not found: ${input.approvalId}`);
    }

    if (existing.userId !== input.userId) {
      throw new Error('Approval access denied');
    }

    if (existing.status !== 'pending') {
      throw new Error(`Approval already resolved: ${existing.status}`);
    }

    const next: ApprovalItem = {
      ...existing,
      status: input.status,
      updatedAt: Date.now(),
      resolvedByDeviceId: input.resolvedByDeviceId,
      resolvedByUsername: input.resolvedByUsername,
      resolutionNote: input.resolutionNote,
    };

    this.approvals.set(next.id, next);
    return next;
  }

  listByUser(userId: string, status?: ApprovalStatus): ApprovalItem[] {
    this.expireStale();
    return Array.from(this.approvals.values())
      .filter((item) => item.userId === userId)
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private expireStale(): void {
    const now = Date.now();

    for (const [id, item] of this.approvals.entries()) {
      if (item.status !== 'pending') continue;
      if (item.expiresAt > now) continue;

      this.approvals.set(id, {
        ...item,
        status: 'expired',
        updatedAt: now,
      });
    }
  }
}
