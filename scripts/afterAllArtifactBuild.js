const { execFileSync, spawnSync } = require('child_process');
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

// Args for the post-staple self-verification. `xcrun stapler validate <dmg>`
// proves a notarization ticket is stapled; `spctl -a -t open` proves Gatekeeper
// would accept opening the DMG. Pure builders so they can be unit-tested.
function buildStaplerValidateArgs(artifactPath) {
  return ['stapler', 'validate', artifactPath];
}

function buildSpctlAssessArgs(artifactPath) {
  return ['-a', '-t', 'open', '--context', 'context:primary-signature', artifactPath];
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
  // Self-verify: prove the staple stuck AND Gatekeeper accepts the DMG. This
  // throws (fails the build) on any problem so we never ship an unverified DMG.
  verifyNotarizationStapled(artifactPath);
  return true;
}

// Decide whether a captured `spctl` run accepted the artifact. spctl writes its
// verdict to stderr and exits 0 on accept / non-zero on reject. Fail-closed:
// require BOTH a zero exit AND an "accepted" verdict; any reject/deny blocks.
function evaluateSpctlAssessment(exitCode, output) {
  const text = String(output == null ? '' : output);
  if (/\b(rejected|denied)\b/i.test(text)) {
    return { ok: false, detail: 'spctl rejected the artifact (Gatekeeper would block it)' };
  }
  if (exitCode === 0 && /\baccepted\b/i.test(text)) {
    return { ok: true, detail: 'spctl accepted the artifact (Notarized Developer ID)' };
  }
  if (exitCode !== 0) {
    return { ok: false, detail: `spctl exited non-zero (${String(exitCode)})` };
  }
  return { ok: false, detail: 'spctl did not return an "accepted" verdict' };
}

// Default bounded-retry policy for the spctl Gatekeeper assessment. Right after
// `stapler staple`, Gatekeeper's local assessment DB can lag, so spctl
// transiently returns a non-accepted verdict for a DMG that is genuinely
// notarized + stapled (this false-negative bit alpha.6). We retry the spctl
// assessment a few times with a short backoff before failing. This is a
// false-NEGATIVE fix, NOT a bypass: `stapler validate` remains the authoritative
// staple proof (and still throws immediately on a missing ticket), and a truly
// unsigned/unnotarized DMG that never returns "accepted" still fails closed
// after the retries are exhausted.
const SPCTL_RETRY_ATTEMPTS = 5;
const SPCTL_RETRY_DELAY_MS = 2500;

// Synchronous sleep that does not require a foreground `sleep` binary. Skipped
// entirely when delayMs <= 0 so unit tests run instantly.
function sleepSyncMs(delayMs) {
  if (!delayMs || delayMs <= 0) return;
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, delayMs);
}

// Run `xcrun stapler validate` (throws on non-zero) then `spctl -a -t open`
// (captured + evaluated), throwing if Gatekeeper does not accept the DMG.
// The spctl assessment is wrapped in a bounded retry-with-backoff to absorb the
// transient post-staple Gatekeeper-DB lag false-negative; stapler validate is
// the authoritative staple proof and is NOT retried.
function verifyNotarizationStapled(artifactPath, deps = {}) {
  const runValidate =
    deps.runValidate ||
    ((p) => {
      execFileSync('xcrun', buildStaplerValidateArgs(p), { stdio: 'inherit' });
    });
  const runSpctl =
    deps.runSpctl ||
    ((p) => {
      const result = spawnSync('spctl', buildSpctlAssessArgs(p), { encoding: 'utf8' });
      if (result.error) {
        return { status: result.status == null ? 127 : result.status, output: result.error.message };
      }
      return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
    });
  const sleep = deps.sleep || sleepSyncMs;
  const attempts = Number.isInteger(deps.spctlAttempts) && deps.spctlAttempts > 0 ? deps.spctlAttempts : SPCTL_RETRY_ATTEMPTS;
  const delayMs = Number.isInteger(deps.spctlDelayMs) && deps.spctlDelayMs >= 0 ? deps.spctlDelayMs : SPCTL_RETRY_DELAY_MS;

  // stapler validate exits non-zero (and throws via execFileSync) when no ticket
  // is stapled, so a successful return is itself the staple proof. NOT retried:
  // a missing staple is a hard, authoritative failure.
  runValidate(artifactPath);

  // spctl assessment with bounded retry: succeed as soon as it returns accepted;
  // only throw after ALL attempts still fail (fail-closed for a truly-unaccepted
  // DMG). Backoff absorbs the transient post-staple Gatekeeper-DB lag.
  let verdict;
  let spctlResult;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    spctlResult = runSpctl(artifactPath);
    verdict = evaluateSpctlAssessment(spctlResult.status, spctlResult.output);
    if (verdict.ok) break;
    if (attempt < attempts) {
      console.log(
        `Notarization self-verification: spctl not yet accepted for ${path.basename(artifactPath)} ` +
          `(attempt ${attempt}/${attempts}: ${verdict.detail}); retrying in ${delayMs}ms (Gatekeeper DB lag).`
      );
      sleep(delayMs);
    }
  }
  if (!verdict.ok) {
    throw new Error(
      `Notarization self-verification FAILED for ${path.basename(artifactPath)} after ${attempts} spctl attempt(s): ${
        verdict.detail
      }. ${String(spctlResult.output || '').trim()}`
    );
  }
  console.log(`Notarization self-verification PASSED for ${path.basename(artifactPath)}: stapled + ${verdict.detail}.`);
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
exports.buildStaplerValidateArgs = buildStaplerValidateArgs;
exports.buildSpctlAssessArgs = buildSpctlAssessArgs;
exports.evaluateSpctlAssessment = evaluateSpctlAssessment;
exports.verifyNotarizationStapled = verifyNotarizationStapled;
exports.findAppForDmg = findAppForDmg;
exports.rebuildDmgWithHdiutil = rebuildDmgWithHdiutil;
exports.getDmgSignIdentity = getDmgSignIdentity;
exports.notarizeDmgArtifact = notarizeDmgArtifact;
exports.signDmgArtifact = signDmgArtifact;
