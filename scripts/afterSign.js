const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  enumerateMachOFiles,
  planPythonCodesign,
  buildAppResignArgs,
  resolvePythonRoot,
} = require('./deepSignPython_core.js');

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

// The Developer ID used to sign the bundled python tree. Reuse the SAME
// identity electron-builder used for the .app so the re-signed nested binaries
// stay in the FYN Labs team (referenced by NAME, never embedded). CSC_NAME is
// electron-builder's own var; APPLE_DEVELOPER_IDENTITY/APPLE_DMG_SIGN_IDENTITY
// are the ones the notarized build scripts already set.
function getPythonSignIdentity(env = process.env) {
  return firstEnv(env, ['APPLE_DEVELOPER_IDENTITY', 'CSC_NAME', 'APPLE_DMG_SIGN_IDENTITY']);
}

// Locate the python-only entitlements plist (allow-jit / unsigned-exec-mem /
// disable-library-validation). Default sits next to the app entitlements.plist
// at the repo root (electron-builder runs with directories.app: ".", so that is
// where entitlements resolve). Overridable for tests / relocation.
function resolvePythonEntitlementsPlist(env = process.env) {
  const override = firstEnv(env, ['PYTHON_ENTITLEMENTS_PLIST']);
  if (override) return override;
  return path.resolve(__dirname, '..', 'python-entitlements.plist');
}

function resolveAppEntitlementsPlist(env = process.env) {
  const override = firstEnv(env, ['APPLE_ENTITLEMENTS_PLIST']);
  if (override) return override;
  return path.resolve(__dirname, '..', 'entitlements.plist');
}

// Probe an extensionless file for a Mach-O magic header by asking codesign to
// display its signing info. codesign exits 0 for any Mach-O (signed or not) and
// non-zero with "not signed" for a Mach-O without a signature; it errors with a
// "not a Mach-O / bundle" message for plain data files. Used only as the third
// detection fallback in enumerateMachOFiles (extension + bin/ exec come first),
// so a missing/odd codesign is harmless — return false on any doubt.
function probeMachOWithCodesign(filePath) {
  // Read the first 4 bytes and test for a Mach-O / universal-binary magic number.
  // This is DETERMINISTIC. The previous heuristic ran `codesign -d` and treated any
  // output containing "not signed" as proof of a Mach-O — but codesign emits
  // "...is not signed at all" for PLAIN DATA files too, so C headers like
  // python/include/python3.12/iterobject.h false-positived into the sign list and
  // broke the whole deep-sign (codesign cannot sign a .h → the loop aborted BEFORE
  // re-sealing the .app → stale-seal "file modified" on the already-re-signed .so).
  // Magic-byte detection never mis-classifies a header/script/.py as signable.
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(4);
      const n = fs.readSync(fd, buf, 0, 4, 0);
      if (n < 4) return false;
      const magic = buf.readUInt32BE(0);
      return (
        magic === 0xfeedface || // Mach-O 32-bit
        magic === 0xfeedfacf || // Mach-O 64-bit
        magic === 0xcefaedfe || // Mach-O 32-bit byte-swapped
        magic === 0xcffaedfe || // Mach-O 64-bit byte-swapped
        magic === 0xcafebabe || // universal/fat
        magic === 0xbebafeca    // universal/fat byte-swapped
      );
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

// S3: deep-sign the bundled CPython tree (Contents/Resources/python/**)
// inside-out, then re-seal the outer .app so its signature covers the freshly
// signed python. Darwin-only; skips gracefully (returns false) when no bundled
// python is present (a non-bundle build), so those builds keep working untouched.
// Real signing needs the Developer ID in the keychain — the credentialed
// proof-run is the Founder's S4 step. `deps` injects fs + the codesign runner so
// this is exercised by the _core unit tests; production passes none.
function deepSignBundledPython(appPath, env = process.env, deps = {}) {
  const fsDeps = deps.fs || { readdirSync: fs.readdirSync, statSync: fs.statSync };
  const runCodesign =
    deps.runCodesign ||
    ((args) => {
      execFileSync('codesign', args, { stdio: 'inherit' });
    });
  const probe = deps.probeMachO || probeMachOWithCodesign;
  const existsSync = (deps.fs && deps.fs.existsSync) || fs.existsSync;

  const pythonRoot = resolvePythonRoot(appPath);
  if (!existsSync(pythonRoot)) {
    console.log(`Skipping bundled-python deep-sign - no ${path.relative(appPath, pythonRoot)} (non-bundle build).`);
    return false;
  }

  const identity = getPythonSignIdentity(env);
  if (!identity) {
    console.log(
      'Skipping bundled-python deep-sign - missing signing identity (APPLE_DEVELOPER_IDENTITY / CSC_NAME / APPLE_DMG_SIGN_IDENTITY).'
    );
    return false;
  }

  const pythonEntitlements = resolvePythonEntitlementsPlist(env);
  const appEntitlements = resolveAppEntitlementsPlist(env);

  const machoFiles = enumerateMachOFiles(pythonRoot, fsDeps, probe);
  console.log(`Deep-signing bundled python: ${machoFiles.length} Mach-O file(s) under ${pythonRoot} (inside-out).`);

  const plan = planPythonCodesign(machoFiles, {
    identity,
    pythonRoot,
    entitlementsPlist: pythonEntitlements,
  });

  // Resilient: a single non-signable file (a false-positive non-Mach-O that slips the
  // probe, or a transient codesign hiccup) must NOT abort the deep-sign before the outer
  // .app is re-sealed — an aborted deep-sign leaves the .app seal STALE relative to the
  // .so already re-signed ("file modified" → notarization rejects, the exact failure that
  // blocked alpha.9). Skip-and-log instead; the re-seal below ALWAYS runs, and a genuinely
  // unsigned Mach-O still surfaces loudly at the notarization gate (never silent).
  const skipped = [];
  for (const step of plan) {
    try {
      runCodesign(step.args);
    } catch (err) {
      skipped.push(step.filePath);
      const msg = err && err.message ? String(err.message).split('\n')[0] : String(err);
      console.warn(`  ⚠ deep-sign skipped (not signable): ${step.filePath} — ${msg}`);
    }
  }
  if (skipped.length) {
    console.warn(`Bundled-python deep-sign: skipped ${skipped.length} non-signable file(s); continuing to re-seal the .app.`);
  }

  // Re-seal the outer .app so its signature covers the re-signed python tree.
  runCodesign(buildAppResignArgs(appPath, { identity, appEntitlementsPlist: appEntitlements }));
  console.log(`Bundled-python deep-sign complete; outer .app re-sealed with ${identity}.`);
  return true;
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

  // S3: deep-sign the bundled CPython tree (if present) BEFORE notarization.
  // electron-builder signs the .app (incl. its own native .node modules) but does
  // NOT hardened-runtime-sign the bundled python interpreter / .dylib / .so files,
  // which Apple notarization then rejects. We re-sign python inside-out, then
  // re-seal the outer .app — so the .app/.zip notarized here AND the hdiutil DMG
  // (rebuilt from this same signed .app in afterAllArtifactBuild) both ship a
  // notarizable python. Skips gracefully on non-bundle builds. This MUST run
  // before notarize() below; doing it later would notarize an un-deep-signed app.
  let resealed = false;
  try {
    resealed = deepSignBundledPython(appPath);
  } catch (deepSignError) {
    console.error('Bundled-python deep-sign failed:', deepSignError.message);
    throw deepSignError;
  }
  if (resealed) {
    // Re-verify the outer signature is valid after the re-seal so we never
    // hand a broken .app to notarytool.
    execFileSync('codesign', ['--verify', '--verbose=2', appPath], { stdio: 'inherit' });
    console.log(`App ${appName} re-verified after bundled-python deep-sign`);
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
exports.getPythonSignIdentity = getPythonSignIdentity;
exports.resolvePythonEntitlementsPlist = resolvePythonEntitlementsPlist;
exports.resolveAppEntitlementsPlist = resolveAppEntitlementsPlist;
exports.deepSignBundledPython = deepSignBundledPython;
exports.probeMachOWithCodesign = probeMachOWithCodesign;
