/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/rendererRecovery — covers the backoff/relaunch
 * policy that stops the renderer 'launch-failed' reload storm (AIONUI-DESKTOP-A).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { vi } from 'vitest';

let userDataDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir;
      throw new Error(`unexpected getPath: ${name}`);
    },
  },
}));

const stateFile = () => path.join(userDataDir, 'renderer-recovery.json');

const loadPolicy = async () => {
  const mod = await import('@/process/utils/rendererRecovery');
  return mod;
};

describe('rendererRecovery', () => {
  let fakeNow: number;
  const now = () => fakeNow;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-recovery-test-'));
    fakeNow = 1_000_000;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('reloads immediately on the first ordinary crash', async () => {
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    expect(policy.onCrash('crashed')).toEqual({ kind: 'reload', delayMs: 0 });
  });

  it('backs off on consecutive crashes', async () => {
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    policy.onCrash('crashed');
    fakeNow += 100;
    expect(policy.onCrash('crashed')).toEqual({ kind: 'reload', delayMs: 1000 });
    fakeNow += 100;
    expect(policy.onCrash('crashed')).toEqual({ kind: 'reload', delayMs: 3000 });
  });

  it('escalates to relaunch once reload attempts are exhausted', async () => {
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    policy.onCrash('crashed');
    policy.onCrash('crashed');
    policy.onCrash('crashed');
    expect(policy.onCrash('crashed')).toEqual({ kind: 'relaunch' });
  });

  it('relaunches directly on launch-failed without trying to reload', async () => {
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    expect(policy.onCrash('launch-failed')).toEqual({ kind: 'relaunch' });
  });

  it('persists the relaunch timestamp so a fresh process can throttle', async () => {
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    policy.onCrash('launch-failed');
    const persisted = JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
    expect(persisted.lastRelaunchAt).toBe(fakeNow);
  });

  it('gives up instead of relaunching again within the throttle window', async () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ lastRelaunchAt: fakeNow - 1000 }));
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    expect(policy.onCrash('launch-failed')).toEqual({ kind: 'give-up' });
  });

  it('relaunches again once the throttle window has passed', async () => {
    const { createRendererRecoveryPolicy, RENDERER_RELAUNCH_THROTTLE_MS } = await loadPolicy();
    fs.writeFileSync(stateFile(), JSON.stringify({ lastRelaunchAt: fakeNow - RENDERER_RELAUNCH_THROTTLE_MS - 1 }));
    const policy = createRendererRecoveryPolicy(now);
    expect(policy.onCrash('launch-failed')).toEqual({ kind: 'relaunch' });
  });

  it('resets reload attempts after a quiet period', async () => {
    const { createRendererRecoveryPolicy, RENDERER_CRASH_RESET_MS } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    policy.onCrash('crashed');
    policy.onCrash('crashed');
    fakeNow += RENDERER_CRASH_RESET_MS + 1;
    expect(policy.onCrash('crashed')).toEqual({ kind: 'reload', delayMs: 0 });
  });

  it('treats a corrupt state file as no prior relaunch', async () => {
    fs.writeFileSync(stateFile(), 'not-json');
    const { createRendererRecoveryPolicy } = await loadPolicy();
    const policy = createRendererRecoveryPolicy(now);
    expect(policy.onCrash('launch-failed')).toEqual({ kind: 'relaunch' });
  });
});
