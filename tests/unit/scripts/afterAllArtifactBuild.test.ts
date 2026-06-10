import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildNotarytoolArgs, getDmgSignIdentity } = require('../../../scripts/afterAllArtifactBuild.js');

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
