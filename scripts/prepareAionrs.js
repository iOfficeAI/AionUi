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
 * Resolve the actual version tag when "latest" is requested.
 * Uses GitHub API via `gh` CLI (needs GH_TOKEN in CI) or falls back to
 * `curl` with an optional Authorization header (GITHUB_TOKEN / GH_TOKEN).
 */
function resolveLatestTag() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // 1. Try gh CLI (honours GH_TOKEN automatically)
  try {
    const ghArgs = ['api', `repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, '--jq', '.tag_name'];
    const out = execFileSync('gh', ghArgs, {
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
 * 1. Download from GitHub releases
 *
 * aionrs release assets include the version tag in the filename:
 *   aionrs-v0.1.9-aarch64-apple-darwin.tar.gz
 */
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
    execFileSync(
      'curl',
      ['--http1.1', '-L', '--fail', '--silent', '--show-error', '--retry', '2', '-o', outputPath, url],
      { timeout: 120000 }
    );
    return;
  } catch (curlError) {
    try {
      execFileSync('wget', ['-q', '-O', outputPath, url], { timeout: 120000 });
      return;
    } catch {
      downloadFileWithNode(url, outputPath, curlError);
      return;
    }
  }
}

function downloadFileWithNode(url, outputPath, cause) {
  const downloadScript = `
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const url = process.argv[1];
const outputPath = process.argv[2];
const maxRedirects = 5;

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function request(currentUrl, redirectCount) {
  const client = currentUrl.startsWith('https:') ? https : http;
  const req = client.get(
    currentUrl,
    {
      headers: {
        'user-agent': 'AionUi/prepareAionrs',
        accept: '*/*',
      },
      timeout: 120000,
    },
    (res) => {
      const statusCode = res.statusCode || 0;
      const location = res.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        if (redirectCount >= maxRedirects) {
          console.error('Too many redirects while downloading ' + url);
          process.exit(1);
        }
        request(new URL(location, currentUrl).toString(), redirectCount + 1);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        console.error('HTTP ' + statusCode + ' while downloading ' + url);
        process.exit(1);
      }

      ensureDirectory(path.dirname(outputPath));
      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => process.exit(0)));
      fileStream.on('error', (error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
    }
  );

  req.on('timeout', () => {
    req.destroy(new Error('Request timeout while downloading ' + url));
  });

  req.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

request(url, 0);
`;

  try {
    execFileSync(process.execPath, ['-e', downloadScript, url, outputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 125000,
    });
  } catch (nodeError) {
    throw nodeError instanceof Error ? nodeError : new Error(String(nodeError));
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

  // Resolve the actual version tag — asset filenames include the tag
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

    // Get version info from binary
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

  // Not found — write skip manifest (non-fatal, like bundled-bun)
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
  console.warn(`  aionrs not found — skipping bundle (agent will not be available in packaged app)`);
  return { prepared: false, reason: 'not_found' };
}

if (require.main === module) {
  prepareAionrs();
}

module.exports = prepareAionrs;
