const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveCommand(commandName) {
  const resolver = process.platform === 'win32' ? 'where' : 'which';
  try {
    const output = execFileSync(resolver, [commandName], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });

    const first = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return first && fs.existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

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

function getRequiredRuntimeFiles(platform) {
  return platform === 'win32' ? ['bun.exe', 'bunx.exe'] : ['bun', 'bunx'];
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

function getRuntimeVersion() {
  const configured = process.env.AIONUI_BUN_VERSION;
  return configured && configured.trim() ? configured.trim() : 'latest';
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

  const normalized = version.startsWith('bun-v') ? version : version.startsWith('v') ? `bun-${version}` : `bun-v${version}`;
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
  console.log(`🌐 Downloading bun runtime from ${url}`);

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

function isCachedRuntimeValid(cacheRuntimeDir, platform) {
  const requiredFiles = getRequiredRuntimeFiles(platform);
  return requiredFiles.every((fileName) => fs.existsSync(path.join(cacheRuntimeDir, fileName)));
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
    copied.push(fileName);
  }

  if (platform === 'win32') {
    const bunxCmd = path.join(sourceDir, 'bunx.cmd');
    if (fs.existsSync(bunxCmd)) {
      copyFileSafe(bunxCmd, path.join(targetDir, 'bunx.cmd'));
      copied.push('bunx.cmd');
    }
  }

  return copied;
}

function copyFromSystemTools(cacheRuntimeDir, platform) {
  const bunName = platform === 'win32' ? 'bun.exe' : 'bun';
  const bunxName = platform === 'win32' ? 'bunx.exe' : 'bunx';
  const bunPath = resolveCommand(bunName);
  const bunxPath = resolveCommand(bunxName);

  if (!bunPath || !bunxPath) {
    return null;
  }

  removeDirectorySafe(cacheRuntimeDir);
  ensureDirectory(cacheRuntimeDir);

  const copied = [];
  copyFileSafe(bunPath, path.join(cacheRuntimeDir, path.basename(bunPath)));
  copied.push(path.basename(bunPath));

  const bunxTarget = path.join(cacheRuntimeDir, path.basename(bunxPath));
  if (!fs.existsSync(bunxTarget)) {
    copyFileSafe(bunxPath, bunxTarget);
    copied.push(path.basename(bunxPath));
  }

  if (platform === 'win32') {
    const bunxCmdPath = path.join(path.dirname(bunxPath), 'bunx.cmd');
    if (fs.existsSync(bunxCmdPath)) {
      copyFileSafe(bunxCmdPath, path.join(cacheRuntimeDir, 'bunx.cmd'));
      copied.push('bunx.cmd');
    }
  }

  return {
    sourceType: 'system',
    source: {
      bun: bunPath,
      bunx: bunxPath,
    },
    files: copied,
  };
}

function downloadRuntimeIntoCache(cacheRuntimeDir, platform, arch, version) {
  const assetName = getPlatformAsset(platform, arch);
  if (!assetName) {
    throw new Error(`Unsupported bun runtime target: ${platform}-${arch}`);
  }

  const downloadUrl = getDownloadUrl(assetName, version);
  const tempRoot = path.join(cacheRuntimeDir, '_tmp');
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

  removeDirectorySafe(tempRoot);

  return {
    sourceType: 'download',
    source: {
      url: downloadUrl,
      asset: assetName,
    },
    files: copied,
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

    if (isCachedRuntimeValid(cacheRuntimeDir, platform)) {
      prepareResult = {
        sourceType: 'cache',
        source: {
          dir: cacheRuntimeDir,
        },
        files: copyRuntimeFromDirectory(cacheRuntimeDir, targetDir, platform),
      };
    } else {
      prepareResult = copyFromSystemTools(cacheRuntimeDir, platform);
      if (!prepareResult) {
        prepareResult = downloadRuntimeIntoCache(cacheRuntimeDir, platform, arch, runtimeVersion);
      }

      // Always copy from cache into packaging resources for deterministic output.
      prepareResult.files = copyRuntimeFromDirectory(cacheRuntimeDir, targetDir, platform);
    }

    const manifest = {
      platform,
      arch,
      version: runtimeVersion,
      generatedAt: new Date().toISOString(),
      sourceType: prepareResult.sourceType,
      cacheDir: cacheRuntimeDir,
      source: prepareResult.source,
      files: prepareResult.files,
      skipped: false,
    };

    writeManifest(targetDir, manifest);
    console.log(
      `📦 Bundled bun runtime prepared: ${path.relative(projectRoot, targetDir)} (${prepareResult.files.join(', ')}) [source=${prepareResult.sourceType}]`
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
    console.warn(`⚠️  Failed to prepare bundled bun runtime: ${manifest.reason}`);
    return { prepared: false, reason: 'error' };
  }
}

module.exports = prepareBundledBun;
