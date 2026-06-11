import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getNotarizeAuthMode, getNotarizeOptions } = require('../../../scripts/afterSign.js');

describe('afterSign notarization credential resolution', () => {
  const appBundleId = 'com.fynlabs.commandeve';
  const appPath = '/tmp/Command EVE.app';

  it('prefers a notarytool keychain profile when configured', () => {
    const options = getNotarizeOptions({
      appBundleId,
      appPath,
      env: {
        NOTARYTOOL_KEYCHAIN_PROFILE: 'command-eve-notary',
        APPLE_ID: 'ignored@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'ignored-password',
      },
    });

    expect(options).toMatchObject({
      tool: 'notarytool',
      appBundleId,
      appPath,
      keychainProfile: 'command-eve-notary',
    });
    expect(options).not.toHaveProperty('appleId');
    expect(getNotarizeAuthMode(options)).toContain('keychain profile');
  });

  it('supports App Store Connect API key credentials', () => {
    const options = getNotarizeOptions({
      appBundleId,
      appPath,
      env: {
        APPLE_API_KEY: '/secure/AuthKey_TEST.p8',
        APPLE_API_KEY_ID: 'ABC123DEFG',
        APPLE_API_ISSUER: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(options).toMatchObject({
      appleApiKey: '/secure/AuthKey_TEST.p8',
      appleApiKeyId: 'ABC123DEFG',
      appleApiIssuer: '00000000-0000-0000-0000-000000000000',
    });
    expect(getNotarizeAuthMode(options)).toBe('App Store Connect API key');
  });

  it('supports Apple ID app-specific password credentials', () => {
    const options = getNotarizeOptions({
      appBundleId,
      appPath,
      env: {
        APPLE_ID: 'developer@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'xxxx-xxxx-xxxx-xxxx',
        APPLE_TEAM_ID: 'NHNQ7Q5H28',
      },
    });

    expect(options).toMatchObject({
      appleId: 'developer@example.com',
      appleIdPassword: 'xxxx-xxxx-xxxx-xxxx',
      teamId: 'NHNQ7Q5H28',
    });
    expect(getNotarizeAuthMode(options)).toBe('Apple ID app-specific password');
  });

  it('keeps legacy env aliases working', () => {
    expect(
      getNotarizeOptions({
        appBundleId,
        appPath,
        env: {
          appleId: 'legacy@example.com',
          appleIdPassword: 'legacy-password',
          teamId: 'NHNQ7Q5H28',
        },
      })
    ).toMatchObject({
      appleId: 'legacy@example.com',
      appleIdPassword: 'legacy-password',
      teamId: 'NHNQ7Q5H28',
    });
  });

  it('returns null when no notarization credentials are configured', () => {
    expect(getNotarizeOptions({ appBundleId, appPath, env: {} })).toBeNull();
  });
});
