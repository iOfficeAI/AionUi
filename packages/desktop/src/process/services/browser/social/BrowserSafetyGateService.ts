/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { SafetyActionType, SafetyGateDetails, SafetyGateRequest } from '@/common/browser/safetyTypes';

type PendingGate = {
  request: SafetyGateRequest;
  resolve: (approved: boolean) => void;
  reject: (err: Error) => void;
};

export class BrowserSafetyGateService extends EventEmitter {
  private pendingRequests: Map<string, PendingGate> = new Map();
  private autoApproveMap: Map<SafetyActionType, boolean> = new Map();

  constructor() {
    super();
    // By default, publishing, sending, deleting, and spending ALL require explicit approval
    this.autoApproveMap.set('publish', false);
    this.autoApproveMap.set('send', false);
    this.autoApproveMap.set('delete', false);
    this.autoApproveMap.set('spend', false);
  }

  public setAutoApprove(actionType: SafetyActionType, enabled: boolean): void {
    this.autoApproveMap.set(actionType, enabled);
  }

  public isAutoApproveEnabled(actionType: SafetyActionType): boolean {
    return this.autoApproveMap.get(actionType) === true;
  }

  public getPendingRequests(): SafetyGateRequest[] {
    return Array.from(this.pendingRequests.values()).map((p) => p.request);
  }

  public async requestApproval(
    actionType: SafetyActionType,
    title: string,
    details: SafetyGateDetails,
    options?: { autoApprove?: boolean; timeoutMs?: number }
  ): Promise<boolean> {
    // If auto-approve is explicitly enabled on workflow or globally
    if (options?.autoApprove || this.isAutoApproveEnabled(actionType)) {
      return true;
    }

    const id = `gate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: SafetyGateRequest = {
      id,
      actionType,
      title,
      details,
      status: 'pending',
      createdAt: Date.now(),
    };

    return new Promise<boolean>((resolve, reject) => {
      const timeoutMs = options?.timeoutMs || 300000; // 5 minutes default timeout
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Safety gate timed out waiting for approval: ${title}`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, {
        request,
        resolve: (approved: boolean) => {
          clearTimeout(timer);
          resolve(approved);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.emit('safetyApprovalRequest', request);
    });
  }

  public respondApproval(requestId: string, approved: boolean, rememberChoice = false): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;

    this.pendingRequests.delete(requestId);
    pending.request.status = approved ? 'approved' : 'rejected';

    if (rememberChoice && approved) {
      this.setAutoApprove(pending.request.actionType, true);
    }

    pending.resolve(approved);
    this.emit('safetyApprovalResolved', { requestId, approved });
    return true;
  }
}

let safetyGateInstance: BrowserSafetyGateService | null = null;

export function getBrowserSafetyGateService(): BrowserSafetyGateService {
  if (!safetyGateInstance) {
    safetyGateInstance = new BrowserSafetyGateService();
  }
  return safetyGateInstance;
}
