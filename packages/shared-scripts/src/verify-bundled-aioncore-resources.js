const fs = require('fs');
const path = require('path');

function backendBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function nodeBinaryName(platform) {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function nodeExecutableParts(platform) {
  return platform === 'win32' ? [nodeBinaryName(platform)] : ['bin', nodeBinaryName(platform)];
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function bundledPath(runtimeKey, ...parts) {
  return normalize(path.join('bundled-aioncore', runtimeKey, ...parts));
}

function requireRelativePath(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!isFile(path.join(baseDir, ...parts))) {
    missing.push(relativePath);
  }
}

function requireRelativeDirectory(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  const fullPath = path.join(baseDir, ...parts);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    missing.push(relativePath);
  }
}

function readDirectories(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function requireFile(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!isFile(path.join(baseDir, ...parts))) {
    missing.push(relativePath);
  }
}

function requireDirectory(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  const fullPath = path.join(baseDir, ...parts);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    missing.push(relativePath);
  }
}

function verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing) {
  const parts = ['manifest.json'];
  const relativePath = bundledPath(runtimeKey, ...parts);
  const manifestPath = path.join(baseDir, ...parts);
  checked.push(relativePath);

  if (!isFile(manifestPath)) {
    missing.push(relativePath);
    return;
  }

  const manifest = readManifest(manifestPath);
  if (!manifest) {
    missing.push(`${relativePath}<invalid-json>`);
    return;
  }

  if (manifest.platform !== electronPlatformName) {
    missing.push(`${relativePath}<platform:${electronPlatformName}>`);
  }

  if (manifest.arch !== targetArch) {
    missing.push(`${relativePath}<arch:${targetArch}>`);
  }
}

function requireManagedNode(baseDir, runtimeKey, platform, checked, missing) {
  const nodeRoot = path.join(baseDir, 'managed-resources', 'node');
  const versions = readDirectories(nodeRoot);
  const executableParts = nodeExecutableParts(platform);

  if (versions.length === 0) {
    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...executableParts);
    checked.push(relativePath);
    missing.push(relativePath);
    return;
  }

  for (const version of versions) {
    requireFile(baseDir, runtimeKey, ['managed-resources', 'node', version, ...executableParts], checked, missing);
  }
}

function acpToolPlatformExecutableParts(platform, runtimeKey, toolId) {
  if (platform !== 'win32') return null;

  if (toolId === 'codex-acp') {
    return ['node_modules', '@zed-industries', `codex-acp-${runtimeKey}`, 'bin', 'codex-acp.exe'];
  }

  if (toolId === 'claude-agent-acp') {
    return ['node_modules', '@anthropic-ai', `claude-agent-sdk-${runtimeKey}`, 'claude.exe'];
  }

  return null;
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function requireManagedAcpTool(baseDir, runtimeKey, platform, toolId, checked, missing) {
  const toolRoot = path.join(baseDir, 'managed-resources', 'acp', toolId);
  const versions = readDirectories(toolRoot);

  if (versions.length === 0) {
    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, '*', runtimeKey, 'manifest.json');
    checked.push(relativePath);
    missing.push(relativePath);
    return;
  }

  for (const version of versions) {
    const platformRoot = path.join(toolRoot, version, runtimeKey);
    const manifestRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      version,
      runtimeKey,
      'manifest.json'
    );
    checked.push(manifestRelativePath);

    const manifestPath = path.join(platformRoot, 'manifest.json');
    if (!isFile(manifestPath)) {
      missing.push(manifestRelativePath);
      continue;
    }

    const manifest = readManifest(manifestPath);
    const entrypoint = typeof manifest?.entrypoint === 'string' ? manifest.entrypoint : null;
    if (!entrypoint) {
      missing.push(bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, version, runtimeKey, '<entrypoint>'));
      continue;
    }

    const entrypointRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      version,
      runtimeKey,
      entrypoint
    );
    checked.push(entrypointRelativePath);

    if (!isFile(path.join(platformRoot, entrypoint))) {
      missing.push(entrypointRelativePath);
    }

    requireFile(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'package.json'],
      checked,
      missing
    );
    requireFile(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'package-lock.json'],
      checked,
      missing
    );
    requireDirectory(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'node_modules'],
      checked,
      missing
    );

    const platformExecutableParts = acpToolPlatformExecutableParts(platform, runtimeKey, toolId);
    if (platformExecutableParts) {
      requireFile(
        baseDir,
        runtimeKey,
        ['managed-resources', 'acp', toolId, version, runtimeKey, ...platformExecutableParts],
        checked,
        missing
      );
    }
  }
}

function verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const baseDir = path.join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const checked = [];
  const missing = [];

  requireRelativePath(baseDir, runtimeKey, [backendBinaryName(electronPlatformName)], checked, missing);
  verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing);
  requireRelativeDirectory(baseDir, runtimeKey, ['managed-resources'], checked, missing);
  requireManagedNode(baseDir, runtimeKey, electronPlatformName, checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, electronPlatformName, 'codex-acp', checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, electronPlatformName, 'claude-agent-acp', checked, missing);

  return { runtimeKey, checked, missing };
}

module.exports = {
  verifyBundledAioncoreResources,
};
