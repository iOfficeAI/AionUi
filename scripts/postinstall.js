/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Create symlink for web-tree-sitter from aioncli-core's nested node_modules
 * web-tree-sitter 是 aioncli-core 的嵌套依赖，需要创建 symlink 以便 webpack externals 解析
 */
function createWebTreeSitterSymlink() {
  const nodeModulesPath = path.resolve(__dirname, '../node_modules');
  const symlinkPath = path.join(nodeModulesPath, 'web-tree-sitter');
  const targetPath = path.join(nodeModulesPath, '@office-ai/aioncli-core/node_modules/web-tree-sitter');

  try {
    // Check if target exists
    if (!fs.existsSync(targetPath)) {
      console.log('web-tree-sitter not found in aioncli-core, skipping symlink creation');
      return;
    }

    // Remove existing symlink or directory if it exists
    if (fs.existsSync(symlinkPath)) {
      const stats = fs.lstatSync(symlinkPath);
      if (stats.isSymbolicLink()) {
        fs.unlinkSync(symlinkPath);
      } else {
        return;
      }
    }

    // Create relative symlink (relative path is more portable)
    fs.symlinkSync('@office-ai/aioncli-core/node_modules/web-tree-sitter', symlinkPath, 'junction');
  } catch (e) {
  }
}

function runPostInstall() {
  try {
    // Create symlink for web-tree-sitter (needed for aioncli-core nested dependency)
    createWebTreeSitterSymlink();

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