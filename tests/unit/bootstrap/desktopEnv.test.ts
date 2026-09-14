import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const environmentRoot = path.join(os.tmpdir(), `aibang-desktop-env-${process.pid}`);
const originalConfiguredPath = process.env.DOTENV_CONFIG_PATH;
const originalNewApiUrl = process.env.AIBANG_NEW_API_URL;
const originalNoProxy = process.env.NO_PROXY;
const originalLowercaseNoProxy = process.env.no_proxy;

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => environmentRoot),
    isPackaged: false,
  },
}));

describe('desktop environment loading', () => {
  beforeEach(async () => {
    delete process.env.DOTENV_CONFIG_PATH;
    delete process.env.AIBANG_NEW_API_URL;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    await rm(environmentRoot, { recursive: true, force: true });
    await mkdir(environmentRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(environmentRoot, { recursive: true, force: true });
    if (originalConfiguredPath === undefined) delete process.env.DOTENV_CONFIG_PATH;
    else process.env.DOTENV_CONFIG_PATH = originalConfiguredPath;
    if (originalNewApiUrl === undefined) delete process.env.AIBANG_NEW_API_URL;
    else process.env.AIBANG_NEW_API_URL = originalNewApiUrl;
    if (originalNoProxy === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = originalNoProxy;
    if (originalLowercaseNoProxy === undefined) delete process.env.no_proxy;
    else process.env.no_proxy = originalLowercaseNoProxy;
    vi.resetModules();
  });

  it('loads AIbang configuration from the explicitly configured environment file', async () => {
    const environmentPath = path.join(environmentRoot, 'custom.env');
    await writeFile(environmentPath, 'AIBANG_NEW_API_URL=http://127.0.0.1:9000\n');
    process.env.DOTENV_CONFIG_PATH = environmentPath;

    await import('@/process/utils/desktopEnv');

    expect(process.env.AIBANG_NEW_API_URL).toBe('http://127.0.0.1:9000');
  });

  it('does not override variables already provided by the shell', async () => {
    await writeFile(path.join(environmentRoot, '.env'), 'AIBANG_NEW_API_URL=http://127.0.0.1:9000\n');
    process.env.AIBANG_NEW_API_URL = 'http://127.0.0.1:7000';

    await import('@/process/utils/desktopEnv');

    expect(process.env.AIBANG_NEW_API_URL).toBe('http://127.0.0.1:7000');
  });

  it('leaves environment unchanged when the explicit environment file is missing', async () => {
    process.env.DOTENV_CONFIG_PATH = path.join(environmentRoot, 'missing.env');

    await import('@/process/utils/desktopEnv');

    expect(process.env.AIBANG_NEW_API_URL).toBeUndefined();
  });

  it('bypasses proxies for localhost services', async () => {
    process.env.NO_PROXY = 'internal.example';
    process.env.no_proxy = 'internal.example';

    await import('@/process/utils/desktopEnv');

    expect(process.env.NO_PROXY).toBe('internal.example,127.0.0.1,localhost');
    expect(process.env.no_proxy).toBe('internal.example,127.0.0.1,localhost');
  });
});
