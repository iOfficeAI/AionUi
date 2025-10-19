const { Arch } = require('builder-util');
const fs = require('fs');
const path = require('path');
const { normalizeArch, rebuildSingleModule, verifyModuleBinary } = require('./rebuildNativeModules');

/**
 * afterPack hook for electron-builder
 * Rebuilds native modules for Linux (Forge hook handles copying)
 */

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = normalizeArch(typeof arch === 'string' ? arch : Arch[arch] || process.arch);

  // Only rebuild for Linux (beforeBuild handles other platforms)
  if (electronPlatformName !== 'linux') {
    return;
  }

  console.log(`🔧 Rebuilding native modules (linux-${targetArch})...`);
  console.log(`   appOutDir: ${appOutDir}`);

  const electronVersion =
    packager?.info?.electronVersion ??
    packager?.config?.electronVersion ??
    require('../package.json').devDependencies?.electron?.replace(/^\D*/, '');

  const resourcesDir = path.join(appOutDir, 'resources');
  const moduleRoot = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'better-sqlite3');

  console.log(`   Looking for module at: ${moduleRoot}`);

  if (!fs.existsSync(resourcesDir)) {
    console.warn(`⚠️  resources directory not found: ${resourcesDir}`);
    return;
  }

  if (!fs.existsSync(moduleRoot)) {
    console.warn(`⚠️  better-sqlite3 not found at: ${moduleRoot}`);
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
