/**
 * Prepare the official Lark CLI binary for desktop packaging.
 *
 * Output: {projectRoot}/resources/bundled-lark-cli/{platform}-{arch}/
 *   - lark-cli[.exe]
 *   - LICENSE.txt
 *   - manifest.json
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'larksuite';
const GITHUB_REPO = 'cli';

const PLATFORM_NAMES = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCH_NAMES = {
  arm64: 'arm64',
  x64: 'amd64',
};

function normalizeVersion(version) {
  const normalized = String(version || '')
    .trim()
    .replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`Invalid Lark CLI version: ${version}`);
  }
  return normalized;
}

function getLarkCliBinaryName(platform) {
  return platform === 'win32' ? 'lark-cli.exe' : 'lark-cli';
}

function getLarkCliAssetName(platform, arch, version) {
  const platformName = PLATFORM_NAMES[platform];
  const archName = ARCH_NAMES[arch];
  if (!platformName || !archName) {
    throw new Error(`Unsupported Lark CLI target: ${platform}-${arch}`);
  }
  const extension = platform === 'win32' ? '.zip' : '.tar.gz';
  return `lark-cli-${normalizeVersion(version)}-${platformName}-${archName}${extension}`;
}

function parseChecksum(checksums, assetName) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (match?.[2] === assetName) return match[1].toLowerCase();
  }
  throw new Error(`Checksum entry not found for ${assetName}`);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function verifyFileChecksum(filePath, expectedChecksum) {
  const actualChecksum = sha256File(filePath);
  if (actualChecksum !== expectedChecksum.toLowerCase()) {
    throw new Error(
      `Lark CLI checksum mismatch for ${path.basename(filePath)}: expected ${expectedChecksum}, got ${actualChecksum}`
    );
  }
}

function downloadFile(url, outputPath) {
  execFileSync(
    'curl',
    [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '15',
      '--max-time',
      '180',
      '--max-redirs',
      '3',
      '--output',
      outputPath,
      url,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], timeout: 200000 }
  );
}

function extractArchive(archivePath, outputDir, platform) {
  fs.mkdirSync(outputDir, { recursive: true });
  if (archivePath.endsWith('.zip')) {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:LARK_CLI_ARCHIVE -DestinationPath $env:LARK_CLI_DEST -Force",
        ],
        {
          env: { ...process.env, LARK_CLI_ARCHIVE: archivePath, LARK_CLI_DEST: outputDir },
          stdio: 'inherit',
        }
      );
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir], { stdio: 'inherit' });
    }
    return;
  }
  execFileSync('tar', ['-xzf', archivePath, '-C', outputDir], { stdio: 'inherit' });
}

function findFile(directory, fileName) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === fileName) return entryPath;
    if (entry.isDirectory()) {
      const nested = findFile(entryPath, fileName);
      if (nested) return nested;
    }
  }
  return null;
}

function verifyBundledLarkCliResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const bundleDir = path.join(resourcesDir, 'bundled-lark-cli', runtimeKey);
  const binaryName = getLarkCliBinaryName(electronPlatformName);
  const requiredFiles = [binaryName, 'LICENSE.txt', 'manifest.json'];
  const checked = requiredFiles.map((fileName) => path.join(bundleDir, fileName));
  const missing = checked.filter((filePath) => !fs.existsSync(filePath));
  const errors = [];

  if (missing.length === 0) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'));
      if (manifest.platform !== electronPlatformName || manifest.arch !== targetArch) {
        errors.push(
          `manifest target mismatch: expected ${runtimeKey}, got ${manifest.platform || 'unknown'}-${manifest.arch || 'unknown'}`
        );
      }
      if (!/^[a-f0-9]{64}$/.test(manifest.binarySha256 || '')) {
        errors.push('manifest binarySha256 is missing or invalid');
      } else {
        const actualBinaryChecksum = sha256File(path.join(bundleDir, binaryName));
        if (actualBinaryChecksum !== manifest.binarySha256) {
          errors.push(`binary checksum mismatch: expected ${manifest.binarySha256}, got ${actualBinaryChecksum}`);
        }
      }
    } catch (error) {
      errors.push(`invalid manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { runtimeKey, bundleDir, checked, missing, errors };
}

function prepareLarkCli({ projectRoot, platform, arch, version }) {
  const normalizedVersion = normalizeVersion(version);
  const runtimeKey = `${platform}-${arch}`;
  const assetName = getLarkCliAssetName(platform, arch, normalizedVersion);
  const releaseBase = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${normalizedVersion}`;
  const archiveUrl = `${releaseBase}/${assetName}`;
  const checksumsUrl = `${releaseBase}/checksums.txt`;
  const licenseUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/v${normalizedVersion}/LICENSE`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csbu-workmate-lark-cli-'));
  const archivePath = path.join(tempDir, assetName);
  const checksumsPath = path.join(tempDir, 'checksums.txt');
  const extractedDir = path.join(tempDir, 'extracted');
  const targetDir = path.join(projectRoot, 'resources', 'bundled-lark-cli', runtimeKey);
  const binaryName = getLarkCliBinaryName(platform);

  console.log(`Preparing Lark CLI for ${runtimeKey} (version: v${normalizedVersion})`);
  try {
    downloadFile(checksumsUrl, checksumsPath);
    downloadFile(archiveUrl, archivePath);
    const expectedChecksum = parseChecksum(fs.readFileSync(checksumsPath, 'utf8'), assetName);
    verifyFileChecksum(archivePath, expectedChecksum);
    extractArchive(archivePath, extractedDir, platform);

    const extractedBinary = findFile(extractedDir, binaryName);
    if (!extractedBinary) {
      throw new Error(`${binaryName} not found in ${assetName}`);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    const targetBinary = path.join(targetDir, binaryName);
    fs.copyFileSync(extractedBinary, targetBinary);
    if (platform !== 'win32') fs.chmodSync(targetBinary, 0o755);
    const binaryChecksum = sha256File(targetBinary);

    downloadFile(licenseUrl, path.join(targetDir, 'LICENSE.txt'));
    fs.writeFileSync(
      path.join(targetDir, 'manifest.json'),
      `${JSON.stringify(
        {
          name: '@larksuite/cli',
          version: normalizedVersion,
          platform,
          arch,
          asset: assetName,
          archiveSha256: expectedChecksum,
          binarySha256: binaryChecksum,
          source: archiveUrl,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const verification = verifyBundledLarkCliResources({
      resourcesDir: path.join(projectRoot, 'resources'),
      electronPlatformName: platform,
      targetArch: arch,
    });
    if (verification.missing.length > 0 || verification.errors.length > 0) {
      throw new Error(
        `Prepared Lark CLI bundle is invalid: ${[...verification.missing, ...verification.errors].join(', ')}`
      );
    }

    console.log(`  Bundled Lark CLI prepared: resources/bundled-lark-cli/${runtimeKey}/${binaryName}`);
    return { prepared: true, dir: targetDir, version: normalizedVersion };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  getLarkCliAssetName,
  getLarkCliBinaryName,
  normalizeVersion,
  parseChecksum,
  prepareLarkCli,
  verifyBundledLarkCliResources,
  verifyFileChecksum,
};
