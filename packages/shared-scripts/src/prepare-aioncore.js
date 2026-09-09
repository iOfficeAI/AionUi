/**
 * Prepare aioncore binary for packaging.
 *
 * Default resolution order:
 *  1. Complete local bundle from AIONUI_BACKEND_LOCAL_BUNDLE_DIR
 *  2. GitHub Actions artifact download when AIONUI_BACKEND_RUN_ID is set
 *  3. GitHub release download (requires version or defaults to "latest")
 *  4. Local binary fallback from AIONUI_BACKEND_LOCAL_BINARY
 *
 * AIONUI_BACKEND_SOURCE_POLICY=verified-actions disables every fallback and
 * requires a successful workflow run with strict artifact metadata. Expected
 * head and archive hashes remain optional build-input guards; the prepared
 * bundle manifest records the final product content identity.
 *
 * Output: {projectRoot}/resources/bundled-aioncore/{platform}-{arch}/
 *   - aioncore[.exe]
 *   - manifest.json
 *   - managed-resources/...
 *
 * @module prepare-aioncore
 */

const { execSync, execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256Directory, sha256File, verifyBundledAioncoreResources } = require('./verify-bundled-aioncore-resources');

const DEFAULT_RELEASE_REPOSITORY = 'iOfficeAI/AionCore';
const DEFAULT_ACTIONS_REPOSITORY = 'CleverC2200/AionCore';
const VERIFIED_ACTIONS_POLICY = 'verified-actions';

const { restoreDownload, saveDownload } = require('./build-cache');

const MANAGED_NODE_TARGETS = {
  'darwin-arm64': { folderSuffix: 'darwin-arm64', archiveExt: 'tar.gz', executable: 'bin/node' },
  'darwin-x64': { folderSuffix: 'darwin-x64', archiveExt: 'tar.gz', executable: 'bin/node' },
  'linux-arm64': { folderSuffix: 'linux-arm64', archiveExt: 'tar.gz', executable: 'bin/node' },
  'linux-x64': { folderSuffix: 'linux-x64', archiveExt: 'tar.gz', executable: 'bin/node' },
  'win32-arm64': { folderSuffix: 'win-arm64', archiveExt: 'zip', executable: 'node.exe' },
  'win32-x64': { folderSuffix: 'win-x64', archiveExt: 'zip', executable: 'node.exe' },
};

const ACTIONS_ARTIFACT_TARGETS = {
  'darwin-arm64': {
    artifactName: 'aioncore-manual-macos-arm64',
    manualPlatform: 'macos-arm64',
  },
  'darwin-x64': {
    artifactName: 'aioncore-manual-macos-x64',
    manualPlatform: 'macos-x64',
  },
  'linux-arm64': {
    artifactName: 'aioncore-manual-linux-arm64',
    manualPlatform: 'linux-arm64',
  },
  'linux-x64': {
    artifactName: 'aioncore-manual-linux-x64',
    manualPlatform: 'linux-x64',
  },
  'win32-arm64': {
    artifactName: 'aioncore-manual-windows-arm64',
    manualPlatform: 'windows-arm64',
  },
  'win32-x64': {
    artifactName: 'aioncore-manual-windows-x64',
    manualPlatform: 'windows-x64',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyFileSafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectorySafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true, verbatimSymlinks: true });
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function getActionsTarget(platform, arch) {
  return ACTIONS_ARTIFACT_TARGETS[`${platform}-${arch}`] || null;
}

function getActionsArtifactName(platform, arch) {
  return getActionsTarget(platform, arch)?.artifactName || null;
}

function getActionsRepository(fallback = DEFAULT_ACTIONS_REPOSITORY) {
  const repository = (process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY || fallback).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid AionCore Actions repository: ${repository}`);
  }
  return repository;
}

function getReleaseRepository(projectRoot) {
  const explicitRepository = (process.env.AIONUI_BACKEND_RELEASE_REPOSITORY || '').trim();
  let pinnedRepository = '';
  if (!explicitRepository) {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      pinnedRepository =
        typeof packageJson.aioncoreRepository === 'string' ? packageJson.aioncoreRepository.trim() : '';
    }
  }
  const repository = explicitRepository || pinnedRepository || DEFAULT_RELEASE_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid AionCore release repository: ${repository}`);
  }
  return repository;
}

function getBackendSourcePolicy() {
  const policy = (process.env.AIONUI_BACKEND_SOURCE_POLICY || 'default').trim();
  if (!['default', VERIFIED_ACTIONS_POLICY].includes(policy)) {
    throw new Error(`Invalid AionCore source policy: ${policy}`);
  }
  return policy;
}

function normalizeSha256(value, label) {
  const digest = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Invalid SHA256 for ${label}`);
  }
  return digest;
}

function getExpectedActionsSha256(artifactName, { required = false } = {}) {
  const direct = (process.env.AIONUI_BACKEND_SHA256 || '').trim();
  const checksumMapJson = (process.env.AIONUI_BACKEND_SHA256S || '').trim();
  let mapped = '';

  if (checksumMapJson) {
    let checksumMap;
    try {
      checksumMap = JSON.parse(checksumMapJson);
    } catch {
      throw new Error('Invalid AIONUI_BACKEND_SHA256S JSON');
    }
    if (!checksumMap || typeof checksumMap !== 'object' || Array.isArray(checksumMap)) {
      throw new Error('AIONUI_BACKEND_SHA256S must be a JSON object keyed by artifact name');
    }
    mapped = String(checksumMap[artifactName] || '').trim();
  }

  if (direct && mapped && normalizeSha256(direct, artifactName) !== normalizeSha256(mapped, artifactName)) {
    throw new Error(`Conflicting SHA256 values for AionCore artifact ${artifactName}`);
  }

  const value = direct || mapped;
  if (!value) {
    if (required) {
      throw new Error(`Missing SHA256 for AionCore artifact ${artifactName}`);
    }
    return null;
  }
  return normalizeSha256(value, artifactName);
}

function getExpectedActionsHeadSha({ required = false, fallback = '' } = {}) {
  const expectedHeadSha = (process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA || fallback).trim();
  if (!expectedHeadSha) {
    if (required) {
      throw new Error('AIONUI_BACKEND_EXPECTED_HEAD_SHA is required by verified-actions source policy');
    }
    return null;
  }
  if (!/^[a-f0-9]{40}$/.test(expectedHeadSha)) {
    throw new Error('AIONUI_BACKEND_EXPECTED_HEAD_SHA must be exactly 40 lowercase hexadecimal characters');
  }
  return expectedHeadSha;
}

function verifyFileSha256(filePath, expectedSha256, label) {
  const actualSha256 = sha256File(filePath);
  if (actualSha256 !== normalizeSha256(expectedSha256, label)) {
    throw new Error(`SHA256 mismatch for ${label}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  return actualSha256;
}

function getActionsManualPlatform(platform, arch) {
  return getActionsTarget(platform, arch)?.manualPlatform || `${platform}-${arch}`;
}

function getActionsArtifactMissingMessage({ runId, platform, arch, expectedArtifactName, availableArtifactNames }) {
  const available =
    Array.isArray(availableArtifactNames) && availableArtifactNames.length > 0
      ? availableArtifactNames.join(', ')
      : '(none)';
  return [
    `AionCore run ${runId} does not contain artifact [ ${expectedArtifactName} ] required for [ ${platform}-${arch} ].`,
    `Available artifacts: ${available}.`,
    `Re-run AionCore Manual Build with platform [ ${getActionsManualPlatform(platform, arch)} ] or all.`,
  ].join(' ');
}

function prepareCrossTargetManagedResources(
  binaryPath,
  targetDir,
  platform,
  arch,
  {
    download = downloadFile,
    extract = extractArchive,
    cacheDir = path.join(os.homedir(), '.cache', 'aionui-build', 'node-v1'),
  } = {}
) {
  const runtimeKey = `${platform}-${arch}`;
  const target = MANAGED_NODE_TARGETS[runtimeKey];
  if (!target) throw new Error(`Unsupported managed Node target: ${runtimeKey}`);

  const version = (process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('AIONUI_BACKEND_MANAGED_NODE_VERSION is required for cross-platform packaging');
  }
  if (!fs.readFileSync(binaryPath).includes(Buffer.from(version))) {
    throw new Error(`Managed Node version ${version} was not found in the target AionCore binary`);
  }

  const bundleOut = path.join(targetDir, 'managed-resources');
  const nodeDirName = `node-v${version}-${target.folderSuffix}`;
  const archiveName = `${nodeDirName}.${target.archiveExt}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioncore-managed-node-'));
  const archivePath = path.join(tempDir, archiveName);
  const checksumsPath = path.join(tempDir, 'SHASUMS256.txt');

  removeDirectorySafe(bundleOut);
  ensureDirectory(path.join(bundleOut, 'node'));
  ensureDirectory(tempDir);

  try {
    const releaseUrl = `https://nodejs.org/dist/v${version}`;
    console.log(`  Preparing ${runtimeKey} managed Node ${version} from nodejs.org`);
    const checksumsUrl = `${releaseUrl}/SHASUMS256.txt`;
    const cachedChecksums = restoreDownload(cacheDir, checksumsUrl, checksumsPath);
    if (!cachedChecksums) {
      download(checksumsUrl, checksumsPath);
    }
    const checksumLine = fs
      .readFileSync(checksumsPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => line.endsWith(`  ${archiveName}`));
    if (!checksumLine || !/^[a-f0-9]{64}  /.test(checksumLine)) {
      throw new Error(`Node checksum missing for ${archiveName}`);
    }
    const expected = checksumLine.slice(0, 64);
    const archiveUrl = `${releaseUrl}/${archiveName}`;
    const source = `${archiveUrl}#sha256=${expected}`;
    const cached = restoreDownload(cacheDir, source, archivePath, expected);
    if (!cached) download(archiveUrl, archivePath);
    verifyFileSha256(archivePath, expected, archiveName);
    console.log(`[node-cache] ${cached ? 'hit' : 'miss'}: ${runtimeKey} ${version}`);
    extract(archivePath, path.join(bundleOut, 'node'), platform);

    const nodeRoot = path.join(bundleOut, 'node', nodeDirName);
    if (!fs.existsSync(path.join(nodeRoot, ...target.executable.split('/')))) {
      throw new Error(`Managed Node executable missing after extracting ${archiveName}`);
    }
    if (!cached) saveDownload(cacheDir, source, archivePath);
    if (!cachedChecksums) saveDownload(cacheDir, checksumsUrl, checksumsPath);
    writeJson(path.join(bundleOut, 'manifest.json'), {
      schemaVersion: 2,
      runtimeKey,
      node: {
        version,
        root: `node/${nodeDirName}`,
        executable: target.executable,
      },
      clis: [],
    });
    return bundleOut;
  } finally {
    removeDirectorySafe(tempDir);
  }
}

function prepareManagedResources(binaryPath, targetDir, platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && process.platform !== 'win32') {
    return prepareCrossTargetManagedResources(binaryPath, targetDir, platform, arch);
  }

  const bundleOut = path.join(targetDir, 'managed-resources');
  const dataDir = path.join(targetDir, '.prepare-data');

  removeDirectorySafe(bundleOut);
  removeDirectorySafe(dataDir);
  ensureDirectory(bundleOut);
  ensureDirectory(dataDir);

  console.log(`  Preparing managed resources under ${path.relative(process.cwd(), bundleOut)}`);
  execFileSync(binaryPath, ['--data-dir', dataDir, 'prepare-managed-resources', '--bundle-out', bundleOut], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AIONUI_BUNDLED_MANAGED_RESOURCES: '',
    },
  });

  removeDirectorySafe(dataDir);
  return bundleOut;
}

function verifyPreparedAioncoreBundle(projectRoot, platform, arch) {
  const result = verifyBundledAioncoreResources({
    resourcesDir: path.join(projectRoot, 'resources'),
    electronPlatformName: platform,
    targetArch: arch,
  });
  if (result.missing.length > 0 || result.failures.length > 0) {
    const summary = result.missing.length > 0 ? result.missing.join(', ') : JSON.stringify(result.failures);
    throw new Error(`Prepared aioncore bundle is missing required bundled resource(s): ${summary}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the actual version tag when "latest" is requested.
 * Uses GitHub API via `gh` CLI (needs GH_TOKEN in CI) or falls back to
 * `curl` with an optional Authorization header (GITHUB_TOKEN / GH_TOKEN).
 */
function resolveLatestTag(repository) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // 1. Try gh CLI (honours GH_TOKEN automatically)
  try {
    const out = execSync(`gh api repos/${repository}/releases/latest --jq .tag_name`, {
      encoding: 'utf-8',
      timeout: 15000,
    }).trim();
    if (out) return out;
  } catch {
    // gh CLI not available or no token — fall back to curl
  }

  // 2. Curl with optional token to avoid rate-limit 403
  try {
    const authArgs = token ? ['-H', `Authorization: token ${token}`] : [];
    const args = ['-fsSL', ...authArgs, `https://api.github.com/repos/${repository}/releases/latest`];
    const out = execFileSync('curl', args, { encoding: 'utf-8', timeout: 15000 });
    const tag = JSON.parse(out).tag_name;
    if (tag) return tag;
  } catch {
    // network issue or rate-limited
  }

  return null;
}

/**
 * Build the release asset filename for the given platform/arch/tag.
 *
 * Expected asset naming convention:
 *   aioncore-v0.1.0-aarch64-apple-darwin.tar.gz
 */
function getAssetName(platform, arch, tag) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = {
    darwin: 'apple-darwin',
    linux: 'unknown-linux-gnu',
    win32: 'pc-windows-msvc',
  };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  return `aioncore-${tag}-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, tag, repository) {
  return `https://github.com/${repository}/releases/download/${tag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading aioncore from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 120000,
    });
    return;
  }
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout: 120000 });
  } catch {
    execFileSync('wget', ['-q', '-O', outputPath, url], { timeout: 120000 });
  }
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    if (process.platform === 'win32') {
      const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', outputDir]);
  }
}

function findBinaryInDir(dir, binaryName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
}

function findAioncoreArchiveInDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isFile() &&
      entry.name.startsWith('aioncore-') &&
      (entry.name.endsWith('.zip') || entry.name.endsWith('.tar.gz'))
    ) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findAioncoreArchiveInDir(fullPath);
      if (found) return found;
    }
  }
  return null;
}

function getGitHubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

function githubApiGetJson(apiPath) {
  const token = getGitHubToken();

  try {
    return JSON.parse(
      execFileSync('gh', ['api', apiPath], {
        encoding: 'utf-8',
        timeout: 15000,
        env: {
          ...process.env,
          GH_TOKEN: token || process.env.GH_TOKEN,
        },
      })
    );
  } catch {
    // gh CLI not available or failed — fall back to curl.
  }

  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  const url = `https://api.github.com/${apiPath}`;
  const out = execFileSync('curl', ['-fsSL', ...headers, url], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return JSON.parse(out);
}

function getActionsRunProvenance(runId, repository, expectedHeadSha = null) {
  if (!/^[1-9][0-9]*$/.test(runId)) {
    throw new Error(`Invalid AionCore Actions run id: ${runId}`);
  }

  const run = githubApiGetJson(`repos/${repository}/actions/runs/${runId}`);
  const workflowPath = String(run?.path || '').split('@')[0];
  const sourceRepository = String(run?.repository?.full_name || '');
  const actualHeadSha = String(run?.head_sha || '');

  if (String(run?.id || '') !== runId) {
    throw new Error(`AionCore run metadata id mismatch for run ${runId}`);
  }
  if (sourceRepository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`AionCore run ${runId} repository mismatch: ${sourceRepository || '(missing)'}`);
  }
  if (run?.event !== 'workflow_dispatch') {
    throw new Error(`AionCore run ${runId} was not triggered by workflow_dispatch`);
  }
  if (
    workflowPath !== '.github/workflows/build-manual.yml' &&
    !workflowPath.endsWith('/.github/workflows/build-manual.yml')
  ) {
    throw new Error(`AionCore run ${runId} did not use .github/workflows/build-manual.yml`);
  }
  if (run?.status !== 'completed' || run?.conclusion !== 'success') {
    throw new Error(
      `AionCore run ${runId} is not a completed success (status=${run?.status || 'unknown'}, conclusion=${run?.conclusion || 'unknown'})`
    );
  }
  if (!/^[a-f0-9]{40}$/.test(actualHeadSha)) {
    throw new Error(`AionCore run ${runId} is missing a valid head SHA`);
  }
  if (expectedHeadSha && actualHeadSha !== expectedHeadSha) {
    throw new Error(`AionCore run ${runId} head SHA mismatch: expected ${expectedHeadSha}, got ${actualHeadSha}`);
  }

  return {
    repository: sourceRepository,
    runId,
    runAttempt: Number(run.run_attempt),
    runUrl: String(run.html_url || `https://github.com/${repository}/actions/runs/${runId}`),
    workflowName: String(run.name || ''),
    workflowPath,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    expectedHeadSha,
    actualHeadSha,
    headBranch: String(run.head_branch || ''),
    createdAt: String(run.created_at || ''),
    updatedAt: String(run.updated_at || ''),
  };
}

function downloadFileWithAuth(url, outputPath) {
  const token = getGitHubToken();
  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', ...headers, '-o', outputPath, url], {
      timeout: 120000,
    });
    return;
  } catch {
    // curl may be unavailable in some local environments; try gh before failing.
  }

  const outputFd = fs.openSync(outputPath, 'w');
  try {
    const result = spawnSync('gh', ['api', url], {
      timeout: 120000,
      stdio: ['ignore', outputFd, 'inherit'],
      env: {
        ...process.env,
        GH_TOKEN: token || process.env.GH_TOKEN,
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`gh api artifact download failed with exit code ${result.status}`);
  } finally {
    fs.closeSync(outputFd);
  }
}

function listActionsArtifacts(runId, repository) {
  const response = githubApiGetJson(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
  return Array.isArray(response?.artifacts) ? response.artifacts : [];
}

function validateActionsArtifactMetadata(artifact, runId, expectedArtifactName, { verifiedActions = false } = {}) {
  if (!Number.isInteger(artifact?.id) || artifact.id <= 0) {
    throw new Error(`AionCore artifact ${expectedArtifactName} from run ${runId} is missing a valid artifact id`);
  }

  if (verifiedActions) {
    if (artifact.expired !== false) {
      throw new Error(
        `AionCore artifact ${expectedArtifactName} from run ${runId} must explicitly report expired=false`
      );
    }
    if (!artifact.workflow_run || String(artifact.workflow_run.id || '') !== runId) {
      throw new Error(`AionCore artifact ${expectedArtifactName} must explicitly belong to workflow run ${runId}`);
    }
    if (typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) {
      throw new Error(`AionCore artifact ${expectedArtifactName} must provide a valid sha256 digest`);
    }
  } else {
    if (artifact.expired === true) {
      throw new Error(`AionCore artifact ${expectedArtifactName} from run ${runId} has expired`);
    }
    if (artifact.workflow_run?.id && String(artifact.workflow_run.id) !== runId) {
      throw new Error(`AionCore artifact ${expectedArtifactName} does not belong to run ${runId}`);
    }
  }

  return artifact.digest ? normalizeSha256(artifact.digest, `artifact ${expectedArtifactName}`) : null;
}

function isLegacyActionsSource(provenance) {
  // Explicitly retained, previously verified baseline. No date-based exemption
  // or arbitrary old run can bypass the new build identity requirement.
  return (
    provenance.repository === 'CleverC2200/AionCore' &&
    provenance.actualHeadSha === '6fc8ddf5fb6b55ec75c6d59647910439db69d727'
  );
}

function validateActionsBuildManifest(record, provenance, artifactName, archiveName, archiveSha256) {
  const targets = {
    'macos-arm64': 'aarch64-apple-darwin',
    'macos-x64': 'x86_64-apple-darwin',
    'windows-x64': 'x86_64-pc-windows-msvc',
    'windows-arm64': 'aarch64-pc-windows-msvc',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
  };
  if (
    record.schema !== 1 ||
    record.repository !== provenance.repository ||
    String(record.runId) !== provenance.runId ||
    record.attempt !== provenance.runAttempt ||
    record.headSha !== provenance.actualHeadSha ||
    record.artifact !== artifactName ||
    `aioncore-manual-${record.platform}` !== artifactName ||
    record.target !== targets[record.platform] ||
    record.archive !== archiveName ||
    record.sha256 !== archiveSha256
  )
    throw new Error('Core build manifest source or archive mismatch');
  if (
    (!record.build && !isLegacyActionsSource(provenance)) ||
    (record.build &&
      (record.build.profile !== 'release' ||
        !record.build.rustc?.startsWith('rustc ') ||
        !['cargoLockSha256', 'toolchainSha256', 'workflowSha256'].every((key) =>
          /^[a-f0-9]{64}$/.test(record.build[key])
        )))
  )
    throw new Error('Core build manifest has incomplete toolchain identity');
  return record;
}

function downloadAndExtractActionsArtifact(
  platform,
  arch,
  runId,
  { verifiedActions = false, pinnedSource = null } = {}
) {
  const expectedArtifactName = getActionsArtifactName(platform, arch);
  if (!expectedArtifactName) {
    throw new Error(`Unsupported AionCore Actions artifact target: ${platform}-${arch}`);
  }

  const repository = getActionsRepository(pinnedSource?.repository);
  const expectedHeadSha = getExpectedActionsHeadSha({ fallback: pinnedSource?.headSha });
  const runProvenance = getActionsRunProvenance(runId, repository, expectedHeadSha);
  const artifacts = listActionsArtifacts(runId, repository);
  const availableArtifactNames = artifacts
    .map((artifact) => artifact.name)
    .filter(Boolean)
    .toSorted();
  const artifact = artifacts.find((candidate) => candidate.name === expectedArtifactName);
  if (!artifact) {
    throw new Error(
      getActionsArtifactMissingMessage({
        runId,
        platform,
        arch,
        expectedArtifactName,
        availableArtifactNames,
      })
    );
  }
  const artifactDigest = validateActionsArtifactMetadata(artifact, runId, expectedArtifactName, { verifiedActions });
  const expectedArchiveSha256 = getExpectedActionsSha256(expectedArtifactName);

  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare-actions', runId, `${platform}-${arch}`);
  const artifactZipPath = path.join(tempDir, `${expectedArtifactName}.zip`);
  const artifactExtractDir = path.join(tempDir, 'artifact');
  const binaryExtractDir = path.join(tempDir, 'binary');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  const downloadUrl =
    artifact.archive_download_url || `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`;
  console.log(`  Downloading aioncore from AionCore run ${runId} artifact ${expectedArtifactName}`);
  downloadFileWithAuth(downloadUrl, artifactZipPath);
  const artifactZipSha256 = artifactDigest
    ? verifyFileSha256(artifactZipPath, artifactDigest, `artifact ${expectedArtifactName}`)
    : sha256File(artifactZipPath);
  extractArchive(artifactZipPath, artifactExtractDir, platform);

  const archivePath = findAioncoreArchiveInDir(artifactExtractDir);
  if (!archivePath) {
    throw new Error(`AionCore artifact ${expectedArtifactName} from run ${runId} does not contain an aioncore archive`);
  }
  const archiveSha256 = expectedArchiveSha256
    ? verifyFileSha256(archivePath, expectedArchiveSha256, `AionCore archive from ${expectedArtifactName}`)
    : sha256File(archivePath);

  // Legacy pinned builds may predate this sidecar. When present, it must agree
  // with independently verified run metadata and archive content.
  const manifestPath = path.join(artifactExtractDir, 'aioncore-manifest.json');
  if (verifiedActions && !fs.existsSync(manifestPath) && !isLegacyActionsSource(runProvenance))
    throw new Error(
      'Core build manifest required for this source; rebuild the exact trusted source with build identity'
    );
  const buildManifest = fs.existsSync(manifestPath)
    ? validateActionsBuildManifest(
        JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
        runProvenance,
        expectedArtifactName,
        path.basename(archivePath),
        archiveSha256
      )
    : null;

  extractArchive(archivePath, binaryExtractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(binaryExtractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in AionCore artifact ${expectedArtifactName} from run ${runId}`);
  }

  return {
    binaryPath,
    tempDir,
    artifactName: expectedArtifactName,
    repository,
    archivePath,
    url: downloadUrl,
    archiveSha256,
    expectedArchiveSha256,
    artifactId: artifact.id,
    artifactDigest,
    artifactZipSha256,
    provenance: runProvenance,
    buildManifest,
  };
}

function downloadAndExtract(platform, arch, tag, repository) {
  const assetName = getAssetName(platform, arch, tag);
  if (!assetName) {
    throw new Error(`Unsupported aioncore target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, tag, repository);
  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare', tag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  downloadFile(url, archivePath);
  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }

  return { binaryPath, tempDir, url };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Prepare aioncore binary for packaging.
 *
 * @param {object} options - Configuration options
 * @param {string} options.projectRoot - Project root directory
 * @param {string} options.platform - Target platform (process.platform)
 * @param {string} options.arch - Target architecture (process.arch)
 * @param {string} options.version - Backend version (default: 'latest')
 * @returns {{ prepared: true; dir: string; sourceType: string }}
 */
function getPinnedActionsSource(projectRoot, platform, arch) {
  // Explicit source selection remains available for release/debug workflows.
  for (const key of [
    'AIONUI_BACKEND_RUN_ID',
    'AIONUI_BACKEND_VERSION',
    'AIONUI_BACKEND_LOCAL_BINARY',
    'AIONUI_BACKEND_LOCAL_BUNDLE_DIR',
    'AIONUI_BACKEND_RELEASE_REPOSITORY',
  ]) {
    if (process.env[key]?.trim()) return null;
  }
  const file = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(file)) return null;
  const pin = JSON.parse(fs.readFileSync(file, 'utf8')).aioncoreBuild;
  const runId = pin?.runs?.[`${platform}-${arch}`];
  if (runId === undefined) return null;
  if (
    typeof runId !== 'string' ||
    !/^[1-9][0-9]*$/.test(runId) ||
    typeof pin.repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(pin.repository) ||
    typeof pin.headSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(pin.headSha)
  ) {
    throw new Error('Invalid pinned AionCore Actions build in package.json');
  }
  return { runId, repository: pin.repository, headSha: pin.headSha };
}

function prepareAioncore(options) {
  const { projectRoot, platform, arch, version = 'latest' } = options;
  const runtimeKey = `${platform}-${arch}`;
  const pinnedSource = getPinnedActionsSource(projectRoot, platform, arch);
  const actionsRunId = (process.env.AIONUI_BACKEND_RUN_ID || pinnedSource?.runId || '').trim();
  const requestedPolicy = getBackendSourcePolicy();
  const sourcePolicy = pinnedSource ? VERIFIED_ACTIONS_POLICY : requestedPolicy;
  const verifiedActionsOnly = sourcePolicy === VERIFIED_ACTIONS_POLICY;
  const localBundleDir = (process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR || '').trim();
  const localBinary = (process.env.AIONUI_BACKEND_LOCAL_BINARY || '').trim();

  if (verifiedActionsOnly) {
    if (!actionsRunId) {
      throw new Error('AIONUI_BACKEND_RUN_ID is required by verified-actions source policy');
    }
    const artifactName = getActionsArtifactName(platform, arch);
    if (!artifactName) {
      throw new Error(`Unsupported AionCore Actions artifact target: ${platform}-${arch}`);
    }
    getActionsRepository(pinnedSource?.repository);
    getExpectedActionsHeadSha({ fallback: pinnedSource?.headSha });
    getExpectedActionsSha256(artifactName);
    if (localBundleDir || localBinary) {
      throw new Error('verified-actions source policy rejects local AionCore overrides');
    }
  }

  let tag = null;
  let releaseRepository = null;
  if (!actionsRunId) {
    releaseRepository = getReleaseRepository(projectRoot);
    // Resolve the actual version tag — release asset filenames include the tag.
    if (version === 'latest') {
      const resolved = resolveLatestTag(releaseRepository);
      if (!resolved) {
        throw new Error('Failed to resolve latest aioncore release tag from GitHub API');
      }
      tag = resolved;
      console.log(`Resolved aioncore "latest" → ${tag}`);
    } else {
      tag = version.startsWith('v') ? version : `v${version}`;
    }
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(
    `Preparing aioncore for ${runtimeKey} (${actionsRunId ? `actions run: ${actionsRunId}` : `version: ${tag}`})`
  );

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  if (localBundleDir) {
    const resolvedLocalBundleDir = path.resolve(localBundleDir);
    const localBinaryPath = path.join(resolvedLocalBundleDir, binaryName);
    const localManagedResourcesDir = path.join(resolvedLocalBundleDir, 'managed-resources');
    if (
      fs.existsSync(resolvedLocalBundleDir) &&
      fs.statSync(resolvedLocalBundleDir).isDirectory() &&
      fs.existsSync(localBinaryPath) &&
      fs.existsSync(localManagedResourcesDir)
    ) {
      copyDirectorySafe(resolvedLocalBundleDir, targetDir);
      ensureExecutableMode(targetBinaryPath);
      const manifest = {
        platform,
        arch,
        version: tag || (actionsRunId ? `actions-run-${actionsRunId}` : 'local-bundle'),
        generatedAt: new Date().toISOString(),
        sourcePolicy,
        sourceType: 'local-bundle',
        source: { path: resolvedLocalBundleDir },
        files: [binaryName, 'managed-resources/'],
        content: {
          binary: { path: binaryName, sha256: sha256File(targetBinaryPath) },
          managedResources: {
            path: 'managed-resources',
            sha256: sha256Directory(path.join(targetDir, 'managed-resources')),
          },
        },
      };
      writeJson(path.join(targetDir, 'manifest.json'), manifest);
      verifyPreparedAioncoreBundle(projectRoot, platform, arch);
      console.log(`  Using local aioncore bundle: ${resolvedLocalBundleDir}`);
      return { prepared: true, dir: targetDir, sourceType: 'local-bundle' };
    }
    console.warn(`  Local aioncore bundle is incomplete or missing: ${resolvedLocalBundleDir}`);
  }

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1. Download from GitHub Actions artifacts when manual build run id is provided.
  if (actionsRunId) {
    const result = downloadAndExtractActionsArtifact(platform, arch, actionsRunId, {
      verifiedActions: verifiedActionsOnly,
      pinnedSource,
    });
    sourcePath = result.binaryPath;
    tempDir = result.tempDir;
    sourceType = 'actions-artifact';
    sourceDetail = {
      runId: actionsRunId,
      repository: result.repository,
      artifactName: result.artifactName,
      artifactId: result.artifactId,
      artifactDigest: result.artifactDigest,
      artifactZipSha256: result.artifactZipSha256,
      archiveSha256: result.archiveSha256,
      expectedArchiveSha256: result.expectedArchiveSha256,
      expectedHeadSha: result.provenance.expectedHeadSha,
      actualHeadSha: result.provenance.actualHeadSha,
      provenance: result.provenance,
      buildManifest: result.buildManifest,
      url: result.url,
    };
    console.log(`  Downloaded from GitHub Actions artifact`);
  }

  // 2. Download from GitHub releases.
  if (!sourcePath && tag) {
    try {
      const result = downloadAndExtract(platform, arch, tag, releaseRepository);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      sourceDetail = { url: result.url };
      console.log(`  Downloaded from GitHub releases`);
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  // 3. Use an explicitly supplied local cache when network download is unavailable.
  if (!sourcePath) {
    if (localBinary) {
      const resolvedLocalBinary = path.resolve(localBinary);
      if (fs.existsSync(resolvedLocalBinary) && fs.statSync(resolvedLocalBinary).isFile()) {
        sourcePath = resolvedLocalBinary;
        sourceType = 'local-binary';
        sourceDetail = { path: resolvedLocalBinary };
        console.log(`  Using local aioncore binary: ${resolvedLocalBinary}`);
      } else {
        console.warn(`  Local aioncore binary not found: ${resolvedLocalBinary}`);
      }
    }
  }

  // Write result
  if (sourcePath) {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);
    const bundledManagedResourcesDir = prepareManagedResources(targetBinaryPath, targetDir, platform, arch);

    // The release tag is the authoritative version — the aioncore
    // binary does not expose a --version flag (it has --app-version which
    // takes a value, not a self-report).
    const manifest = {
      platform,
      arch,
      version: tag || `actions-run-${actionsRunId}`,
      generatedAt: new Date().toISOString(),
      sourcePolicy,
      sourceType,
      source: sourceDetail,
      files: [binaryName, 'managed-resources/'],
      content: {
        binary: { path: binaryName, sha256: sha256File(targetBinaryPath) },
        managedResources: {
          path: 'managed-resources',
          sha256: sha256Directory(path.join(targetDir, 'managed-resources')),
        },
      },
    };

    writeJson(path.join(targetDir, 'manifest.json'), manifest);
    verifyPreparedAioncoreBundle(projectRoot, platform, arch);
    console.log(
      `  Bundled aioncore prepared: resources/bundled-aioncore/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );
    console.log(`  Bundled managed resources prepared: ${bundledManagedResourcesDir}`);

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  }

  throw new Error(`aioncore binary not found for ${runtimeKey} (tag: ${tag})`);
}

module.exports = {
  prepareCrossTargetManagedResources,
  downloadAndExtractActionsArtifact,
  downloadFileWithAuth,
  extractArchive,
  getActionsArtifactMissingMessage,
  getActionsArtifactName,
  getActionsRepository,
  getReleaseRepository,
  getActionsRunProvenance,
  getBackendSourcePolicy,
  getExpectedActionsHeadSha,
  getExpectedActionsSha256,
  getPinnedActionsSource,
  prepareManagedResources,
  prepareAioncore,
  validateActionsArtifactMetadata,
  validateActionsBuildManifest,
  verifyFileSha256,
  verifyPreparedAioncoreBundle,
};
