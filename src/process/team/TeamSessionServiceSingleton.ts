/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton TeamSessionService instance.
 * This module exports the global TeamSessionService instance created in initBridge.ts.
 * The actual instance is initialized in src/process/utils/initBridge.ts.
 */

import type { TeamSessionService } from './TeamSessionService';

// The singleton instance - will be initialized in initBridge.ts
export let teamSessionServiceSingleton: TeamSessionService | null = null;

/**
 * Set the singleton instance. Called by initBridge.ts during app initialization.
 */
export function setTeamSessionServiceSingleton(instance: TeamSessionService): void {
  teamSessionServiceSingleton = instance;
}
