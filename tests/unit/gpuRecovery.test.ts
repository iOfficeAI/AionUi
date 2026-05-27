/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/gpuRecovery — covers the threshold-based GPU
 * crash self-healing behavior used to mitigate ELECTRON-9A / ELECTRON-9D.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let userDataDir: string;
const disableHardwareAcceleration = vi.fn();
type ChildProcessGoneListener = (event: unknown, details: { type: string; reason: string; exitCode: number }) => void;
let crashListener: ChildProcessGoneListener | null = null;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir;
      throw new Error(`unexpected getPath: ${name}`);
    },
    disableHardwareAcceleration: (...args: unknown[]) => disableHardwareAcceleration(...args),
    on: (event: string, listener: ChildProcessGoneListener) => {
      if (event === 'child-process-gone') crashListener = listener;
    },
  },
}));

const configFile = () => path.join(userDataDir, 'gpu.config.json');

describe('gpuRecovery', () => {
  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-recovery-test-'));
    disableHardwareAcceleration.mockReset();
    crashListener = null;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('does nothing on first launch with no config', async () => {
    const { applyGpuRecoveryFlags } = await import('@/process/utils/gpuRecovery');
    applyGpuRecoveryFlags();
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('disables hardware acceleration when persisted flag is set', async () => {
    fs.writeFileSync(
      configFile(),
      JSON.stringify({ disableHardwareAcceleration: true, crashCount: 3, lastCrashAt: Date.now() })
    );
    const { applyGpuRecoveryFlags } = await import('@/process/utils/gpuRecovery');
    applyGpuRecoveryFlags();
    expect(disableHardwareAcceleration).toHaveBeenCalledOnce();
  });

  it('user override force-off always disables hardware acceleration', async () => {
    fs.writeFileSync(configFile(), JSON.stringify({ userOverride: 'force-off' }));
    const { applyGpuRecoveryFlags } = await import('@/process/utils/gpuRecovery');
    applyGpuRecoveryFlags();
    expect(disableHardwareAcceleration).toHaveBeenCalledOnce();
  });

  it('user override force-on keeps hardware acceleration even with prior crashes', async () => {
    fs.writeFileSync(
      configFile(),
      JSON.stringify({
        userOverride: 'force-on',
        disableHardwareAcceleration: true,
        crashCount: 5,
        lastCrashAt: Date.now(),
      })
    );
    const { applyGpuRecoveryFlags } = await import('@/process/utils/gpuRecovery');
    applyGpuRecoveryFlags();
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('resets crash counter when last crash is older than 24h', async () => {
    fs.writeFileSync(
      configFile(),
      JSON.stringify({
        disableHardwareAcceleration: true,
        crashCount: 5,
        lastCrashAt: Date.now() - 25 * 60 * 60 * 1000,
      })
    );
    const { applyGpuRecoveryFlags } = await import('@/process/utils/gpuRecovery');
    applyGpuRecoveryFlags();
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
    const cfg = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    expect(cfg.crashCount).toBe(0);
    expect(cfg.disableHardwareAcceleration).toBe(false);
  });

  it('persists disableHardwareAcceleration after crashes reach the threshold', async () => {
    const { installGpuCrashHandler } = await import('@/process/utils/gpuRecovery');
    installGpuCrashHandler();
    expect(crashListener).not.toBeNull();

    const details = { type: 'GPU', reason: 'crashed', exitCode: 1 };
    // Below threshold (default = 3): no auto-disable yet.
    crashListener!({}, details);
    crashListener!({}, details);
    let cfg = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    expect(cfg.crashCount).toBe(2);
    expect(cfg.disableHardwareAcceleration).toBeFalsy();

    // Threshold reached: persist disable flag for next launch.
    crashListener!({}, details);
    cfg = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    expect(cfg.crashCount).toBe(3);
    expect(cfg.disableHardwareAcceleration).toBe(true);
  });

  it('ignores non-GPU child-process-gone events', async () => {
    const { installGpuCrashHandler } = await import('@/process/utils/gpuRecovery');
    installGpuCrashHandler();
    crashListener!({}, { type: 'Utility', reason: 'crashed', exitCode: 1 });
    expect(fs.existsSync(configFile())).toBe(false);
  });

  it('respects user override force-on when handling crashes', async () => {
    fs.writeFileSync(configFile(), JSON.stringify({ userOverride: 'force-on' }));
    const { installGpuCrashHandler } = await import('@/process/utils/gpuRecovery');
    installGpuCrashHandler();
    const details = { type: 'GPU', reason: 'crashed', exitCode: 1 };
    crashListener!({}, details);
    crashListener!({}, details);
    crashListener!({}, details);
    crashListener!({}, details);
    const cfg = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    expect(cfg.crashCount).toBe(4);
    expect(cfg.disableHardwareAcceleration).toBeFalsy();
  });
});
