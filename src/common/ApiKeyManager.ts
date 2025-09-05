/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';

/**
 * Multi-API Key Manager with Time-based Blacklisting
 * Handles rotation of multiple API keys for different authentication types
 * Blacklists failed keys for 90 seconds to allow rate limits to recover
 */
export class ApiKeyManager {
  private keys: string[] = [];
  private currentIndex = 0;
  private authType: AuthType;
  private envKey: string;
  private blacklistedUntil: Map<number, number> = new Map(); // keyIndex -> recoveryTimestamp
  private readonly BLACKLIST_DURATION = 90 * 1000; // 90 seconds

  constructor(keysString: string, authType: AuthType) {
    this.authType = authType;
    this.envKey = this.getEnvironmentKey(authType);
    this.keys = this.parseKeys(keysString);
    this.initializeWithRandomKey();
  }

  private getEnvironmentKey(authType: AuthType): string {
    switch (authType) {
      case AuthType.USE_OPENAI:
        return 'OPENAI_API_KEY';
      case AuthType.USE_GEMINI:
        return 'GEMINI_API_KEY';
      default:
        throw new Error(`Multi-key not supported for auth type: ${authType}`);
    }
  }

  private parseKeys(keysString: string): string[] {
    if (!keysString) return [];
    return keysString
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  private initializeWithRandomKey(): void {
    if (this.hasMultipleKeys()) {
      this.currentIndex = Math.floor(Math.random() * this.keys.length);
      this.updateEnvironment();
    }
  }

  private updateEnvironment(): void {
    process.env[this.envKey] = this.keys[this.currentIndex];
  }

  /**
   * Check if multiple keys are available
   */
  hasMultipleKeys(): boolean {
    return this.keys.length > 1;
  }

  /**
   * Rotate to next available key after blacklisting current failed key
   * @returns true if more keys available, false if all keys blacklisted
   */
  rotateKey(): boolean {
    if (!this.hasMultipleKeys()) return false;

    // Blacklist current failed key
    this.blacklistCurrentKey();

    // Find next available (non-blacklisted) key
    const availableIndex = this.findNextAvailableKey();

    if (availableIndex !== -1) {
      const previousIndex = this.currentIndex;
      this.currentIndex = availableIndex;
      this.updateEnvironment();
      console.log(`[MultiKey] Rotated ${this.authType}: #${previousIndex + 1} → #${this.currentIndex + 1}/${this.keys.length}`);
      return true;
    }

    console.log(`[MultiKey] All keys blacklisted for ${this.authType}, falling back`);
    return false;
  }

  /**
   * Blacklist current key for 90 seconds
   */
  private blacklistCurrentKey(): void {
    const recoveryTime = Date.now() + this.BLACKLIST_DURATION;
    this.blacklistedUntil.set(this.currentIndex, recoveryTime);

    const recoveryDate = new Date(recoveryTime);
    console.log(`[MultiKey] Blacklisted ${this.authType} key #${this.currentIndex + 1} until ${recoveryDate.toLocaleTimeString()}`);
  }

  /**
   * Check if a key is currently available (not blacklisted)
   */
  private isKeyAvailable(index: number): boolean {
    const blacklistedUntil = this.blacklistedUntil.get(index);
    if (!blacklistedUntil) return true; // Never been blacklisted

    if (Date.now() >= blacklistedUntil) {
      // Blacklist period expired, remove from blacklist
      this.blacklistedUntil.delete(index);
      console.log(`[MultiKey] ${this.authType} key #${index + 1} recovered from blacklist`);
      return true;
    }

    return false; // Still blacklisted
  }

  /**
   * Find next available key starting from current position
   */
  private findNextAvailableKey(): number {
    // Search all other keys (excluding current)
    for (let i = 1; i < this.keys.length; i++) {
      const candidateIndex = (this.currentIndex + i) % this.keys.length;
      if (this.isKeyAvailable(candidateIndex)) {
        return candidateIndex;
      }
    }
    return -1; // No available keys found
  }

  /**
   * Get current key status for debugging
   */
  getStatus(): {
    authType: AuthType;
    envKey: string;
    current: number;
    total: number;
    keys: string[];
    blacklisted: number[];
  } {
    const now = Date.now();
    const blacklisted: number[] = [];
    // Check which keys are currently blacklisted
    for (const [index, recoveryTime] of this.blacklistedUntil.entries()) {
      if (now < recoveryTime) {
        blacklisted.push(index + 1); // Convert to 1-based indexing for display
      }
    }

    return {
      authType: this.authType,
      envKey: this.envKey,
      current: this.currentIndex + 1,
      total: this.keys.length,
      keys: this.keys,
      blacklisted,
    };
  }

  getCurrentKey(): string {
    if (this.keys.length === 0) return '';
    return this.keys[this.currentIndex] || '';
  }
}
