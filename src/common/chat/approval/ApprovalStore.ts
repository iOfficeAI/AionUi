/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common approval key interface for permission memory
 * Used by Gemini, ACP, and Codex agents
 */
export type IApprovalKey = {
  /** Operation type: exec, edit, read, info, etc. */
  action: string;
  /** Optional sub-type identifier (e.g., command name, tool name) */
  identifier?: string;
};

/**
 * Common approval store interface
 * Session-level cache for "always allow" decisions
 */
export type IApprovalStore<K extends IApprovalKey = IApprovalKey> = {
  /** Check if key is approved */
  isApproved(key: K): boolean;
  /** Store approval decision */
  approve(key: K): void;
  /** Clear all cached approvals */
  clear(): void;
  /** Number of cached approvals */
  readonly size: number;
};

/**
 * Base implementation of approval store
 * Subclasses can override serializeKey for custom key formats
 */
export class BaseApprovalStore<K extends IApprovalKey = IApprovalKey> implements IApprovalStore<K> {
  protected map = new Map<string, boolean>();

  /**
   * Serialize key to string for Map storage
   * Override this method for custom key serialization
   */
  protected serializeKey(key: K): string {
    return JSON.stringify({
      action: key.action,
      identifier: key.identifier || '',
    });
  }

  isApproved(key: K): boolean {
    return this.map.get(this.serializeKey(key)) === true;
  }

  approve(key: K): void {
    this.map.set(this.serializeKey(key), true);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Check if all keys are approved
   * Accepts base IApprovalKey type for compatibility with IPC calls
   */
  allApproved(keys: IApprovalKey[]): boolean {
    return keys.length > 0 && keys.every((k) => this.isApproved(k as K));
  }

  /**
   * Approve multiple keys at once
   * Accepts base IApprovalKey type for compatibility with IPC calls
   */
  approveAll(keys: IApprovalKey[]): void {
    keys.forEach((k) => this.approve(k as K));
  }
}
