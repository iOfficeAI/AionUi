/**
 * Fork-only prepareAionrs variant for manual fork builds.
 *
 * This keeps the upstream script unchanged while adding one extra public-repo
 * fallback for resolving the latest release tag when no PAT is configured.
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'iOfficeAI';
const GITHUB_REPO = 'aionrs';

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
  return platform === 'win32' ? 'aionrs.exe' : 'aionrs';
}

function getVersion() {
  return (process.env.AIONRS_VERSION || 'latest').trim();
}

function resolveLatestTag() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // 1. Try gh CLI when a token is available.
  if (token) {
    try {
      const out = execSync(`gh api repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest --jq .tag_name`, {
        encoding: 'utf-8',
        timeout: 15000,
      }).trim();
      if (out) return out;
    } catch {
      // gh CLI failed; try HTTP fallback below.
    }
  }

  // 2. GitHub API via curl, with token when available.
  try {
    const authArgs = token ? ['-H', `Authorization: token ${token}`] : [];
    const args = ['-fsSL', ...authArgs, `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`];
    const out = execFileSync('curl', args, { encoding: 'utf-8', timeout: 15000 });
    const tag = JSON.parse(out).tag_name;
    if (tag) return tag;
  } catch {
    // API lookup failed; try public redirect fallback.
  }

  // 3. Public release page redirect fallback for forks without a PAT.
  // GitHub redirects `/releases/latest` to `/releases/tag/<tag>` on public repos.
  try {
    const discardOutput = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const out = execFileSync(
      'curl',
      [
        '-fsSL',
        '-A',
        'AionUi Fork Build Script',
        '-o',
        discardOutput,
        '-w',
        '%{url_effective}',
        `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      ],
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();
    const match = out.match(/\/releases\/tag\/([^/?#]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Public redirect lookup failed.
  }

  return null;
}

function getAssetName(platform, arch, tag) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  return `aionrs-${tag}-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, tag) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading aionrs from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 120000 });
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

function downloadAndExtract(platform, arch, tag) {
  const assetName = getAssetName(platform, arch, tag);
  if (!assetName) {
    throw new Error(`Unsupported aionrs target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, tag);
  const tempDir = path.join(os.tmpdir(), 'aionui-aionrs', tag, `${platform}-${arch}`);
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

function prepareAionrs() {
  const projectRoot = path.resolve(__dirname, '../..');
  const platform = process.platform;
  const arch = process.env.AIONRS_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const version = getVersion();

  let tag;
  if (version === 'latest') {
    const resolved = resolveLatestTag();
    if (!resolved) {
      throw new Error('Failed to resolve latest aionrs release tag from GitHub API');
    }
    tag = resolved;
    console.log(`Resolved aionrs "latest" → ${tag}`);
  } else {
    tag = version.startsWith('v') ? version : `v${version}`;
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aionrs', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(`Preparing aionrs for ${runtimeKey} (version: ${tag})`);

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  if (!sourcePath) {
    try {
      const result = downloadAndExtract(platform, arch, tag);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      sourceDetail = { url: result.url };
      console.log('  Downloaded from GitHub releases');
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  if (sourcePath) {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);

    let binaryVersion = tag;
    try {
      binaryVersion = execSync(`"${targetBinaryPath}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch {}

    const manifest = {
      platform,
      arch,
      version: binaryVersion,
      generatedAt: new Date().toISOString(),
      sourceType,
      source: sourceDetail,
      files: [binaryName],
      skipped: false,
    };

    writeJson(path.join(targetDir, 'manifest.json'), manifest);
    console.log(
      `  Bundled aionrs prepared: resources/bundled-aionrs/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  }

  const manifest = {
    platform,
    arch,
    version: tag,
    generatedAt: new Date().toISOString(),
    sourceType: 'none',
    source: {},
    files: [],
    skipped: true,
    reason: 'aionrs binary not found (ensure GitHub release exists)',
  };

  writeJson(path.join(targetDir, 'manifest.json'), manifest);
  console.warn('  aionrs not found — skipping bundle (agent will not be available in packaged app)');
  return { prepared: false, reason: 'not_found' };
}

module.exports = prepareAionrs;
