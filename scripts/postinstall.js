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
      // Download Electron-compatible prebuilt binaries for native modules
      // 下载 Electron 兼容的预编译二进制文件
      console.log('Downloading Electron-compatible native modules...');

      const nativeModules = ['better-sqlite3', 'bcrypt'];
      const nodeModules = require('path').resolve(__dirname, '../node_modules');

      for (const mod of nativeModules) {
        const modPath = require('path').join(nodeModules, mod);
        try {
          console.log(`  - ${mod}...`);
          // Use prebuild-install to download Electron prebuilt binaries
          execSync('npx prebuild-install', {
            cwd: modPath,
            stdio: 'pipe',
            env: {
              ...process.env,
              npm_config_runtime: 'electron',
              npm_config_target: electronVersion,
              npm_config_dist_url: 'https://electronjs.org/headers',
              npm_config_build_from_source: 'false'
            }
          });
          console.log(`    ✓ ${mod} ready`);
        } catch (e) {
          console.log(`    ⚠ ${mod} prebuilt not available, will use fallback`);
        }
      }

      console.log('\n✅ Native modules configured for Electron');
    }
  } catch (e) {
    console.error('Postinstall warning:', e.message);
    console.log('\n⚠️  Native modules may need manual rebuild');
    console.log('If you encounter errors when starting the app, run: npm run rebuild:native');
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;