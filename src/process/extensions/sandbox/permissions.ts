/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Extension permission declarations — inspired by Figma's manifest permissions model.
 *
 * Extensions declare what capabilities they need. The system validates these
 * declarations and can enforce them at runtime (P2: enforcement layer).
 *
 * Example in aion-extension.json:
 * ```json
 * {
 *   "permissions": {
 *     "storage": true,
 *     "network": { "allowedDomains": ["api.example.com", "*.github.com"] },
 *     "shell": false,
 *     "filesystem": "extension-only",
 *     "clipboard": true
 *   }
 * }
 * ```
 */

// ============ Permission Schemas ============

export const NetworkPermissionSchema = z.union([
  z.boolean(),
  z.object({
    allowedDomains: z.array(z.string()).min(1, 'At least one domain must be specified'),
    /** Reason for requesting network access (displayed to user) */
    reasoning: z.string().optional(),
  }),
]);

export const FilesystemPermissionSchema = z.enum([
  /** Only access files within the extension's own directory */
  'extension-only',
  /** Access workspace files (user's project) */
  'workspace',
  /** Full filesystem access (requires explicit user approval) */
  'full',
]);

export const ExtPermissionsSchema = z
  .object({
    /** Read/write to AionUI persistent storage */
    storage: z.boolean().default(false),
    /** Network access control */
    network: NetworkPermissionSchema.default(false),
    /** Execute system shell commands */
    shell: z.boolean().default(false),
    /** Filesystem access scope */
    filesystem: FilesystemPermissionSchema.default('extension-only'),
    /** Clipboard access */
    clipboard: z.boolean().default(false),
    /** Access to active user info */
    activeUser: z.boolean().default(false),
    /** Access to extension event bus (inter-extension communication) */
    events: z.boolean().default(true),
  })
  .optional();

export type ExtPermissions = z.infer<typeof ExtPermissionsSchema>;

// ============ Permission Types ============

export type PermissionLevel = 'safe' | 'moderate' | 'dangerous';

export interface PermissionSummary {
  name: string;
  description: string;
  level: PermissionLevel;
  granted: boolean;
}

// ============ Permission Analysis ============

/**
 * Analyze declared permissions and produce a human-readable summary.
 * Used by the extension management UI to display permission badges.
 */
export function analyzePermissions(permissions?: ExtPermissions): PermissionSummary[] {
  if (!permissions) {
    return [
      {
        name: 'events',
        description: 'Inter-extension communication',
        level: 'safe',
        granted: true,
      },
    ];
  }

  const summaries: PermissionSummary[] = [];

  // Storage
  summaries.push({
    name: 'storage',
    description: 'Read/write persistent storage',
    level: 'safe',
    granted: permissions.storage ?? false,
  });

  // Network
  const networkPerm = permissions.network;
  if (typeof networkPerm === 'boolean') {
    summaries.push({
      name: 'network',
      description: networkPerm ? 'Unrestricted network access' : 'No network access',
      level: networkPerm ? 'dangerous' : 'safe',
      granted: networkPerm,
    });
  } else if (networkPerm && typeof networkPerm === 'object') {
    summaries.push({
      name: 'network',
      description: `Network access to: ${networkPerm.allowedDomains.join(', ')}`,
      level: 'moderate',
      granted: true,
    });
  }

  // Shell
  summaries.push({
    name: 'shell',
    description: 'Execute system commands',
    level: 'dangerous',
    granted: permissions.shell ?? false,
  });

  // Filesystem
  const fsPerm = permissions.filesystem ?? 'extension-only';
  const fsLevels: Record<string, PermissionLevel> = {
    'extension-only': 'safe',
    workspace: 'moderate',
    full: 'dangerous',
  };
  summaries.push({
    name: 'filesystem',
    description: `Filesystem: ${fsPerm}`,
    level: fsLevels[fsPerm] ?? 'moderate',
    granted: fsPerm !== 'extension-only',
  });

  // Clipboard
  summaries.push({
    name: 'clipboard',
    description: 'Clipboard access',
    level: 'moderate',
    granted: permissions.clipboard ?? false,
  });

  // Active user
  summaries.push({
    name: 'activeUser',
    description: 'Access current user info',
    level: 'moderate',
    granted: permissions.activeUser ?? false,
  });

  // Events (always allowed by default)
  summaries.push({
    name: 'events',
    description: 'Inter-extension communication',
    level: 'safe',
    granted: permissions.events ?? true,
  });

  return summaries;
}

/**
 * Get the overall risk level for an extension based on its permissions.
 */
export function getOverallRiskLevel(permissions?: ExtPermissions): PermissionLevel {
  const summaries = analyzePermissions(permissions);
  if (summaries.some((s) => s.granted && s.level === 'dangerous')) return 'dangerous';
  if (summaries.some((s) => s.granted && s.level === 'moderate')) return 'moderate';
  return 'safe';
}
