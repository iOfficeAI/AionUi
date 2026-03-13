import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const { listCompiledRuntimeArtifacts, removeCompiledRuntimeArtifacts } = require('../../../scripts/runtimePackagingUtils');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-runtime-packaging-'));
}

describe('runtimePackagingUtils', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('lists only compiled runtime artifacts', () => {
    const runtimeDir = makeTempDir();
    tempDirs.push(runtimeDir);

    fs.writeFileSync(path.join(runtimeDir, 'remote-control.js'), 'js');
    fs.writeFileSync(path.join(runtimeDir, 'channel-service.js'), 'js');
    fs.writeFileSync(path.join(runtimeDir, 'remote-control.exe'), 'exe');
    fs.writeFileSync(path.join(runtimeDir, 'channel-service'), 'bin');
    fs.writeFileSync(path.join(runtimeDir, 'other.exe'), 'other');

    const artifacts = listCompiledRuntimeArtifacts(runtimeDir).sort();

    expect(artifacts).toEqual(['channel-service', 'remote-control.exe']);
  });

  it('removes compiled runtime artifacts and keeps js bundles', () => {
    const runtimeDir = makeTempDir();
    tempDirs.push(runtimeDir);

    fs.writeFileSync(path.join(runtimeDir, 'remote-control.js'), 'js');
    fs.writeFileSync(path.join(runtimeDir, 'channel-service.js'), 'js');
    fs.writeFileSync(path.join(runtimeDir, 'remote-control'), 'bin');
    fs.writeFileSync(path.join(runtimeDir, 'channel-service.exe'), 'exe');

    const removed = removeCompiledRuntimeArtifacts(runtimeDir).sort();

    expect(removed).toEqual(['channel-service.exe', 'remote-control']);
    expect(fs.existsSync(path.join(runtimeDir, 'remote-control.js'))).toBe(true);
    expect(fs.existsSync(path.join(runtimeDir, 'channel-service.js'))).toBe(true);
    expect(fs.existsSync(path.join(runtimeDir, 'remote-control'))).toBe(false);
    expect(fs.existsSync(path.join(runtimeDir, 'channel-service.exe'))).toBe(false);
  });

  it('returns empty list when runtime directory does not exist', () => {
    const runtimeDir = path.join(os.tmpdir(), `missing-${Date.now()}`);
    expect(listCompiledRuntimeArtifacts(runtimeDir)).toEqual([]);
    expect(removeCompiledRuntimeArtifacts(runtimeDir)).toEqual([]);
  });
});
