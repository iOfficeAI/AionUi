#!/usr/bin/env node

/**
 * beforeBuild hook for electron-builder
 * Selectively rebuilds native modules for target architecture
 *
 * Windows:
 *   - bcrypt, better-sqlite3: Rebuild for target arch (x64/arm64)
 *   - node-pty: SKIP (uses prebuilt from @lydell/node-pty-*, cross-compilation fails)
 *
 * macOS/Linux:
 *   - bcrypt, better-sqlite3, node-pty: Rebuild for target arch
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async function (context) {
  const { electronVersion, platform, arch, appDir } = context;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 beforeBuild hook executing`);
  console.log(`   Platform: ${platform.name}`);
  console.log(`   Architecture: ${arch}`);
  console.log(`   Electron: ${electronVersion}`);
  console.log(`   App Directory: ${appDir}`);
  console.log(`${'='.repeat(60)}\n`);

  // List of modules that need to be rebuilt
  // Windows: Skip node-pty (uses prebuilt binaries, cross-compilation fails)
  // macOS/Linux: Include node-pty (may need rebuild)
  const modulesToRebuild = platform.name === 'windows'
    ? ['better-sqlite3', 'bcrypt']
    : ['better-sqlite3', 'bcrypt', 'node-pty'];

  // Map electron-builder arch names to npm arch names
  const archMap = {
    'x64': 'x64',
    'arm64': 'arm64',
    'ia32': 'ia32',
    'armv7l': 'arm',
  };

  const targetArch = archMap[arch] || arch;

  console.log(`📦 Target architecture: ${targetArch}`);
  console.log(`📦 Modules to rebuild: ${modulesToRebuild.join(', ')}\n`);

  try {
    const rebuildCmd = `npx electron-rebuild --only ${modulesToRebuild.join(',')} --force --arch ${targetArch} --electron-version ${electronVersion}`;

    // Set environment variables for cross-compilation
    const env = {
      ...process.env,
      npm_config_arch: targetArch,
      npm_config_target_arch: targetArch,
      npm_config_build_from_source: 'true',
      npm_config_runtime: 'electron',
      npm_config_disturl: 'https://electronjs.org/headers',
      npm_config_target: electronVersion,
    };

    // Windows-specific environment
    if (platform.name === 'windows') {
      env.MSVS_VERSION = '2022';
      env.GYP_MSVS_VERSION = '2022';
      env.WindowsTargetPlatformVersion = '10.0.19041.0';
      env._WIN32_WINNT = '0x0A00';
      console.log(`🔧 Windows build environment:`);
      console.log(`   MSVS_VERSION: ${env.MSVS_VERSION}`);
      console.log(`   WindowsTargetPlatformVersion: ${env.WindowsTargetPlatformVersion}\n`);
    }

    console.log(`🔨 Executing rebuild command:`);
    console.log(`   ${rebuildCmd}\n`);

    execSync(rebuildCmd, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      env,
    });

    console.log(`\n✅ Successfully rebuilt native modules for ${targetArch}`);
    console.log(`${'='.repeat(60)}\n`);

    // Return false to prevent electron-builder from running its default rebuild
    // We've already rebuilt the necessary modules ourselves
    return false;
  } catch (error) {
    console.error(`\n❌ Failed to rebuild native modules for ${targetArch}`);
    console.error(`   Error: ${error.message}`);
    console.error(`${'='.repeat(60)}\n`);
    throw error;
  }
};
