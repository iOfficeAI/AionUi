/**
 * Prepare aionrs binary for Electron packaging.
 *
 * Resolution order:
 *  1. GitHub release download (requires AIONRS_VERSION or defaults to "latest")
 *
 * Output: resources/bundled-aionrs/{platform}-{arch}/aionrs[.exe]
 *
 * Pattern follows prepareBundledBun.js.
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'iOfficeAI';
const GITHUB_REPO = 'aionrs';

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
  return platform === 'win32' ? 'aionrs.exe' : 'aionrs';
}

function getVersion() {
  return (process.env.AIONRS_VERSION || 'latest').trim();
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * 1. Download from GitHub releases
 */
function getAssetName(platform, arch) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  return `aionrs-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, version) {
  if (version === 'latest') {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${assetName}`;
  }
  const tag = version.startsWith('v') ? version : `v${version}`;
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
  // Search recursively for the binary
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

function downloadAndExtract(platform, arch, version) {
  const assetName = getAssetName(platform, arch);
  if (!assetName) {
    throw new Error(`Unsupported aionrs target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, version);
  const tempDir = path.join(os.tmpdir(), 'aionui-aionrs', version, `${platform}-${arch}`);
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

  return { binaryPath, tempDir };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function prepareAionrs() {
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  // Support cross-compilation: AIONRS_ARCH > npm_config_target_arch > process.arch
  const arch = process.env.AIONRS_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const version = getVersion();

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aionrs', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(`Preparing aionrs for ${runtimeKey} (version: ${version})`);

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1. Download from GitHub releases
  if (!sourcePath) {
    try {
      const result = downloadAndExtract(platform, arch, version);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      sourceDetail = { url: getDownloadUrl(getAssetName(platform, arch), version) };
      console.log(`  Downloaded from GitHub releases`);
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  // Write result
  if (sourcePath) {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);

    // Get version info from binary
    let binaryVersion = version;
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

  // Not found — write skip manifest (non-fatal, like bundled-bun)
  const manifest = {
    platform,
    arch,
    version,
    generatedAt: new Date().toISOString(),
    sourceType: 'none',
    source: {},
    files: [],
    skipped: true,
    reason: 'aionrs binary not found (ensure GitHub release exists)',
  };

  writeJson(path.join(targetDir, 'manifest.json'), manifest);
  console.warn(`  aionrs not found — skipping bundle (agent will not be available in packaged app)`);
  return { prepared: false, reason: 'not_found' };
}

module.exports = prepareAionrs;
