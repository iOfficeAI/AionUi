import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionLoader } from '../../../src/process/extensions/ExtensionLoader';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/aionui-test'),
  },
}));

const originalEnv = { ...process.env };
const originalCwd = process.cwd();
const tempRoots: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function setSandboxEnv(homeDir: string): void {
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  process.env.APPDATA = path.join(homeDir, 'AppData', 'Roaming');
}

function createExtension(baseDir: string, folderName: string, manifestName: string, version = '1.0.0'): void {
  const extensionDir = path.join(baseDir, folderName);
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'aion-extension.json'),
    JSON.stringify(
      {
        name: manifestName,
        displayName: manifestName,
        version,
        contributes: {},
      },
      null,
      2
    )
  );
}

afterEach(() => {
  process.env = { ...originalEnv };
  process.chdir(originalCwd);

  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('extensions/ExtensionLoader', () => {
  it('prioritizes explicit env extensions over duplicate user-installed extensions and skips implicit examples', async () => {
    const sandbox = createTempDir('aionui-loader-');
    const homeDir = path.join(sandbox, 'home');
    const envDir = path.join(sandbox, 'env-extensions');
    const projectRoot = path.join(sandbox, 'project');

    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(envDir, { recursive: true });
    setSandboxEnv(homeDir);
    process.chdir(projectRoot);
    process.env.AIONUI_EXTENSIONS_PATH = envDir;

    createExtension(path.join(homeDir, '.aionui-dev', 'extensions'), 'ext-shadow', 'ext-shadow', '1.0.0');
    createExtension(envDir, 'ext-shadow', 'ext-shadow', '2.0.0');
    createExtension(path.join(projectRoot, 'examples'), 'dev-example', 'dev-example', '1.0.0');

    const loaded = await new ExtensionLoader().loadAll();
    const extByName = new Map(loaded.map((extension) => [extension.manifest.name, extension]));

    expect(extByName.get('ext-shadow')?.manifest.version).toBe('2.0.0');
    expect(extByName.get('ext-shadow')?.source).toBe('env');
    expect(extByName.has('dev-example')).toBe(false);
  });

  it('keeps E2E discovery hermetic by ignoring user, appdata, and implicit example sources', async () => {
    const sandbox = createTempDir('aionui-loader-e2e-');
    const homeDir = path.join(sandbox, 'home');
    const envDir = path.join(sandbox, 'env-extensions');
    const projectRoot = path.join(sandbox, 'project');
    const appDataExtensionsDir = path.join(homeDir, 'AppData', 'Roaming', 'AionUI', 'extensions');

    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(envDir, { recursive: true });
    setSandboxEnv(homeDir);
    process.chdir(projectRoot);
    process.env.AIONUI_EXTENSIONS_PATH = envDir;
    process.env.AIONUI_E2E_TEST = '1';

    createExtension(path.join(homeDir, '.aionui-dev', 'extensions'), 'user-only', 'user-only');
    createExtension(appDataExtensionsDir, 'appdata-only', 'appdata-only');
    createExtension(path.join(projectRoot, 'examples'), 'dev-example', 'dev-example');
    createExtension(envDir, 'env-only', 'env-only');

    const loaded = await new ExtensionLoader().loadAll();
    const loadedNames = loaded.map((extension) => extension.manifest.name).toSorted();

    expect(loadedNames).toEqual(['env-only']);
  });
});
