/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel as channelBridge } from '@/common/ipcBridge';
import { getDatabase } from '@/process/database';
import * as crypto from 'crypto';
import type { IChannelPairingRequest, IChannelUser, PluginType } from '../types';

/**
 * Pairing code configuration
 */
const PAIRING_CONFIG = {
  CODE_LENGTH: 6,
  CODE_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
};

/**
 * PairingService - Manages user authorization through pairing codes
 *
 * Flow:
 * 1. User sends /start to bot
 * 2. Bot generates 6-digit pairing code
 * 3. User enters code in AionUi Settings (or code is auto-displayed)
 * 4. Local user approves/rejects the pairing
 * 5. Bot notifies remote user of result
 */
export class PairingService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate a new pairing code for a user
   */
  async generatePairingCode(platformUserId: string, platformType: PluginType, displayName?: string): Promise<{ code: string; expiresAt: number }> {
    const db = getDatabase();

    // Check for existing pending request
    const existingResult = db.getPendingPairingRequests();
    if (existingResult.success && existingResult.data) {
      const existing = existingResult.data.find((r) => r.platformUserId === platformUserId && r.platformType === platformType && r.status === 'pending');

      // Return existing code if not expired
      if (existing && existing.expiresAt > Date.now()) {
        return {
          code: existing.code,
          expiresAt: existing.expiresAt,
        };
      }
    }

    // Generate unique code
    const code = await this.generateUniqueCode();
    const now = Date.now();
    const expiresAt = now + PAIRING_CONFIG.CODE_EXPIRY_MS;

    // Create pairing request
    const request: IChannelPairingRequest = {
      code,
      platformUserId,
      platformType,
      displayName,
      requestedAt: now,
      expiresAt,
      status: 'pending',
    };

    const createResult = db.createPairingRequest(request);
    if (!createResult.success) {
      throw new Error(createResult.error || 'Failed to create pairing request');
    }

    // Emit event for Settings UI
    channelBridge.pairingRequested.emit(request);

    console.log(`[PairingService] Generated code ${code} for ${platformType}:${platformUserId}`);

    return { code, expiresAt };
  }

  /**
   * Refresh pairing code for a user (generate new one)
   */
  async refreshPairingCode(platformUserId: string, platformType: PluginType, displayName?: string): Promise<{ code: string; expiresAt: number }> {
    const db = getDatabase();

    // Expire any existing pending codes
    const existingResult = db.getPendingPairingRequests();
    if (existingResult.success && existingResult.data) {
      for (const request of existingResult.data) {
        if (request.platformUserId === platformUserId && request.platformType === platformType && request.status === 'pending') {
          db.updatePairingRequestStatus(request.code, 'expired');
        }
      }
    }

    // Generate new code
    return this.generatePairingCode(platformUserId, platformType, displayName);
  }

  /**
   * Check if a user is already authorized
   */
  isUserAuthorized(platformUserId: string, platformType: PluginType): boolean {
    const db = getDatabase();
    const result = db.getChannelUserByPlatform(platformUserId, platformType);
    return result.success && result.data !== null;
  }

  /**
   * Get pairing request by code
   */
  getPairingRequest(code: string): IChannelPairingRequest | null {
    const db = getDatabase();
    const result = db.getPairingRequestByCode(code);
    return result.success ? (result.data ?? null) : null;
  }

  /**
   * Get pending pairing request for a user
   */
  getPendingRequestForUser(platformUserId: string, platformType: PluginType): IChannelPairingRequest | null {
    const db = getDatabase();
    const result = db.getPendingPairingRequests();

    if (!result.success || !result.data) {
      return null;
    }

    return result.data.find((r) => r.platformUserId === platformUserId && r.platformType === platformType && r.status === 'pending' && r.expiresAt > Date.now()) ?? null;
  }

  /**
   * Approve a pairing request
   */
  async approvePairing(code: string): Promise<{ success: boolean; user?: IChannelUser; error?: string }> {
    const db = getDatabase();

    // Get the pairing request
    const request = this.getPairingRequest(code);
    if (!request) {
      return { success: false, error: 'Pairing request not found' };
    }

    // Check if expired
    if (request.expiresAt < Date.now()) {
      db.updatePairingRequestStatus(code, 'expired');
      return { success: false, error: 'Pairing code has expired' };
    }

    // Check if already processed
    if (request.status !== 'pending') {
      return { success: false, error: `Pairing request already ${request.status}` };
    }

    // Check if user already exists
    const existingUser = db.getChannelUserByPlatform(request.platformUserId, request.platformType);
    if (existingUser.success && existingUser.data) {
      db.updatePairingRequestStatus(code, 'approved');
      return { success: true, user: existingUser.data };
    }

    // Create authorized user
    const userId = `assistant_user_${Date.now()}_${crypto.randomBytes(4).toString('hex').slice(0, 6)}`;
    const user: IChannelUser = {
      id: userId,
      platformUserId: request.platformUserId,
      platformType: request.platformType,
      displayName: request.displayName,
      authorizedAt: Date.now(),
    };

    const createResult = db.createChannelUser(user);
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }

    // Update pairing request status
    db.updatePairingRequestStatus(code, 'approved');

    // Emit user authorized event
    channelBridge.userAuthorized.emit(user);

    console.log(`[PairingService] Approved pairing for ${request.platformType}:${request.platformUserId}`);
    return { success: true, user };
  }

  /**
   * Reject a pairing request
   */
  async rejectPairing(code: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    // Get the pairing request
    const request = this.getPairingRequest(code);
    if (!request) {
      return { success: false, error: 'Pairing request not found' };
    }

    // Update status
    db.updatePairingRequestStatus(code, 'rejected');

    console.log(`[PairingService] Rejected pairing code ${code}`);
    return { success: true };
  }

  /**
   * Get all pending pairing requests
   */
  getPendingRequests(): IChannelPairingRequest[] {
    const db = getDatabase();
    const result = db.getPendingPairingRequests();

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.filter((r) => r.status === 'pending' && r.expiresAt > Date.now());
  }

  /**
   * Cleanup expired pairing codes
   */
  cleanupExpired(): number {
    const db = getDatabase();
    const result = db.cleanupExpiredPairingRequests();
    return result.success ? (result.data ?? 0) : 0;
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Generate a unique 6-digit pairing code
   */
  private async generateUniqueCode(): Promise<string> {
    const db = getDatabase();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = this.generateRandomCode();

      // Check if code exists
      const existing = db.getPairingRequestByCode(code);
      if (!existing.success || !existing.data) {
        return code;
      }

      // If code exists but expired, we can reuse it
      if (existing.data.status !== 'pending' || existing.data.expiresAt < Date.now()) {
        return code;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique pairing code');
  }

  /**
   * Generate a random 6-digit code
   */
  private generateRandomCode(): string {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < PAIRING_CONFIG.CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupExpired();
      if (cleaned > 0) {
        console.log(`[PairingService] Cleaned up ${cleaned} expired pairing requests`);
      }
    }, PAIRING_CONFIG.CLEANUP_INTERVAL_MS);
  }
}

// Export singleton getter for convenience
let pairingServiceInstance: PairingService | null = null;

export function getPairingService(): PairingService {
  if (!pairingServiceInstance) {
    pairingServiceInstance = new PairingService();
  }
  return pairingServiceInstance;
}
