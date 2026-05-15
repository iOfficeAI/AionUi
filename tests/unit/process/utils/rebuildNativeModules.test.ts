import { describe, expect, it } from 'vitest';

import rebuildNativeModules = require('../../../../scripts/rebuildNativeModules.js');

describe('shouldRebuildNativeModules', () => {
  it('rebuilds same-arch macOS packages so native addons target the Electron ABI', () => {
    expect(
      rebuildNativeModules.shouldRebuildNativeModules({
        platform: 'darwin',
        buildArch: 'x64',
        targetArch: 'x64',
        forceRebuild: false,
      })
    ).toBe(true);
  });

  it('rebuilds cross-architecture packages', () => {
    expect(
      rebuildNativeModules.shouldRebuildNativeModules({
        platform: 'darwin',
        buildArch: 'arm64',
        targetArch: 'x64',
        forceRebuild: false,
      })
    ).toBe(true);
  });

  it('keeps the existing Linux same-arch skip unless rebuild is forced', () => {
    expect(
      rebuildNativeModules.shouldRebuildNativeModules({
        platform: 'linux',
        buildArch: 'x64',
        targetArch: 'x64',
        forceRebuild: false,
      })
    ).toBe(false);

    expect(
      rebuildNativeModules.shouldRebuildNativeModules({
        platform: 'linux',
        buildArch: 'x64',
        targetArch: 'x64',
        forceRebuild: true,
      })
    ).toBe(true);
  });
});
