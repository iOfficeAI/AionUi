/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const isWindows = process.platform === 'win32';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Platform=${process.platform}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else if (isWindows) {
      // On Windows in local dev, skip rebuild to avoid Python/C++ build tools requirement
      // Windows 本地开发环境跳过重建，避免需要 Python/C++ 编译工具
      console.log('Windows local environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules (bcrypt, better-sqlite3) will use prebuilt binaries');
      console.log('If you encounter issues, run: npm run rebuild:native');
    } else {
      // In local environment (macOS/Linux), use electron-builder to install dependencies
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