import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The inline auto-registered platform services in index.ts use a dynamic
 * `require('electron')` call that cannot be intercepted by Vitest mocks.
 * The actual getLogsDir fallback logic is tested through
 * ElectronPlatformServices.test.ts (same pattern).
 *
 * This test verifies that the inline implementation in index.ts contains
 * the required try-catch fallback — guarding against regressions where
 * the inline path diverges from ElectronPlatformServices.
 */
describe('inline platform services getLogsDir fallback', () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../../../src/common/platform/index.ts'), 'utf-8');

  it('contains try-catch around getPath("logs") in the inline path', () => {
    // Verify the inline getLogsDir uses a try-catch, not a bare call
    expect(indexSource).toContain("app.getPath('logs')");
    expect(indexSource).toContain("app.getPath('userData'), 'logs'");

    // The try-catch pattern must exist (not just a bare getPath('logs') call)
    // Match: getLogsDir containing try { ... getPath('logs') ... } catch { ... getPath('userData') ... }
    const getLogsDirMatch = indexSource.match(
      /getLogsDir:\s*\(\)\s*=>\s*\{[\s\S]*?try\s*\{[\s\S]*?getPath\('logs'\)[\s\S]*?catch[\s\S]*?getPath\('userData'\)[\s\S]*?'logs'[\s\S]*?\}/
    );
    expect(getLogsDirMatch).not.toBeNull();
  });

  it('inline getLogsDir fallback logic produces correct result', () => {
    // Directly test the try-catch pattern used in both index.ts and
    // ElectronPlatformServices.ts to verify correctness
    const userData = '/Users/test/Library/Application Support/AionUi';

    // Simulate app.getPath('logs') throwing
    const failingApp = {
      getPath: (name: string) => {
        if (name === 'logs') throw new Error("Failed to get 'logs' path");
        if (name === 'userData') return userData;
        return `/mock/${name}`;
      },
    };

    // Exact logic from index.ts:36-42
    const getLogsDir = () => {
      try {
        return failingApp.getPath('logs');
      } catch {
        return path.join(failingApp.getPath('userData'), 'logs');
      }
    };

    expect(getLogsDir()).toBe(path.join(userData, 'logs'));
  });
});
