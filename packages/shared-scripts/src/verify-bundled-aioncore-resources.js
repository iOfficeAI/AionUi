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

  if (!fs.existsSync(path.join(baseDir, ...parts))) {
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

  const executableFound = versions.some((version) => {
    const executablePath = path.join(nodeRoot, version, ...executableParts);
    return isFile(executablePath);
  });

  const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...executableParts);
  checked.push(relativePath);

  if (!executableFound) {
    missing.push(relativePath);
  }
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function requireManagedAcpTool(baseDir, runtimeKey, toolId, checked, missing) {
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
      '*',
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
  }
}

function verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const baseDir = path.join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const checked = [];
  const missing = [];

  requireRelativePath(baseDir, runtimeKey, [backendBinaryName(electronPlatformName)], checked, missing);
  requireRelativePath(baseDir, runtimeKey, ['manifest.json'], checked, missing);
  requireRelativePath(baseDir, runtimeKey, ['managed-resources'], checked, missing);
  requireManagedNode(baseDir, runtimeKey, electronPlatformName, checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, 'codex-acp', checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, 'claude-agent-acp', checked, missing);

  return { runtimeKey, checked, missing };
}

module.exports = {
  verifyBundledAioncoreResources,
};
