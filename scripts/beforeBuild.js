#!/usr/bin/env node

/**
 * beforeBuild hook for electron-builder
 * Rebuilds native modules for target architecture before packaging
 */

const { rebuildWithElectronRebuild } = require('./rebuildNativeModules');

module.exports = async function (context) {
  const { electronVersion, platform, arch, appDir } = context;

  console.log(`🔧 Rebuilding native modules (${platform.name}-${arch})...`);

  try {
    rebuildWithElectronRebuild({
      platform: platform.name,
      arch,
      electronVersion,
      cwd: appDir,
    });

    // Return false to prevent electron-builder from running its default rebuild
    return false;
  } catch (error) {
    console.error(`❌ Native module rebuild failed: ${error.message}`);
    throw error;
  }
};
