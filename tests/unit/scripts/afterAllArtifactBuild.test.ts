import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildNotarytoolArgs,
  getDmgSignIdentity,
  findAppForDmg,
  buildStaplerValidateArgs,
  buildSpctlAssessArgs,
  evaluateSpctlAssessment,
  verifyNotarizationStapled,
} = require('../../../scripts/afterAllArtifactBuild.js');

describe('afterAllArtifactBuild DMG notarization helpers', () => {
  it('resolves the configured DMG signing identity', () => {
    expect(
      getDmgSignIdentity({
        APPLE_DMG_SIGN_IDENTITY: 'Developer ID Application: FYN Labs LLC (NHNQ7Q5H28)',
      })
    ).toBe('Developer ID Application: FYN Labs LLC (NHNQ7Q5H28)');
  });

  it('builds notarytool args for a Keychain profile without exposing passwords', () => {
    expect(
      buildNotarytoolArgs(
        {
          keychainProfile: 'command-eve-notary',
        },
        '/tmp/Command EVE.dmg',
        {
          NOTARYTOOL_WAIT_TIMEOUT: '10m',
        }
      )
    ).toEqual([
      'notarytool',
      'submit',
      '/tmp/Command EVE.dmg',
      '--wait',
      '--timeout',
      '10m',
      '--keychain-profile',
      'command-eve-notary',
    ]);
  });

  it('builds notarytool args for an App Store Connect API key', () => {
    expect(
      buildNotarytoolArgs(
        {
          appleApiKey: '/secure/AuthKey_TEST.p8',
          appleApiKeyId: 'ABC123DEFG',
          appleApiIssuer: '00000000-0000-0000-0000-000000000000',
        },
        '/tmp/Command EVE.dmg',
        {}
      )
    ).toEqual([
      'notarytool',
      'submit',
      '/tmp/Command EVE.dmg',
      '--wait',
      '--timeout',
      '20m',
      '--key',
      '/secure/AuthKey_TEST.p8',
      '--key-id',
      'ABC123DEFG',
      '--issuer',
      '00000000-0000-0000-0000-000000000000',
    ]);
  });

  it('does not build DMG notarytool args from Apple ID password credentials', () => {
    expect(
      buildNotarytoolArgs(
        {
          appleId: 'developer@example.com',
          appleIdPassword: 'xxxx-xxxx-xxxx-xxxx',
          teamId: 'NHNQ7Q5H28',
        },
        '/tmp/Command EVE.dmg',
        {}
      )
    ).toBeNull();
  });
});

describe('afterAllArtifactBuild findAppForDmg (COMPA-591 hdiutil pipeline)', () => {
  const tempDirs: string[] = [];
  const makeOutDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-afterbuild-'));
    tempDirs.push(dir);
    return dir;
  };
  const makeApp = (outDir: string, subdir: string): string => {
    const appDir = path.join(outDir, subdir, 'Command EVE.app');
    fs.mkdirSync(appDir, { recursive: true });
    return appDir;
  };
  afterEach(() => {
    while (tempDirs.length) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  });

  it('maps an arm64 DMG to the staged .app under mac-arm64/', () => {
    const outDir = makeOutDir();
    const app = makeApp(outDir, 'mac-arm64');
    makeApp(outDir, 'mac-x64'); // decoy other-arch app must not be chosen
    const dmg = path.join(outDir, 'Command-EVE-1.0.0-alpha.5-mac-arm64.dmg');
    expect(findAppForDmg(dmg, { outDir })).toBe(app);
  });

  it('maps an x64 DMG to the staged .app under mac-x64/', () => {
    const outDir = makeOutDir();
    makeApp(outDir, 'mac-arm64');
    const app = makeApp(outDir, 'mac-x64');
    const dmg = path.join(outDir, 'Command-EVE-1.0.0-alpha.5-mac-x64.dmg');
    expect(findAppForDmg(dmg, { outDir })).toBe(app);
  });

  it('falls back to the generic mac/ dir when no per-arch dir exists', () => {
    const outDir = makeOutDir();
    const app = makeApp(outDir, 'mac');
    const dmg = path.join(outDir, 'Command-EVE-1.0.0-alpha.5-mac-arm64.dmg');
    expect(findAppForDmg(dmg, { outDir })).toBe(app);
  });

  it('returns null when no .app is staged for the DMG', () => {
    const outDir = makeOutDir();
    const dmg = path.join(outDir, 'Command-EVE-1.0.0-alpha.5-mac-arm64.dmg');
    expect(findAppForDmg(dmg, { outDir })).toBeNull();
  });
});

describe('afterAllArtifactBuild notarization self-verification (fail-closed)', () => {
  it('builds stapler validate args for the DMG', () => {
    expect(buildStaplerValidateArgs('/tmp/Command EVE.dmg')).toEqual([
      'stapler',
      'validate',
      '/tmp/Command EVE.dmg',
    ]);
  });

  it('builds spctl open-assessment args with the primary-signature context', () => {
    expect(buildSpctlAssessArgs('/tmp/Command EVE.dmg')).toEqual([
      '-a',
      '-t',
      'open',
      '--context',
      'context:primary-signature',
      '/tmp/Command EVE.dmg',
    ]);
  });

  it('accepts a Notarized Developer ID verdict with exit 0', () => {
    expect(evaluateSpctlAssessment(0, 'accepted\nsource=Notarized Developer ID').ok).toBe(true);
  });

  it('rejects a Gatekeeper-denied artifact', () => {
    expect(evaluateSpctlAssessment(3, 'rejected\nsource=no usable signature').ok).toBe(false);
  });

  it('fails closed when spctl prints accepted but exits non-zero', () => {
    expect(evaluateSpctlAssessment(1, 'accepted').ok).toBe(false);
  });

  it('fails closed when spctl produces no verdict', () => {
    expect(evaluateSpctlAssessment(0, '').ok).toBe(false);
  });

  it('passes verification when stapler validates and spctl accepts', () => {
    const calls: string[] = [];
    const result = verifyNotarizationStapled('/tmp/Command EVE.dmg', {
      runValidate: (p: string) => calls.push(`validate:${p}`),
      runSpctl: () => ({ status: 0, output: 'accepted\nsource=Notarized Developer ID' }),
    });
    expect(result).toBe(true);
    expect(calls).toEqual(['validate:/tmp/Command EVE.dmg']);
  });

  it('throws when stapler validate fails (no ticket stapled)', () => {
    expect(() =>
      verifyNotarizationStapled('/tmp/Command EVE.dmg', {
        runValidate: () => {
          throw new Error('does not have a ticket stapled to it');
        },
        runSpctl: () => ({ status: 0, output: 'accepted' }),
      })
    ).toThrow(/ticket stapled/);
  });

  it('throws when spctl rejects even though staple validated', () => {
    expect(() =>
      verifyNotarizationStapled('/tmp/Command EVE.dmg', {
        runValidate: () => undefined,
        runSpctl: () => ({ status: 3, output: 'rejected\nsource=no usable signature' }),
      })
    ).toThrow(/self-verification FAILED/);
  });
});
