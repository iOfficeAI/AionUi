/**
 * Prepare aioncore binary for packaging.
 *
 * Resolution order:
 *  1. GitHub release download (requires version or defaults to "latest")
 *
 * Output: {projectRoot}/resources/bundled-aioncore/{platform}-{arch}/aioncore[.exe]
 *
 * @module prepare-aioncore
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = process.env.AIONCORE_GITHUB_OWNER || 'halojerry';
const GITHUB_REPO = process.env.AIONCORE_GITHUB_REPO || 'poundingcore';

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

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the actual version tag when "latest" is requested.
 * Uses GitHub API via `gh` CLI (needs GH_TOKEN in CI) or falls back to
 * `curl` with an optional Authorization header (GITHUB_TOKEN / GH_TOKEN).
 */
function resolveLatestTag() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // 1. Try gh CLI (honours GH_TOKEN automatically)
  try {
    const out = execSync(`gh api repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest --jq .tag_name`, {
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
    const args = ['-fsSL', ...authArgs, `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`];
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

function getDownloadUrl(assetName, tag) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  console.log(`  Downloading aioncore from ${url}`);
  if (process.platform === 'win32') {
    const authHeader = token ? `$headers=@{Authorization='token ${token}'}; ` : '';
    const ps = `$ProgressPreference='SilentlyContinue'; ${authHeader}Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 120000,
    });
    return;
  }
  const authArgs = token ? ['-H', `Authorization: token ${token}`] : [];
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, ...authArgs, url], {
      timeout: 120000,
    });
  } catch {
    execFileSync('wget', ['-q', '--header', `Authorization: token ${token}`, '-O', outputPath, url].filter(Boolean), {
      timeout: 120000,
    });
  }
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
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

function isGhAvailable() {
  try {
    execSync('gh --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function downloadAssetViaGhCli(assetName, tag, outputPath) {
  if (!isGhAvailable()) {
    console.warn('  gh CLI not available — will use curl fallback');
    return false;
  }
  try {
    execSync(
      `gh release download "${tag}" --repo "${GITHUB_OWNER}/${GITHUB_REPO}" --pattern "${assetName}" --dir "${path.dirname(outputPath)}" --clobber`,
      {
        encoding: 'utf-8',
        timeout: 120000,
        stdio: 'pipe',
      }
    );
    const downloaded = path.join(path.dirname(outputPath), assetName);
    if (fs.existsSync(downloaded) && downloaded !== outputPath) {
      fs.renameSync(downloaded, outputPath);
    }
    return fs.existsSync(outputPath);
  } catch (err) {
    console.warn(`  gh release download failed: ${err.message}`);
    return false;
  }
}

function findAssetId(assetName, tag) {
  // 1. Try gh CLI (handles auth for both public and private repos)
  try {
    const out = execSync(
      `gh release view "${tag}" --repo "${GITHUB_OWNER}/${GITHUB_REPO}" --json assets -q ".assets[] | select(.name==\\"${assetName}\\") | .id"`,
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();
    if (out && /^\d+$/.test(out)) return out;
  } catch {
    // fall through to curl
  }

  // 2. Fallback: curl API (for environments without gh CLI)
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) return null;
  const headers = ['-H', `Authorization: token ${token}`, '-H', 'Accept: application/vnd.github+json'];
  try {
    const result = execFileSync(
      'curl',
      [
        '-sSL',
        '-w',
        '%{http_code}',
        '-o',
        '/dev/null',
        ...headers,
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`,
      ],
      { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result !== '200') {
      console.warn(`  API returned HTTP ${result}`);
      return null;
    }
    const tagJson = execFileSync(
      'curl',
      ['-sSL', ...headers, `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`],
      { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const release = JSON.parse(tagJson);
    const asset = (release.assets || []).find((a) => a.name === assetName);
    if (asset && asset.id) return String(asset.id);
  } catch (err) {
    console.warn(`  curl fallback failed: ${err.message}`);
  }
  return null;
}

function downloadAssetById(assetId, outputPath) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  console.log(`  Downloading aioncore asset ${assetId} via GitHub API`);
  const authHeader = token ? `Authorization: token ${token}` : '';
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}' -Headers @{Accept='application/octet-stream'${
      authHeader ? `; Authorization='token ${token}'` : ''
    }} -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 120000,
    });
    return;
  }
  const authArgs = token ? ['-H', authHeader] : [];
  try {
    execFileSync(
      'curl',
      [
        '-L',
        '--fail',
        '--silent',
        '--show-error',
        '-o',
        outputPath,
        ...authArgs,
        '-H',
        'Accept: application/octet-stream',
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}`,
      ],
      {
        timeout: 120000,
      }
    );
  } catch {
    execFileSync(
      'wget',
      [
        '-q',
        '--header',
        'Accept: application/octet-stream',
        token ? `--header` : '',
        token ? `Authorization: token ${token}` : '',
        '-O',
        outputPath,
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}`,
      ].filter(Boolean),
      {
        timeout: 120000,
      }
    );
  }
}

function downloadAndExtract(platform, arch, tag) {
  const assetName = getAssetName(platform, arch, tag);
  if (!assetName) {
    throw new Error(`Unsupported aioncore target: ${platform}-${arch}`);
  }

  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare', tag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  // 1. Try gh CLI first (handles auth for private repos natively)
  if (downloadAssetViaGhCli(assetName, tag, archivePath)) {
    // downloaded successfully via gh CLI
  } else {
    // 2. Try API-based download (curl with token)
    const assetId = findAssetId(assetName, tag);
    if (assetId) {
      downloadAssetById(assetId, archivePath);
    } else {
      // 3. Fall back to direct URL (works for public repos)
      downloadFile(getDownloadUrl(assetName, tag), archivePath);
    }
  }

  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }

  return { binaryPath, tempDir };
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
function prepareAioncore(options) {
  const { projectRoot, platform, arch, version = 'latest' } = options;
  const runtimeKey = `${platform}-${arch}`;

  // Resolve the actual version tag — asset filenames include the tag
  let tag;
  if (version === 'latest') {
    const resolved = resolveLatestTag();
    if (!resolved) {
      throw new Error('Failed to resolve latest aioncore release tag from GitHub API');
    }
    tag = resolved;
    console.log(`Resolved aioncore "latest" → ${tag}`);
  } else {
    tag = version.startsWith('v') ? version : `v${version}`;
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(`Preparing aioncore for ${runtimeKey} (version: ${tag})`);

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1. Download from GitHub releases
  if (!sourcePath) {
    try {
      const result = downloadAndExtract(platform, arch, tag);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      sourceDetail = { url: result.url };
      console.log(`  Downloaded from GitHub releases`);
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  // Write result
  if (sourcePath) {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);

    // The release tag is the authoritative version — the aioncore
    // binary does not expose a --version flag (it has --app-version which
    // takes a value, not a self-report).
    const manifest = {
      platform,
      arch,
      version: tag,
      generatedAt: new Date().toISOString(),
      sourceType,
      source: sourceDetail,
      files: [binaryName],
    };

    writeJson(path.join(targetDir, 'manifest.json'), manifest);
    console.log(
      `  Bundled aioncore prepared: resources/bundled-aioncore/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  }

  throw new Error(`aioncore binary not found for ${runtimeKey} (tag: ${tag})`);
}

module.exports = { prepareAioncore };
