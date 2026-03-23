/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function getLatestOfficecliVersion() {
  try {
    const url = 'https://github.com/iOfficeAI/OfficeCli/releases/latest';
    const effective = execSync(`curl -fsSL -o /dev/null -w "%{url_effective}" ${url}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    // URL ends with /tag/v1.0.17 — extract version without "v" prefix
    const tag = effective.split('/').pop();
    return tag ? tag.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

function installOfficecli() {
  if (process.platform === 'win32') {
    execSync('powershell -Command "irm https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.ps1 | iex"', {
      stdio: 'inherit',
    });
  } else {
    execSync('curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash', {
      stdio: 'inherit',
    });
  }
}

function ensureOfficecli() {
  let localVersion;
  try {
    localVersion = execSync('officecli --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    localVersion = null;
  }

  if (localVersion) {
    const remoteVersion = getLatestOfficecliVersion();
    if (!remoteVersion) {
      console.log(`officecli installed (${localVersion}), skipped update check (network unavailable)`);
      return;
    }
    if (remoteVersion === localVersion) {
      console.log(`officecli is up to date (${localVersion})`);
      return;
    }
    console.log(`officecli update available: ${localVersion} → ${remoteVersion}, upgrading...`);
  } else {
    console.log('officecli not found, installing...');
  }

  try {
    installOfficecli();
  } catch (e) {
    console.warn('Failed to install officecli:', e.message);
  }
}

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

    // Ensure officecli is available (needed for PPT preview)
    ensureOfficecli();
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
