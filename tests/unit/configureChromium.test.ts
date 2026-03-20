/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const originalEnv = { ...process.env };

// The real CDP registry file persists across tests and may contain live entries
// from running AionUi instances, causing port conflicts. Back it up and restore.
const REAL_REGISTRY = path.join(os.homedir(), '.aionui-cdp-registry.json');
let savedRegistry: string | null = null;

function createSandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-cdp-test-'));
}

function removeSandbox(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

type SetupOptions = {
  isPackaged?: boolean;
  envPort?: string;
  config?: Record<string, unknown>;
  registry?: Array<Record<string, unknown>>;
};

async function loadConfigureChromium(options: SetupOptions = {}) {
  const sandbox = createSandbox();
  const userDataDir = path.join(sandbox, 'userData');
  fs.mkdirSync(userDataDir, { recursive: true });

  const configPath = path.join(userDataDir, 'cdp.config.json');
  const registryPath = path.join(sandbox, '.aionui-cdp-registry.json');

  if (options.config) {
    fs.writeFileSync(configPath, JSON.stringify(options.config, null, 2), 'utf-8');
  }

  // Write registry to the REAL path because vi.doMock('os') does not properly
  // intercept os.homedir() for Node built-in modules during module-level evaluation.
  // The real registry is backed up/restored in beforeEach/afterEach.
  if (options.registry) {
    fs.writeFileSync(REAL_REGISTRY, JSON.stringify(options.registry, null, 2), 'utf-8');
  }

  process.env = { ...originalEnv };
  delete process.env.AIONUI_CDP_PORT;
  if (options.envPort !== undefined) {
    process.env.AIONUI_CDP_PORT = options.envPort;
  }

  const appendSwitch = vi.fn();
  const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

  vi.resetModules();

  vi.doMock('os', async () => {
    const actual = await vi.importActual<typeof import('os')>('os');
    return {
      ...actual,
      homedir: () => sandbox,
    };
  });

  vi.doMock('electron', () => ({
    app: {
      isPackaged: options.isPackaged ?? false,
      setName: vi.fn(),
      getPath: vi.fn((name: string) => (name === 'userData' ? userDataDir : sandbox)),
      commandLine: {
        appendSwitch,
      },
    },
  }));

  const mod = await import('@process/utils/configureChromium');

  return {
    mod,
    appendSwitch,
    sandbox,
    configPath,
    registryPath,
    restore: () => {
      processOnSpy.mockRestore();
      vi.doUnmock('os');
      vi.doUnmock('electron');
      removeSandbox(sandbox);
    },
  };
}

describe('configureChromium CDP (lightweight mock + file sandbox)', () => {
  const restores: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Backup and clear the real registry to isolate tests from running instances
    try {
      savedRegistry = fs.existsSync(REAL_REGISTRY) ? fs.readFileSync(REAL_REGISTRY, 'utf-8') : null;
      fs.writeFileSync(REAL_REGISTRY, '[]', 'utf-8');
    } catch {
      savedRegistry = null;
    }
  });

  afterEach(() => {
    while (restores.length) {
      const restore = restores.pop();
      restore?.();
    }
    process.env = { ...originalEnv };
    // Restore the real registry
    try {
      if (savedRegistry !== null) {
        fs.writeFileSync(REAL_REGISTRY, savedRegistry, 'utf-8');
      } else if (fs.existsSync(REAL_REGISTRY)) {
        fs.unlinkSync(REAL_REGISTRY);
      }
    } catch {
      // best-effort
    }
  });

  it('Defaults to disabled in packaged builds even when config.enabled=true', async () => {
    const ctx = await loadConfigureChromium({
      isPackaged: true,
      config: { enabled: true, port: 9300 },
    });
    restores.push(ctx.restore);

    expect(ctx.mod.cdpStartupEnabled).toBe(false);
    expect(ctx.mod.cdpPort).toBeNull();
    expect(ctx.appendSwitch).not.toHaveBeenCalled();
  });

  it('Allows explicit CDP enablement via environment variable in packaged builds', async () => {
    const ctx = await loadConfigureChromium({ isPackaged: true, envPort: '9301' });
    restores.push(ctx.restore);

    expect(ctx.mod.cdpStartupEnabled).toBe(true);
    expect(ctx.mod.cdpPort).toBe(9301);
    expect(ctx.appendSwitch).toHaveBeenCalledWith('remote-debugging-port', '9301');
  });

  it('Falls back to the default port constant for an invalid environment variable', async () => {
    const ctx = await loadConfigureChromium({ isPackaged: false, envPort: 'invalid' });
    restores.push(ctx.restore);

    expect(ctx.mod.cdpStartupEnabled).toBe(true);
    expect(ctx.mod.cdpPort).toBe(ctx.mod.DEFAULT_CDP_PORT);
    expect(ctx.appendSwitch).toHaveBeenCalledWith('remote-debugging-port', String(ctx.mod.DEFAULT_CDP_PORT));
  });

  it('Selects the next available port when the registry port is occupied', async () => {
    const ctx = await loadConfigureChromium({
      isPackaged: false,
      config: { enabled: true, port: 9230 },
      registry: [
        {
          pid: process.pid,
          port: 9230,
          cwd: process.cwd(),
          startTime: Date.now(),
        },
      ],
    });
    restores.push(ctx.restore);

    expect(ctx.mod.cdpPort).toBe(9231);
    expect(ctx.appendSwitch).toHaveBeenCalledWith('remote-debugging-port', '9231');
  });

  it('Writes userData/cdp.config.json via saveCdpConfig', async () => {
    const ctx = await loadConfigureChromium({ isPackaged: false });
    restores.push(ctx.restore);

    ctx.mod.saveCdpConfig({ enabled: true, port: 9333 });

    const raw = fs.readFileSync(ctx.configPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ enabled: true, port: 9333 });
  });

  it('Merges updates with existing config via updateCdpConfig', async () => {
    const ctx = await loadConfigureChromium({
      isPackaged: false,
      config: { enabled: false, port: 9235 },
    });
    restores.push(ctx.restore);

    const updated = ctx.mod.updateCdpConfig({ enabled: true });

    expect(updated).toEqual({ enabled: true, port: 9235 });

    const raw = fs.readFileSync(ctx.configPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ enabled: true, port: 9235 });
  });

  describe('getCdpStatus configEnabled field', () => {
    it('returns configEnabled from config file when config.enabled is explicitly set', async () => {
      const ctx = await loadConfigureChromium({
        isPackaged: false,
        config: { enabled: false },
      });
      restores.push(ctx.restore);

      const status = ctx.mod.getCdpStatus();
      expect(status.configEnabled).toBe(false);
    });

    it('falls back to startupEnabled when config file has no enabled field', async () => {
      const ctx = await loadConfigureChromium({
        isPackaged: false,
        config: { port: 9300 },
      });
      restores.push(ctx.restore);

      const status = ctx.mod.getCdpStatus();
      expect(status.configEnabled).toBe(status.startupEnabled);
    });

    it('falls back to startupEnabled when config file does not exist', async () => {
      const ctx = await loadConfigureChromium({ isPackaged: false });
      restores.push(ctx.restore);

      const status = ctx.mod.getCdpStatus();
      expect(status.configEnabled).toBe(status.startupEnabled);
    });

    it('reflects updated config after updateCdpConfig toggles enabled off', async () => {
      const ctx = await loadConfigureChromium({
        isPackaged: false,
        config: { enabled: true },
      });
      restores.push(ctx.restore);

      expect(ctx.mod.getCdpStatus().configEnabled).toBe(true);

      ctx.mod.updateCdpConfig({ enabled: false });

      expect(ctx.mod.getCdpStatus().configEnabled).toBe(false);
    });

    it('reflects updated config after updateCdpConfig toggles enabled on', async () => {
      const ctx = await loadConfigureChromium({
        isPackaged: false,
        config: { enabled: false },
      });
      restores.push(ctx.restore);

      expect(ctx.mod.getCdpStatus().configEnabled).toBe(false);

      ctx.mod.updateCdpConfig({ enabled: true });

      expect(ctx.mod.getCdpStatus().configEnabled).toBe(true);
    });

    it('returns isDevMode=true in unpackaged builds', async () => {
      const ctx = await loadConfigureChromium({ isPackaged: false });
      restores.push(ctx.restore);

      expect(ctx.mod.getCdpStatus().isDevMode).toBe(true);
    });

    it('returns isDevMode=false in packaged builds', async () => {
      const ctx = await loadConfigureChromium({ isPackaged: true });
      restores.push(ctx.restore);

      expect(ctx.mod.getCdpStatus().isDevMode).toBe(false);
    });
  });
});
