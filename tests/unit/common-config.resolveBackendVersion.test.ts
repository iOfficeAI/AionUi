import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { resolveBackendVersion } = require('../../scripts/resolveBackendVersion.js');

describe('resolveBackendVersion', () => {
  afterEach(() => {
    delete process.env.AIONUI_BACKEND_VERSION;
  });

  it('prefers env override', () => {
    process.env.AIONUI_BACKEND_VERSION = 'v9.9.9';
    expect(resolveBackendVersion('/does/not/matter')).toBe('v9.9.9');
  });

  it('prefers aioncoreVersion before the legacy key', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-backend-version-'));
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ aioncoreVersion: 'v1.2.3', aionuiBackendVersion: 'v0.1.7' }),
      'utf-8'
    );

    expect(resolveBackendVersion(tempRoot)).toBe('v1.2.3');
  });

  it('falls back to legacy aionuiBackendVersion', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-backend-version-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ aionuiBackendVersion: 'v0.1.7' }), 'utf-8');

    expect(resolveBackendVersion(tempRoot)).toBe('v0.1.7');
  });
});
