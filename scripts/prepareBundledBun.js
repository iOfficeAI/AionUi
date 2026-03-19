const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_META_FILE = 'runtime-meta.json';

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

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function getRequiredRuntimeFiles(platform) {
  return [platform === 'win32' ? 'bun.exe' : 'bun'];
}

function getRuntimeVersion() {
  const configured = process.env.AIONUI_BUN_VERSION;
  return configured && configured.trim() ? configured.trim() : 'latest';
}

function getCacheRootDir() {
  const custom = process.env.AIONUI_BUN_CACHE_DIR;
  if (custom && custom.trim()) {
    return path.resolve(custom.trim());
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'AionUi', 'cache', 'bundled-bun');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'AionUi', 'bundled-bun');
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(xdgCacheHome, 'AionUi', 'bundled-bun');
}

function getPlatformAsset(platform, arch) {
  const archMap = {
    x64: 'x64',
    arm64: 'aarch64',
  };
  const normalizedArch = archMap[arch];
  if (!normalizedArch) return null;

  const platformMap = {
    win32: 'windows',
    darwin: 'darwin',
    linux: 'linux',
  };
  const normalizedPlatform = platformMap[platform];
  if (!normalizedPlatform) return null;

  return `bun-${normalizedPlatform}-${normalizedArch}.zip`;
}

function getDownloadUrl(assetName, version) {
  if (version === 'latest') {
    return `https://github.com/oven-sh/bun/releases/latest/download/${assetName}`;
  }

  const normalized = version.startsWith('bun-v')
    ? version
    : version.startsWith('v')
      ? `bun-${version}`
      : `bun-v${version}`;
  return `https://github.com/oven-sh/bun/releases/download/${normalized}/${assetName}`;
}

function runCommand(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    ...options,
  });
}

function downloadFile(url, outputPath) {
  console.log(`Downloading bun runtime from ${url}`);

  if (process.platform === 'win32') {
    const psScript = [
      "$ProgressPreference='SilentlyContinue'",
      `Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`,
    ].join('; ');

    runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
    return;
  }

  try {
    runCommand('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url]);
    return;
  } catch {
    runCommand('wget', ['-q', '-O', outputPath, url]);
  }
}

function extractZip(zipPath, outputDir) {
  ensureDirectory(outputDir);

  if (process.platform === 'win32') {
    const psScript = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
    runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
    return;
  }

  try {
    runCommand('unzip', ['-o', zipPath, '-d', outputDir]);
    return;
  } catch {
    runCommand('tar', ['-xf', zipPath, '-C', outputDir]);
  }
}

function listDirectoriesRecursive(dirPath, acc = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dirPath, entry.name);
    acc.push(fullPath);
    listDirectoriesRecursive(fullPath, acc);
  }
  return acc;
}

function findRuntimeDirectory(rootDir, requiredFiles) {
  const candidateDirs = [rootDir, ...listDirectoriesRecursive(rootDir)];
  for (const candidate of candidateDirs) {
    const allPresent = requiredFiles.every((fileName) => fs.existsSync(path.join(candidate, fileName)));
    if (allPresent) {
      return candidate;
    }
  }
  return null;
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function getCacheMetaPath(cacheRuntimeDir) {
  return path.join(cacheRuntimeDir, CACHE_META_FILE);
}

function readCacheMeta(cacheRuntimeDir) {
  return readJsonSafe(getCacheMetaPath(cacheRuntimeDir));
}

function writeCacheMeta(cacheRuntimeDir, meta) {
  writeJson(getCacheMetaPath(cacheRuntimeDir), meta);
}

function isCachedRuntimeValid(cacheRuntimeDir, platform, arch, version) {
  const requiredFiles = getRequiredRuntimeFiles(platform);
  const filesOk = requiredFiles.every((fileName) => fs.existsSync(path.join(cacheRuntimeDir, fileName)));
  if (!filesOk) return false;

  const meta = readCacheMeta(cacheRuntimeDir);
  if (!meta) return false;

  return meta.platform === platform && meta.arch === arch && meta.version === version && meta.sourceType === 'download';
}

function writeManifest(outputDir, manifest) {
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

function copyRuntimeFromDirectory(sourceDir, targetDir, platform) {
  const copied = [];
  const requiredFiles = getRequiredRuntimeFiles(platform);

  for (const fileName of requiredFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    copyFileSafe(sourcePath, targetPath);
    ensureExecutableMode(targetPath);
    copied.push(fileName);
  }

  return copied;
}

function downloadRuntimeIntoCache(cacheRuntimeDir, platform, arch, version) {
  const assetName = getPlatformAsset(platform, arch);
  if (!assetName) {
    throw new Error(`Unsupported bun runtime target: ${platform}-${arch}`);
  }

  const downloadUrl = getDownloadUrl(assetName, version);
  const tempRoot = path.join(os.tmpdir(), 'aionui-bundled-bun', version, `${platform}-${arch}`);
  const tempZipPath = path.join(tempRoot, assetName);
  const extractedDir = path.join(tempRoot, 'extracted');

  removeDirectorySafe(tempRoot);
  ensureDirectory(tempRoot);

  downloadFile(downloadUrl, tempZipPath);
  extractZip(tempZipPath, extractedDir);

  const runtimeFiles = getRequiredRuntimeFiles(platform);
  const runtimeDir = findRuntimeDirectory(extractedDir, runtimeFiles);
  if (!runtimeDir) {
    throw new Error(`Downloaded bun archive does not contain expected files: ${runtimeFiles.join(', ')}`);
  }

  removeDirectorySafe(cacheRuntimeDir);
  ensureDirectory(cacheRuntimeDir);
  const copied = copyRuntimeFromDirectory(runtimeDir, cacheRuntimeDir, platform);

  const cacheMeta = {
    platform,
    arch,
    version,
    sourceType: 'download',
    source: {
      url: downloadUrl,
      asset: assetName,
    },
    updatedAt: new Date().toISOString(),
  };
  writeCacheMeta(cacheRuntimeDir, cacheMeta);

  removeDirectorySafe(tempRoot);

  return {
    sourceType: 'download',
    source: cacheMeta.source,
    files: copied,
    cacheMeta,
  };
}

function prepareBundledBun() {
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  const arch = process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const runtimeVersion = getRuntimeVersion();

  const targetDir = path.join(projectRoot, 'resources', 'bundled-bun', runtimeKey);
  const cacheRootDir = getCacheRootDir();
  const cacheRuntimeDir = path.join(cacheRootDir, runtimeVersion, runtimeKey);

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);
  ensureDirectory(cacheRuntimeDir);

  try {
    let prepareResult = null;
    let cacheMeta = null;

    if (isCachedRuntimeValid(cacheRuntimeDir, platform, arch, runtimeVersion)) {
      cacheMeta = readCacheMeta(cacheRuntimeDir);
      prepareResult = {
        sourceType: 'cache',
        source: {
          dir: cacheRuntimeDir,
          origin: cacheMeta?.source || {},
        },
        files: copyRuntimeFromDirectory(cacheRuntimeDir, targetDir, platform),
      };
    } else {
      // Strict policy: packaging should only read from cache.
      // If cache is missing/invalid, refresh cache via network download first.
      const downloadResult = downloadRuntimeIntoCache(cacheRuntimeDir, platform, arch, runtimeVersion);
      cacheMeta = downloadResult.cacheMeta;
      prepareResult = {
        sourceType: downloadResult.sourceType,
        source: downloadResult.source,
        files: copyRuntimeFromDirectory(cacheRuntimeDir, targetDir, platform),
      };
    }

    const manifest = {
      platform,
      arch,
      version: runtimeVersion,
      generatedAt: new Date().toISOString(),
      sourceType: prepareResult.sourceType,
      cacheDir: cacheRuntimeDir,
      cacheMeta,
      source: prepareResult.source,
      files: prepareResult.files,
      skipped: false,
    };

    writeManifest(targetDir, manifest);
    console.log(
      `Bundled bun runtime prepared: ${path.relative(projectRoot, targetDir)} (${prepareResult.files.join(', ')}) [source=${prepareResult.sourceType}]`
    );

    return { prepared: true, dir: targetDir, files: prepareResult.files, sourceType: prepareResult.sourceType };
  } catch (error) {
    const manifest = {
      platform,
      arch,
      version: runtimeVersion,
      generatedAt: new Date().toISOString(),
      sourceType: 'none',
      cacheDir: cacheRuntimeDir,
      source: {},
      files: [],
      skipped: true,
      reason: error instanceof Error ? error.message : String(error),
    };

    writeManifest(targetDir, manifest);
    console.warn(`Failed to prepare bundled bun runtime: ${manifest.reason}`);
    return { prepared: false, reason: 'error' };
  }
}

module.exports = prepareBundledBun;
