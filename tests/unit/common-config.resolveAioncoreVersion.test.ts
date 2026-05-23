import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { resolveAioncoreVersion } = require('../../scripts/resolveAioncoreVersion.js');

describe('resolveAioncoreVersion', () => {
  afterEach(() => {
    delete process.env.AIONCORE_VERSION;
  });

  it('prefers env override', () => {
    process.env.AIONCORE_VERSION = 'v9.9.9';
    expect(resolveAioncoreVersion('/does/not/matter')).toBe('v9.9.9');
  });

  it('reads aioncoreVersion from package.json first', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-aioncore-version-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ aioncoreVersion: 'v1.2.3' }), 'utf-8');

    expect(resolveAioncoreVersion(tempRoot)).toBe('v1.2.3');
  });

  it('falls back to latest when aioncoreVersion is absent', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-aioncore-version-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({}), 'utf-8');

    expect(resolveAioncoreVersion(tempRoot)).toBe('latest');
  });
});
