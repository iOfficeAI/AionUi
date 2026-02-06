/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ApprovalStore - Session-level approval cache for ACP permissions
 *
 * This implementation is inspired by Codex CLI's ApprovalStore.
 * It caches "always allow" decisions so that identical or similar operations
 * can be auto-approved without prompting the user again.
 *
 * Key design:
 * - Uses serialized keys (tool kind + title + rawInput) as cache identifiers
 * - Only caches "allow_always" decisions
 * - Scoped to a single conversation/session
 */

/**
 * Key for ACP tool approval
 */
export interface AcpApprovalKey {
  kind: string; // 'execute', 'edit', 'read', etc.
  title: string; // Tool name/title
  rawInput?: {
    command?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Serialize an approval key to a string for use as a cache key
 *
 * Note: Only key operation identifiers (command, path, file_path) are included
 * in the hash. This means same operation with different descriptions will be
 * treated as identical and auto-approved. This is intentional for better UX -
 * users approve commands/paths, not descriptions.
 */
function serializeKey(key: AcpApprovalKey): string {
  // Normalize rawInput for consistent hashing
  // Only include operation-identifying fields (not descriptions or metadata)
  const normalizedInput: Record<string, unknown> = {};

  if (key.rawInput) {
    // Command is the primary identifier for execute operations
    if (key.rawInput.command) {
      normalizedInput.command = key.rawInput.command;
    }
    // For file operations, include path-related fields
    if (key.rawInput.path) {
      normalizedInput.path = key.rawInput.path;
    }
    if (key.rawInput.file_path) {
      normalizedInput.file_path = key.rawInput.file_path;
    }
  }

  return JSON.stringify({
    kind: key.kind || 'unknown',
    title: key.title || '',
    rawInput: normalizedInput,
  });
}

/**
 * AcpApprovalStore - Caches approval decisions for the ACP session
 */
export class AcpApprovalStore {
  private map: Map<string, string> = new Map(); // key -> optionId

  /**
   * Get cached decision for a key
   */
  get(key: AcpApprovalKey): string | undefined {
    const serialized = serializeKey(key);
    return this.map.get(serialized);
  }

  /**
   * Store a decision for a key
   * Only stores allow_always decisions (the only type worth caching)
   */
  put(key: AcpApprovalKey, optionId: string): void {
    if (optionId === 'allow_always') {
      const serialized = serializeKey(key);
      this.map.set(serialized, optionId);
    }
  }

  /**
   * Check if key has allow_always status
   */
  isApprovedForSession(key: AcpApprovalKey): boolean {
    return this.get(key) === 'allow_always';
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
}

/**
 * Create an AcpApprovalKey from permission request data
 */
export function createAcpApprovalKey(toolCall: { kind?: string; title?: string; rawInput?: Record<string, unknown> }): AcpApprovalKey {
  return {
    kind: toolCall.kind || 'unknown',
    title: toolCall.title || '',
    rawInput: toolCall.rawInput as AcpApprovalKey['rawInput'],
  };
}
