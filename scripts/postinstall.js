/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getInstalledPackageVersion(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return readJsonFile(packageJsonPath).version ?? null;
  } catch {
    return null;
  }
}

function getAionCliGenaiRepair(projectRoot = path.resolve(__dirname, '..')) {
  const packageDir = path.join(projectRoot, 'node_modules', '@office-ai', 'aioncli-core');
  const aionCliPackageJsonPath = path.join(packageDir, 'package.json');

  if (!fs.existsSync(aionCliPackageJsonPath)) {
    return null;
  }

  const aionCliPackageJson = readJsonFile(aionCliPackageJsonPath);
  const requiredVersion = aionCliPackageJson.dependencies?.['@google/genai'];
  if (!requiredVersion) {
    return null;
  }

  const installedPackageDir = path.join(packageDir, 'node_modules', '@google', 'genai');
  const installedVersion = getInstalledPackageVersion(installedPackageDir);
  const requiredFiles = ['package.json', path.join('dist', 'index.mjs'), path.join('dist', 'node', 'index.cjs')];
  const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(path.join(installedPackageDir, filePath)));
  const repairNeeded = installedVersion !== requiredVersion || missingFiles.length > 0;

  return {
    installedPackageDir,
    installedVersion,
    missingFiles,
    packageDir,
    packageSpec: `@google/genai@${requiredVersion}`,
    repairNeeded,
    requiredVersion,
  };
}

function runNpmCommand(cwd, args, spawnSyncImpl = spawnSync) {
  return process.platform === 'win32'
    ? spawnSyncImpl('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], { cwd, stdio: 'inherit' })
    : spawnSyncImpl('npm', args, { cwd, stdio: 'inherit' });
}

function repairAionCliGenaiDependency(projectRoot = path.resolve(__dirname, '..'), spawnSyncImpl = spawnSync) {
  const repair = getAionCliGenaiRepair(projectRoot);
  if (!repair?.repairNeeded) {
    return false;
  }

  console.log(`🔧 Repairing nested dependency for @office-ai/aioncli-core: ${repair.packageSpec}`);

  const result = runNpmCommand(
    repair.packageDir,
    ['install', '--no-save', '--ignore-scripts', '--no-package-lock', repair.packageSpec],
    spawnSyncImpl
  );

  if (result.error) {
    throw new Error(`Failed to launch nested dependency repair command: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Failed to repair nested dependency ${repair.packageSpec} (exit code ${result.status})`);
  }

  const verification = getAionCliGenaiRepair(projectRoot);
  if (verification?.repairNeeded) {
    const missing =
      verification.missingFiles.length > 0 ? `, missing files: ${verification.missingFiles.join(', ')}` : '';
    throw new Error(
      `Nested dependency repair incomplete for ${verification.packageSpec} (installed: ${verification.installedVersion ?? 'missing'}${missing})`
    );
  }

  return true;
}

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      execSync('bunx electron-builder install-app-deps', {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_build_from_source: 'true',
        },
      });
    }

    repairAionCliGenaiDependency();
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
module.exports.getAionCliGenaiRepair = getAionCliGenaiRepair;
module.exports.repairAionCliGenaiDependency = repairAionCliGenaiDependency;
