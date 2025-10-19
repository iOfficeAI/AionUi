const { Arch } = require('builder-util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { normalizeArch, rebuildSingleModule, verifyModuleBinary } = require('./rebuildNativeModules');

/**
 * afterPack hook for electron-builder
 * Rebuilds native modules for cross-architecture builds
 */

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = normalizeArch(typeof arch === 'string' ? arch : Arch[arch] || process.arch);
  const buildArch = normalizeArch(os.arch());

  console.log(`\n🔧 afterPack hook started`);
  console.log(`   Platform: ${electronPlatformName}, Build arch: ${buildArch}, Target arch: ${targetArch}`);

  // Skip if not cross-compiling
  if (buildArch === targetArch) {
    console.log(`   ✓ Same architecture, no rebuild needed\n`);
    return;
  }

  console.log(`   ⚠️  Cross-compilation detected, will rebuild native modules`);

  console.log(`\n🔧 Checking native modules (${electronPlatformName}-${targetArch})...`);
  console.log(`   appOutDir: ${appOutDir}`);

  const electronVersion =
    packager?.info?.electronVersion ??
    packager?.config?.electronVersion ??
    require('../package.json').devDependencies?.electron?.replace(/^\D*/, '');

  const resourcesDir = path.join(appOutDir, 'resources');

  // Debug: check what's in resources directory
  console.log(`   Checking resources directory: ${resourcesDir}`);
  if (fs.existsSync(resourcesDir)) {
    const resourcesContents = fs.readdirSync(resourcesDir);
    console.log(`   Contents: ${resourcesContents.join(', ')}`);

    // Check if app.asar.unpacked exists
    const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
    if (fs.existsSync(unpackedDir)) {
      const unpackedContents = fs.readdirSync(unpackedDir);
      console.log(`   app.asar.unpacked contents: ${unpackedContents.join(', ')}`);

      // Check node_modules
      const nodeModulesDir = path.join(unpackedDir, 'node_modules');
      if (fs.existsSync(nodeModulesDir)) {
        const modulesContents = fs.readdirSync(nodeModulesDir);
        console.log(`   node_modules contents: ${modulesContents.slice(0, 10).join(', ')}...`);
      } else {
        console.warn(`   ⚠️  node_modules not found in app.asar.unpacked`);
      }
    } else {
      console.warn(`   ⚠️  app.asar.unpacked not found`);
    }
  } else {
    console.warn(`⚠️  resources directory not found: ${resourcesDir}`);
    return;
  }

  const moduleRoot = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'better-sqlite3');

  if (!fs.existsSync(moduleRoot)) {
    console.warn(`⚠️  better-sqlite3 not found, skipping rebuild`);
    console.warn(`   Expected at: ${moduleRoot}`);
    return;
  }

  console.log(`   ✓ Found better-sqlite3, rebuilding for ${targetArch}...\n`);

  const success = rebuildSingleModule({
    moduleName: 'better-sqlite3',
    moduleRoot,
    platform: electronPlatformName,
    arch: targetArch,
    electronVersion,
    projectRoot: path.resolve(__dirname, '..'),
  });

  if (success) {
    console.log(`   ✓ Rebuild completed`);
  } else {
    console.error(`   ✗ Rebuild failed`);
  }

  const verified = verifyModuleBinary(moduleRoot, 'better-sqlite3');
  if (verified) {
    console.log(`   ✓ Binary verification passed`);
  } else {
    console.error(`   ✗ Binary verification failed`);
  }

  if (!success || !verified) {
    throw new Error(`Failed to rebuild better-sqlite3 for ${electronPlatformName}-${targetArch}`);
  }

  console.log(`\n✅ Native modules rebuilt successfully for ${targetArch}\n`);
};
