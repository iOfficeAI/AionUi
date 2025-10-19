const { Arch } = require('builder-util');
const fs = require('fs');
const path = require('path');
const { normalizeArch, rebuildSingleModule, verifyModuleBinary } = require('./rebuildNativeModules');

/**
 * afterPack hook for electron-builder
 * Ensures native modules are correctly rebuilt in packaged app (Linux only)
 * Other platforms are handled by beforeBuild hook
 */

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = normalizeArch(typeof arch === 'string' ? arch : Arch[arch] || process.arch);

  // Only rebuild for Linux (beforeBuild handles other platforms)
  if (electronPlatformName !== 'linux') {
    return;
  }

  console.log(`🔧 Rebuilding packaged modules (linux-${targetArch})...`);

  const electronVersion =
    packager?.info?.electronVersion ??
    packager?.config?.electronVersion ??
    require('../package.json').devDependencies?.electron?.replace(/^\D*/, '');

  const moduleRoot = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3'
  );

  if (!fs.existsSync(moduleRoot)) {
    console.warn(`⚠️  better-sqlite3 not found in packaged app`);
    return;
  }

  const success = rebuildSingleModule({
    moduleName: 'better-sqlite3',
    moduleRoot,
    platform: 'linux',
    arch: targetArch,
    electronVersion,
    projectRoot: path.resolve(__dirname, '..'),
  });

  if (!success || !verifyModuleBinary(moduleRoot, 'better-sqlite3')) {
    throw new Error(`Failed to rebuild better-sqlite3 for linux-${targetArch}`);
  }
};
