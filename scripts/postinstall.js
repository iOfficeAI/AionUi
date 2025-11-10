/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Platform=${process.platform}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      // Windows: Requires Python and Visual Studio Build Tools
      // macOS/Linux: Requires standard build tools
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
    if (process.platform === 'win32') {
      console.error('\nWindows users: Please install build tools:');
      console.error('  npm install --global windows-build-tools');
      console.error('Or manually install:');
      console.error('  - Python 3.x: https://www.python.org/downloads/');
      console.error('  - Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/');
    }
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;