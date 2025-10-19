const { Arch } = require('builder-util');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { normalizeArch, rebuildSingleModule, verifyModuleBinary } = require('./rebuildNativeModules');

/**
 * afterPack hook for electron-builder
 * Copies native modules to packaged app and rebuilds them (all platforms)
 */

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  if (process.platform === 'win32') {
    execSync(`xcopy "${src}" "${dest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
  } else {
    execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
  }

  return true;
}

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = normalizeArch(typeof arch === 'string' ? arch : Arch[arch] || process.arch);

  const projectRoot = path.resolve(__dirname, '..');
  const asarUnpackedDir = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  const nodeModulesDir = path.join(asarUnpackedDir, 'node_modules');

  // Ensure app.asar.unpacked/node_modules exists
  if (!fs.existsSync(nodeModulesDir)) {
    fs.mkdirSync(nodeModulesDir, { recursive: true });
  }

  // Copy native modules
  const nativeModules = ['better-sqlite3', 'bcrypt', 'node-pty'];
  const dependencyModules = ['@mapbox', 'detect-libc', 'prebuild-install', 'node-addon-api', 'node-gyp-build', 'bindings'];
  const allModules = [...nativeModules, ...dependencyModules];

  console.log(`📦 Copying native modules to packaged app...`);
  for (const moduleName of allModules) {
    const srcPath = path.join(projectRoot, 'node_modules', moduleName);
    const destPath = path.join(nodeModulesDir, moduleName);

    if (copyDir(srcPath, destPath)) {
      console.log(`   ✓ ${moduleName}`);
    } else {
      console.warn(`   ⚠ ${moduleName} not found`);
    }
  }

  // Rebuild native modules for Linux only
  if (electronPlatformName !== 'linux') {
    return;
  }

  console.log(`🔧 Rebuilding native modules (linux-${targetArch})...`);

  const electronVersion =
    packager?.info?.electronVersion ??
    packager?.config?.electronVersion ??
    require('../package.json').devDependencies?.electron?.replace(/^\D*/, '');

  const moduleRoot = path.join(nodeModulesDir, 'better-sqlite3');

  if (!fs.existsSync(moduleRoot)) {
    throw new Error('better-sqlite3 not found after copy');
  }

  const success = rebuildSingleModule({
    moduleName: 'better-sqlite3',
    moduleRoot,
    platform: 'linux',
    arch: targetArch,
    electronVersion,
    projectRoot,
  });

  if (!success || !verifyModuleBinary(moduleRoot, 'better-sqlite3')) {
    throw new Error(`Failed to rebuild better-sqlite3 for linux-${targetArch}`);
  }
};
