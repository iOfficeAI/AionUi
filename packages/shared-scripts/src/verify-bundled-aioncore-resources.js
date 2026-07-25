const fs = require('fs');
const path = require('path');

const REQUIRED_CLI_NAMES = ['claude', 'codex'];

function backendBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function bundledPath(runtimeKey, ...parts) {
  return normalize(path.join('bundled-aioncore', runtimeKey, ...parts));
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function addFailure(failures, missing, checked, failure) {
  if (failure.path) checked.push(failure.path);
  failures.push(failure);
  if (failure.path) {
    missing.push(
      failure.reason === 'missing_file' || failure.reason === 'missing_directory'
        ? failure.path
        : `${failure.path}<${failure.reason}>`
    );
  }
}

function requireRelativePath(baseDir, runtimeKey, parts, checked, missing, failures) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!isFile(path.join(baseDir, ...parts))) {
    const failure = { component: 'aioncore', reason: 'missing_file', path: relativePath };
    failures.push(failure);
    missing.push(relativePath);
  }
}

function requireRelativeDirectory(baseDir, runtimeKey, parts, checked, missing, failures) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  const fullPath = path.join(baseDir, ...parts);
  if (!isDirectory(fullPath)) {
    const failure = { component: 'managed-resources', reason: 'missing_directory', path: relativePath };
    failures.push(failure);
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

function verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing, failures) {
  const parts = ['manifest.json'];
  const relativePath = bundledPath(runtimeKey, ...parts);
  const manifestPath = path.join(baseDir, ...parts);
  checked.push(relativePath);

  if (!isFile(manifestPath)) {
    missing.push(relativePath);
    failures.push({ component: 'bundle-manifest', reason: 'missing_file', path: relativePath });
    return;
  }

  const manifest = readManifest(manifestPath);
  if (!manifest) {
    missing.push(`${relativePath}<invalid-json>`);
    failures.push({ component: 'bundle-manifest', reason: 'invalid_json', path: relativePath });
    return;
  }

  if (manifest.platform !== electronPlatformName) {
    missing.push(`${relativePath}<platform:${electronPlatformName}>`);
    failures.push({ component: 'bundle-manifest', reason: 'runtime_key_mismatch', path: relativePath });
  }

  if (manifest.arch !== targetArch) {
    missing.push(`${relativePath}<arch:${targetArch}>`);
    failures.push({ component: 'bundle-manifest', reason: 'runtime_key_mismatch', path: relativePath });
  }
}

function readManagedResourcesContract(manifestPath) {
  try {
    return { contract: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  } catch (error) {
    return { error };
  }
}

function validateContractRelativePath(value) {
  if (typeof value !== 'string') return false;
  if (!value || value.includes('\\') || path.isAbsolute(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function joinContractPath(root, relativePath) {
  return path.join(root, ...relativePath.split('/'));
}

function contractBundledPath(runtimeKey, ...parts) {
  return bundledPath(runtimeKey, 'managed-resources', ...parts);
}

function addSchemaFailure(failures, missing, component, reason, path) {
  addFailure(failures, missing, [], { component, reason, path });
}

function stringField(value) {
  return typeof value === 'string' && value.length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

function validateContractPathField(value, component, pathLabel, failures) {
  if (!validateContractRelativePath(value)) {
    failures.push({
      component,
      reason: 'invalid_contract_path',
      detail: pathLabel,
    });
    return false;
  }
  return true;
}

function verifyManagedResourcesContract(baseDir, runtimeKey, checked, missing, failures) {
  const managedRoot = path.join(baseDir, 'managed-resources');
  const relativePath = contractBundledPath(runtimeKey, 'manifest.json');
  const manifestPath = path.join(managedRoot, 'manifest.json');
  checked.push(relativePath);

  if (!isFile(manifestPath)) {
    addFailure(failures, missing, [], {
      component: 'managed-resources',
      reason: 'missing_file',
      path: relativePath,
    });
    return;
  }

  const { contract, error } = readManagedResourcesContract(manifestPath);
  if (error) {
    addFailure(failures, missing, [], {
      component: 'managed-resources',
      reason: 'invalid_json',
      path: relativePath,
    });
    return;
  }

  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    addSchemaFailure(failures, missing, 'managed-resources', 'invalid_schema', relativePath);
    return;
  }
  if (contract.schemaVersion !== 2) {
    addSchemaFailure(
      failures,
      missing,
      'managed-resources',
      typeof contract.schemaVersion === 'number' ? 'unsupported_schema_version' : 'invalid_schema',
      relativePath
    );
    return;
  }
  if (contract.runtimeKey !== runtimeKey) {
    addSchemaFailure(failures, missing, 'managed-resources', 'runtime_key_mismatch', relativePath);
    return;
  }
  if (!contract.node || typeof contract.node !== 'object' || Array.isArray(contract.node)) {
    addSchemaFailure(failures, missing, 'managed-resources', 'invalid_schema', relativePath);
    return;
  }
  if (!Array.isArray(contract.clis)) {
    addSchemaFailure(failures, missing, 'managed-resources', 'invalid_schema', relativePath);
    return;
  }

  verifyManagedNodeFromContract(managedRoot, runtimeKey, contract, checked, missing, failures);
  verifyManagedClisFromContract(managedRoot, runtimeKey, contract, checked, missing, failures);
}

function verifyManagedNodeFromContract(baseDir, runtimeKey, contract, checked, missing, failures) {
  const node = contract.node;
  const manifestPath = contractBundledPath(runtimeKey, 'manifest.json');
  if (!stringField(node.version) || !stringField(node.root) || !stringField(node.executable)) {
    addSchemaFailure(failures, missing, 'managed-node', 'invalid_schema', manifestPath);
    return;
  }
  if (
    !validateContractPathField(node.root, 'managed-node', 'node.root', failures) ||
    !validateContractPathField(node.executable, 'managed-node', 'node.executable', failures)
  ) {
    return;
  }

  const executablePath = joinContractPath(joinContractPath(baseDir, node.root), node.executable);
  const relativePath = contractBundledPath(runtimeKey, node.root, node.executable);
  checked.push(relativePath);
  if (!isFile(executablePath)) {
    missing.push(relativePath);
    failures.push({
      component: 'managed-node',
      reason: 'missing_file',
      version: node.version,
      runtimeKey,
      path: relativePath,
    });
  }
}

function verifyManagedClisFromContract(baseDir, runtimeKey, contract, checked, missing, failures) {
  const seen = new Set();
  const validClis = [];
  const manifestPath = contractBundledPath(runtimeKey, 'manifest.json');

  for (const cli of contract.clis) {
    if (!cli || typeof cli !== 'object' || Array.isArray(cli) || !stringField(cli.name)) {
      addSchemaFailure(failures, missing, 'managed-resources', 'invalid_schema', manifestPath);
      continue;
    }
    if (seen.has(cli.name)) {
      failures.push({
        component: cli.name,
        reason: 'duplicate_cli_name',
      });
      continue;
    }
    seen.add(cli.name);
    validClis.push(cli);
  }

  for (const requiredName of REQUIRED_CLI_NAMES) {
    if (!seen.has(requiredName)) {
      failures.push({
        component: requiredName,
        reason: 'missing_required_cli',
      });
    }
  }

  for (const cli of validClis) {
    verifyManagedCliFromContract(baseDir, runtimeKey, cli, checked, missing, failures);
  }
}

function verifyManagedCliFromContract(baseDir, runtimeKey, cli, checked, missing, failures) {
  const manifestPath = contractBundledPath(runtimeKey, 'manifest.json');
  const requiredStringFields = ['name', 'version', 'root', 'platformDirectory', 'executable'];
  if (requiredStringFields.some((field) => !stringField(cli[field]))) {
    addSchemaFailure(failures, missing, cli.name, 'invalid_schema', manifestPath);
    return;
  }
  // requiredFiles / requiredDirectories default to [] (claude has none; codex
  // lists its vendor sidecar subtree). Absent is allowed; when present each entry
  // must be a non-empty string.
  const requiredFiles = cli.requiredFiles === undefined ? [] : cli.requiredFiles;
  const requiredDirectories = cli.requiredDirectories === undefined ? [] : cli.requiredDirectories;
  if (!stringArray(requiredFiles) || !stringArray(requiredDirectories)) {
    addSchemaFailure(failures, missing, cli.name, 'invalid_schema', manifestPath);
    return;
  }
  if (cli.platformDirectory !== runtimeKey) {
    addSchemaFailure(failures, missing, cli.name, 'runtime_key_mismatch', manifestPath);
    return;
  }

  const pathFields = [
    ['root', cli.root],
    ['executable', cli.executable],
    ...requiredFiles.map((entry, index) => [`requiredFiles[${index}]`, entry]),
    ...requiredDirectories.map((entry, index) => [`requiredDirectories[${index}]`, entry]),
  ];
  if (pathFields.some(([field, value]) => !validateContractPathField(value, cli.name, field, failures))) {
    return;
  }

  requireContractFile(baseDir, runtimeKey, cli, cli.root, cli.executable, checked, missing, failures);
  for (const requiredFile of requiredFiles) {
    requireContractFile(baseDir, runtimeKey, cli, cli.root, requiredFile, checked, missing, failures);
  }
  for (const requiredDirectory of requiredDirectories) {
    requireContractDirectory(baseDir, runtimeKey, cli, cli.root, requiredDirectory, checked, missing, failures);
  }
}

function requireContractFile(baseDir, runtimeKey, cli, root, relativePath, checked, missing, failures) {
  const bundledRelative = contractBundledPath(runtimeKey, root, relativePath);
  checked.push(bundledRelative);
  if (!isFile(joinContractPath(joinContractPath(baseDir, root), relativePath))) {
    missing.push(bundledRelative);
    failures.push({
      component: cli.name,
      reason: 'missing_file',
      version: cli.version,
      runtimeKey,
      path: bundledRelative,
    });
  }
}

function requireContractDirectory(baseDir, runtimeKey, cli, root, relativePath, checked, missing, failures) {
  const bundledRelative = contractBundledPath(runtimeKey, root, relativePath);
  checked.push(bundledRelative);
  if (!isDirectory(joinContractPath(joinContractPath(baseDir, root), relativePath))) {
    missing.push(bundledRelative);
    failures.push({
      component: cli.name,
      reason: 'missing_directory',
      version: cli.version,
      runtimeKey,
      path: bundledRelative,
    });
  }
}

function verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const baseDir = path.join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const checked = [];
  const missing = [];
  const failures = [];

  requireRelativePath(baseDir, runtimeKey, [backendBinaryName(electronPlatformName)], checked, missing, failures);
  verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing, failures);
  requireRelativeDirectory(baseDir, runtimeKey, ['managed-resources'], checked, missing, failures);
  verifyManagedResourcesContract(baseDir, runtimeKey, checked, missing, failures);
  if (failures.length > 0 && missing.length === 0) {
    missing.push(`${contractBundledPath(runtimeKey, 'manifest.json')}<contract_failure>`);
  }

  return { runtimeKey, checked, missing, failures };
}

module.exports = {
  verifyBundledAioncoreResources,
};
