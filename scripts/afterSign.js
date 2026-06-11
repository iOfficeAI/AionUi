const { execFileSync } = require('child_process');

function firstEnv(env, names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getNotarizeOptions({ appBundleId, appPath, env = process.env }) {
  const baseOptions = {
    tool: 'notarytool',
    appBundleId,
    appPath,
  };

  const keychainProfile = firstEnv(env, [
    'NOTARYTOOL_KEYCHAIN_PROFILE',
    'APPLE_NOTARY_KEYCHAIN_PROFILE',
    'COMMAND_EVE_NOTARY_PROFILE',
  ]);
  if (keychainProfile) {
    return {
      ...baseOptions,
      keychainProfile,
    };
  }

  const appleApiKey = firstEnv(env, ['APPLE_API_KEY', 'APPLE_API_KEY_PATH', 'appleApiKey']);
  const appleApiKeyId = firstEnv(env, ['APPLE_API_KEY_ID', 'appleApiKeyId']);
  const appleApiIssuer = firstEnv(env, ['APPLE_API_ISSUER', 'appleApiIssuer']);
  if (appleApiKey && appleApiKeyId && appleApiIssuer) {
    return {
      ...baseOptions,
      appleApiKey,
      appleApiKeyId,
      appleApiIssuer,
    };
  }

  const appleId = firstEnv(env, ['APPLE_ID', 'appleId']);
  const appleIdPassword = firstEnv(env, ['APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_ID_PASSWORD', 'appleIdPassword']);
  const teamId = firstEnv(env, ['APPLE_TEAM_ID', 'teamId']);
  if (appleId && appleIdPassword) {
    const options = {
      ...baseOptions,
      appleId,
      appleIdPassword,
    };
    if (teamId) {
      options.teamId = teamId;
    }
    return options;
  }

  return null;
}

function getNotarizeAuthMode(options) {
  if (options?.keychainProfile) {
    return `keychain profile "${options.keychainProfile}"`;
  }
  if (options?.appleApiKey) {
    return 'App Store Connect API key';
  }
  if (options?.appleId) {
    return 'Apple ID app-specific password';
  }
  return 'unconfigured';
}

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Lazy-load notarize because @electron/notarize is ESM-only
  const { notarize } = await import('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  // Check if app is actually signed before attempting notarization
  try {
    execFileSync('codesign', ['--verify', '--verbose', appPath], { stdio: 'pipe' });
    console.log(`App ${appName} is properly code signed`);
  } catch (error) {
    console.log(`App ${appName} is not code signed, applying ad-hoc signature...`);
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log(`Ad-hoc signature applied successfully to ${appName}`);
    } catch (adHocError) {
      console.error('Ad-hoc signing failed:', adHocError.message);
    }
    return;
  }

  const notarizeOptions = getNotarizeOptions({ appBundleId, appPath });
  if (!notarizeOptions) {
    console.log(
      'Skipping notarization - missing Apple notarization credentials. Set NOTARYTOOL_KEYCHAIN_PROFILE, Apple API key env vars, or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD.'
    );
    return;
  }

  console.log(`Starting notarization for ${appName} (${appBundleId}) using ${getNotarizeAuthMode(notarizeOptions)}...`);

  try {
    await notarize(notarizeOptions);
    console.log('Notarization completed successfully');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};

exports.getNotarizeOptions = getNotarizeOptions;
exports.getNotarizeAuthMode = getNotarizeAuthMode;
