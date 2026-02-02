/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ApprovalStore - Session-level approval cache for Codex permissions
 *
 * This implementation is inspired by Codex CLI's ApprovalStore (codex-rs/core/src/tools/sandboxing.rs).
 * It caches "always allow" and "always reject" decisions so that identical
 * or similar operations can be auto-approved/rejected without prompting the user again.
 *
 * Key design:
 * - Uses serialized keys (command + cwd, or file paths) as cache identifiers
 * - Caches "approved_for_session" (allow_always) and "abort" (reject_always) decisions
 * - Scoped to a single conversation/session
 */

export type ReviewDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

/**
 * Key for command execution approval
 */
export interface ExecApprovalKey {
  type: 'exec';
  command: string | string[];
  cwd?: string;
}

/**
 * Key for file change (patch) approval
 */
export interface PatchApprovalKey {
  type: 'patch';
  files: string[];
}

export type ApprovalKey = ExecApprovalKey | PatchApprovalKey;

/**
 * Serialize an approval key to a string for use as a cache key
 */
function serializeKey(key: ApprovalKey): string {
  if (key.type === 'exec') {
    // Preserve command array structure for unambiguous hashing
    const commandArray = Array.isArray(key.command) ? key.command : [key.command];
    return JSON.stringify({ type: 'exec', command: commandArray, cwd: key.cwd || '' });
  } else {
    // Sort files for consistent hashing
    const sortedFiles = [...key.files].sort();
    return JSON.stringify({ type: 'patch', files: sortedFiles });
  }
}

/**
 * ApprovalStore - Caches approval decisions for the session
 */
export class ApprovalStore {
  private map: Map<string, ReviewDecision> = new Map();

  /**
   * Get cached decision for a key
   */
  get(key: ApprovalKey): ReviewDecision | undefined {
    const serialized = serializeKey(key);
    return this.map.get(serialized);
  }

  /**
   * Store a decision for a key
   * Caches approved_for_session (allow_always) and abort (reject_always) decisions
   */
  put(key: ApprovalKey, decision: ReviewDecision): void {
    if (decision === 'approved_for_session' || decision === 'abort') {
      const serialized = serializeKey(key);
      this.map.set(serialized, decision);
    }
  }

  /**
   * Check if key has abort (reject_always) status
   */
  isRejectedForSession(key: ApprovalKey): boolean {
    return this.get(key) === 'abort';
  }

  /**
   * Check if all keys have approved_for_session status
   */
  allApprovedForSession(keys: ApprovalKey[]): boolean {
    if (keys.length === 0) return false;
    return keys.every((key) => this.get(key) === 'approved_for_session');
  }

  /**
   * Store decision for multiple keys at once
   * This is useful when a single approval/rejection covers multiple files/commands
   */
  putAll(keys: ApprovalKey[], decision: ReviewDecision): void {
    if (decision === 'approved_for_session' || decision === 'abort') {
      for (const key of keys) {
        this.put(key, decision);
      }
    }
  }

  /**
   * Clear all cached approvals
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Get the number of cached approvals
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Debug: get all cached keys (for logging)
   */
  getDebugInfo(): { keyCount: number; keys: string[] } {
    return {
      keyCount: this.map.size,
      keys: Array.from(this.map.keys()),
    };
  }
}

/**
 * Create an ExecApprovalKey from exec_approval_request data
 */
export function createExecApprovalKey(command: string | string[], cwd?: string): ExecApprovalKey {
  return {
    type: 'exec',
    command,
    cwd,
  };
}

/**
 * Create a PatchApprovalKey from apply_patch_approval_request data
 */
export function createPatchApprovalKey(files: string[]): PatchApprovalKey {
  return {
    type: 'patch',
    files,
  };
}
