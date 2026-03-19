/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/worker/WorkerProtocol.ts

/** Messages sent from main process to worker */
export type MainToWorkerMessage =
  | { type: 'start'; data: unknown }
  | { type: 'stop.stream'; data: Record<string, never> }
  | { type: 'send.message'; data: unknown };

/**
 * Events sent from worker to main process.
 * Agent-specific variants (e.g. 'gemini.message') are defined in
 * src/worker/<agent>.protocol.ts and composed there.
 */
export type WorkerToMainEvent =
  | { type: 'complete'; data: unknown }
  | { type: 'error'; data: unknown }
  | { type: string; data: unknown; pipeId?: string };
