/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn((_path: string) => false);
const mockExecSync = vi.fn(() => '');

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

function setResourcesPath(value?: string): void {
  Object.defineProperty(process, 'resourcesPath', {
    value,
    configurable: true,
    writable: true,
  });
}

function getBinaryName(): string {
  return process.platform === 'win32' ? 'aionrs.exe' : 'aionrs';
}

describe('aionrs binaryResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setResourcesPath(undefined);
  });

  afterEach(() => {
    setResourcesPath(originalResourcesPath);
  });

  it('prefers a prepared dev binary under resources when available', async () => {
    const devBinary = `${process.cwd()}/resources/bundled-aionrs/${process.platform}-${process.arch}/${getBinaryName()}`;
    mockExistsSync.mockImplementation((path) => path === devBinary);

    const { resolveAionrsBinary } = await import('../../../../src/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe(devBinary);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('prefers packaged resourcesPath binary before the dev resources fallback', async () => {
    const packagedBinary = `/Applications/AionUi.app/Contents/Resources/bundled-aionrs/${process.platform}-${process.arch}/${getBinaryName()}`;
    const devBinary = `${process.cwd()}/resources/bundled-aionrs/${process.platform}-${process.arch}/${getBinaryName()}`;
    setResourcesPath('/Applications/AionUi.app/Contents/Resources');
    mockExistsSync.mockImplementation((path) => path === packagedBinary || path === devBinary);

    const { resolveAionrsBinary } = await import('../../../../src/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe(packagedBinary);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('falls back to PATH when neither packaged nor dev resources contain aionrs', async () => {
    const pathBinary = '/usr/local/bin/aionrs';
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'which aionrs' || command === 'where aionrs') {
        return `${pathBinary}\n`;
      }
      return '';
    });
    mockExistsSync.mockImplementation((path) => path === pathBinary);

    const { resolveAionrsBinary } = await import('../../../../src/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe(pathBinary);
  });
});
