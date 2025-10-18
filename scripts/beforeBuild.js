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
  const { electronVersion, platform, arch } = context;

  console.log(`🔧 beforeBuild: platform=${platform.name}, arch=${arch}, electron=${electronVersion}`);

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

  console.log(`📦 Rebuilding native modules for ${targetArch}: ${modulesToRebuild.join(', ')}`);

  try {
    const rebuildCmd = `npx electron-rebuild --only ${modulesToRebuild.join(',')} --force --arch ${targetArch}`;

    // Set environment variables for cross-compilation
    const env = {
      ...process.env,
      npm_config_arch: targetArch,
      npm_config_target_arch: targetArch,
      npm_config_build_from_source: 'true',
      npm_config_runtime: 'electron',
      npm_config_disturl: 'https://electronjs.org/headers',
    };

    // Windows-specific environment
    if (platform.name === 'windows') {
      env.MSVS_VERSION = '2022';
      env.GYP_MSVS_VERSION = '2022';
      env.WindowsTargetPlatformVersion = '10.0.19041.0';
      env._WIN32_WINNT = '0x0A00';
    }

    console.log(`🔨 Executing: ${rebuildCmd}`);
    execSync(rebuildCmd, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      env,
    });

    console.log(`✅ Successfully rebuilt modules for ${targetArch}`);
  } catch (error) {
    console.error(`❌ Failed to rebuild native modules:`, error.message);
    throw error;
  }
};
