/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 持久化文件：userData/renderer-recovery.json
const STATE_FILE = 'renderer-recovery.json';

// 同一崩溃窗口内的重载退避序列；超出后升级为整个应用重启。
export const RENDERER_RELOAD_BACKOFF_MS = [0, 1000, 3000];

// 距上次崩溃超过此时间后视作新一轮故障，重置重载计数。
export const RENDERER_CRASH_RESET_MS = 60 * 1000;

// 应用级自动重启的最小间隔；窗口内再次触发则放弃自动恢复，避免重启死循环。
export const RENDERER_RELAUNCH_THROTTLE_MS = 5 * 60 * 1000;

export type RendererCrashAction = { kind: 'reload'; delayMs: number } | { kind: 'relaunch' } | { kind: 'give-up' };

export interface RendererRecoveryPolicy {
  onCrash(reason: string): RendererCrashAction;
}

interface RecoveryState {
  lastRelaunchAt?: number;
}

function getStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function readState(): RecoveryState {
  try {
    const p = getStatePath();
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as RecoveryState) : {};
  } catch {
    return {};
  }
}

function writeState(state: RecoveryState): void {
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[RendererRecovery] Failed to write recovery state:', err);
  }
}

/**
 * Decides how to recover from a renderer `render-process-gone` event.
 *
 * Ordinary crashes get an in-place reload with backoff. A `launch-failed`
 * renderer can never be recovered by reloading (the process fails before it
 * starts — e.g. app files were replaced by an update while running), so it
 * escalates straight to an app relaunch. Relaunches are throttled through a
 * timestamp persisted in userData so a fresh process that still cannot launch
 * its renderer gives up instead of relaunch-looping.
 */
export function createRendererRecoveryPolicy(now: () => number = Date.now): RendererRecoveryPolicy {
  let attempts = 0;
  let lastCrashAt = 0;

  const escalate = (t: number): RendererCrashAction => {
    const state = readState();
    if (state.lastRelaunchAt && t - state.lastRelaunchAt < RENDERER_RELAUNCH_THROTTLE_MS) {
      return { kind: 'give-up' };
    }
    writeState({ ...state, lastRelaunchAt: t });
    return { kind: 'relaunch' };
  };

  return {
    onCrash(reason: string): RendererCrashAction {
      const t = now();
      if (t - lastCrashAt > RENDERER_CRASH_RESET_MS) attempts = 0;
      lastCrashAt = t;

      // Reloading spawns another renderer launch attempt, which hits the same
      // failure — retrying in-place would recreate the crash storm.
      if (reason === 'launch-failed') return escalate(t);

      if (attempts >= RENDERER_RELOAD_BACKOFF_MS.length) return escalate(t);
      const delayMs = RENDERER_RELOAD_BACKOFF_MS[attempts];
      attempts++;
      return { kind: 'reload', delayMs };
    },
  };
}
