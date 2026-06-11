const { execFileSync } = require('child_process');
const path = require('path');

const { getNotarizeAuthMode, getNotarizeOptions } = require('./afterSign.js');

function firstEnv(env, names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getDmgSignIdentity(env = process.env) {
  return firstEnv(env, ['APPLE_DMG_SIGN_IDENTITY', 'APPLE_DEVELOPER_IDENTITY', 'CSC_NAME']);
}

function buildNotarytoolArgs(options, artifactPath, env = process.env) {
  const timeout = firstEnv(env, ['NOTARYTOOL_WAIT_TIMEOUT']) || '20m';
  const args = ['notarytool', 'submit', artifactPath, '--wait', '--timeout', timeout];

  if (options?.keychainProfile) {
    args.push('--keychain-profile', options.keychainProfile);
    return args;
  }

  if (options?.appleApiKey && options?.appleApiKeyId && options?.appleApiIssuer) {
    args.push('--key', options.appleApiKey);
    args.push('--key-id', options.appleApiKeyId);
    args.push('--issuer', options.appleApiIssuer);
    return args;
  }

  return null;
}

function signDmgArtifact(artifactPath, env = process.env) {
  const identity = getDmgSignIdentity(env);
  if (!identity) {
    console.log(`Skipping DMG code signature for ${path.basename(artifactPath)} - missing APPLE_DMG_SIGN_IDENTITY`);
    return false;
  }

  execFileSync('codesign', ['--force', '--sign', identity, '--timestamp', artifactPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--verbose=2', artifactPath], { stdio: 'inherit' });
  return true;
}

function notarizeDmgArtifact(artifactPath, env = process.env) {
  const options = getNotarizeOptions({
    appBundleId: 'dmg-artifact',
    appPath: artifactPath,
    env,
  });
  if (!options) {
    console.log(
      `Skipping DMG notarization for ${path.basename(artifactPath)} - missing Apple notarization credentials`
    );
    return false;
  }

  const args = buildNotarytoolArgs(options, artifactPath, env);
  if (!args) {
    console.log(
      `Skipping DMG notarization for ${path.basename(artifactPath)} - ${getNotarizeAuthMode(options)} is only supported by afterSign app notarization. Use a notarytool Keychain profile or App Store Connect API key for DMG artifacts.`
    );
    return false;
  }

  console.log(`Starting DMG notarization for ${path.basename(artifactPath)} using ${getNotarizeAuthMode(options)}...`);
  execFileSync('xcrun', args, { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'staple', artifactPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', artifactPath], { stdio: 'inherit' });
  return true;
}

exports.default = async function afterAllArtifactBuild(context) {
  if (process.platform !== 'darwin') {
    return context.artifactPaths;
  }

  const artifactPaths = Array.isArray(context.artifactPaths) ? context.artifactPaths : [];
  const dmgArtifacts = artifactPaths.filter((artifactPath) => artifactPath.endsWith('.dmg'));

  for (const artifactPath of dmgArtifacts) {
    signDmgArtifact(artifactPath);
    notarizeDmgArtifact(artifactPath);
  }

  return artifactPaths;
};

exports.buildNotarytoolArgs = buildNotarytoolArgs;
exports.getDmgSignIdentity = getDmgSignIdentity;
exports.notarizeDmgArtifact = notarizeDmgArtifact;
exports.signDmgArtifact = signDmgArtifact;
