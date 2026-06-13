const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getNotarizeAuthMode, getNotarizeOptions } = require('./afterSign.js');

// COMPA-591: electron-builder's dmg-builder (26.8.x) produces a DMG whose inner
// Mach-O main binary Apple notarization rejects ("signature of the binary is
// invalid"), even though the SAME .app notarizes Accepted as a .zip. A plain
// `hdiutil` DMG built from the identical signed .app passes. So before signing +
// notarizing, we REBUILD each DMG from the already-signed .app via hdiutil. This
// makes the pipeline auto-produce notarizable DMGs with no manual step.

// Resolve the signed .app that belongs to a given DMG artifact. electron-builder
// lays the staged app out under <outDir>/mac-<arch>/ (or <outDir>/mac/ for a
// single/universal build); the DMG filename carries the arch.
function findAppForDmg(dmgPath, context) {
  const outDir = (context && context.outDir) || path.dirname(dmgPath);
  const archMatch = path.basename(dmgPath).match(/mac-(arm64|x64|universal)/);
  const candidateDirs = [];
  if (archMatch) candidateDirs.push(path.join(outDir, `mac-${archMatch[1]}`));
  candidateDirs.push(path.join(outDir, 'mac'));
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const app = fs.readdirSync(dir).find((entry) => entry.endsWith('.app'));
    if (app) return path.join(dir, app);
  }
  return null;
}

// Replace the (notary-invalid) electron-builder DMG at dmgPath with a fresh
// hdiutil DMG built from the signed .app: ditto the .app + an /Applications
// drag-link into a staging dir, then `hdiutil create -format ULFO`. Returns the
// .app path on success (the caller then signs + notarizes the new DMG).
function rebuildDmgWithHdiutil(dmgPath, context) {
  const appPath = findAppForDmg(dmgPath, context);
  if (!appPath) {
    console.log(`Skipping hdiutil DMG rebuild for ${path.basename(dmgPath)} - no matching .app found`);
    return null;
  }
  const productName = path.basename(appPath, '.app');
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-dmg-'));
  const stageDir = path.join(stageRoot, 'dmgroot');
  fs.mkdirSync(stageDir, { recursive: true });
  try {
    // ditto preserves the code signature, symlinks and xattrs of the .app.
    execFileSync('ditto', [appPath, path.join(stageDir, `${productName}.app`)], { stdio: 'inherit' });
    fs.symlinkSync('/Applications', path.join(stageDir, 'Applications'));
    if (fs.existsSync(dmgPath)) fs.rmSync(dmgPath, { force: true });
    execFileSync(
      'hdiutil',
      ['create', '-volname', productName, '-srcfolder', stageDir, '-ov', '-format', 'ULFO', dmgPath],
      { stdio: 'inherit' }
    );
    console.log(
      `Rebuilt ${path.basename(dmgPath)} via hdiutil from ${path.basename(appPath)} (electron-builder dmg-builder produces notary-invalid DMGs).`
    );
    return appPath;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

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
    // Rebuild the DMG from the signed .app first (electron-builder's dmg-builder
    // output fails notarization); then sign + notarize the hdiutil DMG.
    rebuildDmgWithHdiutil(artifactPath, context);
    signDmgArtifact(artifactPath);
    notarizeDmgArtifact(artifactPath);
  }

  return artifactPaths;
};

exports.buildNotarytoolArgs = buildNotarytoolArgs;
exports.findAppForDmg = findAppForDmg;
exports.rebuildDmgWithHdiutil = rebuildDmgWithHdiutil;
exports.getDmgSignIdentity = getDmgSignIdentity;
exports.notarizeDmgArtifact = notarizeDmgArtifact;
exports.signDmgArtifact = signDmgArtifact;
