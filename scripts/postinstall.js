/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function runPostInstall() {
  try {
    // Install vnstock Python dependencies
    console.log('Checking vnstock installation...');
    try {
      const { execSync: execSyncLocal } = require('child_process');
      const path = require('path');
      const installScript = path.join(__dirname, '..', 'assistant', 'vnstock', 'workspace', 'setup.sh');

      // Check if Python is available
      try {
        execSyncLocal('python3 --version', { stdio: 'pipe' });
        console.log('Python 3 detected, installing vnstock...');
        execSyncLocal(`bash "${installScript}"`, { stdio: 'inherit' });
      } catch (pythonError) {
        console.warn('Python 3 not found. vnstock features will not be available.');
        console.warn('Install Python 3.10+ to enable Vietnamese stock market analysis.');
      }
    } catch (vnstockError) {
      console.warn('vnstock installation failed:', vnstockError.message);
      console.warn('You can manually install vnstock later with: bash scripts/install-vnstock.sh');
    }

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
      execSync('npx electron-builder install-app-deps', {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_build_from_source: 'true'
        }
      });
    }
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