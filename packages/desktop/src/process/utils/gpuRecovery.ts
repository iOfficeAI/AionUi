/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 持久化文件：userData/gpu.config.json
const GPU_CONFIG_FILE = 'gpu.config.json';

// 连续 GPU 崩溃达到此阈值后，下次启动自动关闭硬件加速。
const GPU_CRASH_THRESHOLD = 3;

// 距上次崩溃超过此时间后视作偶发，重置计数并尝试恢复硬件加速。
const GPU_CRASH_RESET_MS = 24 * 60 * 60 * 1000;

type GpuOverride = 'force-on' | 'force-off';

interface GpuConfig {
  disableHardwareAcceleration?: boolean;
  crashCount?: number;
  lastCrashAt?: number;
  /** 用户手动开关：force-on 永远启用硬件加速；force-off 永远禁用。 */
  userOverride?: GpuOverride;
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), GPU_CONFIG_FILE);
}

function readConfig(): GpuConfig {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as GpuConfig) : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: GpuConfig): void {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[GPU] Failed to write gpu config:', err);
  }
}

/**
 * Must be called BEFORE app.ready.
 * Reads persisted gpu config and disables hardware acceleration if needed.
 */
export function applyGpuRecoveryFlags(): void {
  const cfg = readConfig();

  if (cfg.userOverride === 'force-off') {
    app.disableHardwareAcceleration();
    console.log('[GPU] hardware acceleration disabled (user override)');
    return;
  }
  if (cfg.userOverride === 'force-on') {
    return;
  }

  // 距上次崩溃超过重置窗口：清理状态，恢复硬件加速。
  if (cfg.lastCrashAt && Date.now() - cfg.lastCrashAt > GPU_CRASH_RESET_MS) {
    if (cfg.disableHardwareAcceleration || (cfg.crashCount ?? 0) > 0) {
      writeConfig({ ...cfg, crashCount: 0, disableHardwareAcceleration: false });
      console.log('[GPU] crash counter reset (no recent GPU crashes)');
    }
    return;
  }

  if (cfg.disableHardwareAcceleration) {
    app.disableHardwareAcceleration();
    console.log(`[GPU] hardware acceleration disabled (auto, after ${cfg.crashCount ?? 0} consecutive GPU crashes)`);
  }
}

/**
 * Public status used by the settings UI.
 * autoDisabled is the auto-recovery flag actually applied at this launch.
 * userOverride lets users force-on/force-off; takes precedence over autoDisabled.
 */
export interface GpuStatus {
  userOverride: GpuOverride | null;
  autoDisabled: boolean;
  crashCount: number;
  lastCrashAt: number | null;
}

export function getGpuStatus(): GpuStatus {
  const cfg = readConfig();
  return {
    userOverride: cfg.userOverride ?? null,
    autoDisabled: cfg.disableHardwareAcceleration ?? false,
    crashCount: cfg.crashCount ?? 0,
    lastCrashAt: cfg.lastCrashAt ?? null,
  };
}

/**
 * Persist the user's hardware-acceleration override.
 * Pass null to clear the override (revert to auto-recovery behavior).
 * Takes effect on next app launch — caller should prompt for restart.
 */
export function setGpuUserOverride(override: GpuOverride | null): GpuStatus {
  const cfg = readConfig();
  const next: GpuConfig = { ...cfg };
  if (override === null) {
    delete next.userOverride;
  } else {
    next.userOverride = override;
  }
  // Reset auto-disable counter so user can re-enable cleanly.
  next.crashCount = 0;
  next.disableHardwareAcceleration = false;
  writeConfig(next);
  return getGpuStatus();
}

/**
 * Install after app is ready.
 * Listens for GPU child-process crashes; once the count reaches the threshold,
 * persists disableHardwareAcceleration=true so the next launch starts in CPU mode.
 */
export function installGpuCrashHandler(): void {
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return;

    const cfg = readConfig();
    const nextCount = (cfg.crashCount ?? 0) + 1;
    const next: GpuConfig = {
      ...cfg,
      crashCount: nextCount,
      lastCrashAt: Date.now(),
    };

    if (nextCount >= GPU_CRASH_THRESHOLD && cfg.userOverride !== 'force-on') {
      next.disableHardwareAcceleration = true;
      console.warn(
        `[GPU] crashed ${nextCount} times (reason=${details.reason}, exitCode=${details.exitCode}); ` +
          'hardware acceleration will be disabled on next launch.'
      );
    } else {
      console.warn(
        `[GPU] crashed ${nextCount}/${GPU_CRASH_THRESHOLD} (reason=${details.reason}, exitCode=${details.exitCode})`
      );
    }

    writeConfig(next);
  });
}
