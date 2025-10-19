/**
 * Unified native module rebuild utility
 * Handles rebuilding native modules for different platforms and architectures
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Normalize architecture names
 */
function normalizeArch(arch) {
  const archMap = {
    'x64': 'x64',
    'arm64': 'arm64',
    'ia32': 'ia32',
    'armv7l': 'arm',
  };
  return archMap[arch] || arch;
}

/**
 * Get modules to rebuild based on platform
 */
function getModulesToRebuild(platform) {
  // Windows: Skip node-pty (uses prebuilt binaries, cross-compilation fails)
  // macOS/Linux: Include node-pty
  return platform === 'win32' || platform === 'windows'
    ? ['better-sqlite3', 'bcrypt']
    : ['better-sqlite3', 'bcrypt', 'node-pty'];
}

/**
 * Build environment variables for native module compilation
 */
function buildEnvironment(platform, targetArch, electronVersion) {
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
  if (platform === 'win32' || platform === 'windows') {
    env.MSVS_VERSION = '2022';
    env.GYP_MSVS_VERSION = '2022';
    env.WindowsTargetPlatformVersion = '10.0.19041.0';
    env._WIN32_WINNT = '0x0A00';
  }

  return env;
}

/**
 * Rebuild native modules using electron-rebuild
 *
 * @param {Object} options
 * @param {string} options.platform - Platform name (win32, darwin, linux)
 * @param {string} options.arch - Target architecture (x64, arm64, etc.)
 * @param {string} options.electronVersion - Electron version
 * @param {string} options.cwd - Working directory (default: project root)
 * @param {string[]} [options.modules] - Modules to rebuild (default: auto-detect by platform)
 */
function rebuildWithElectronRebuild(options) {
  const {
    platform,
    arch,
    electronVersion,
    cwd = path.resolve(__dirname, '..'),
    modules = getModulesToRebuild(platform),
  } = options;

  const targetArch = normalizeArch(arch);
  const env = buildEnvironment(platform, targetArch, electronVersion);

  const rebuildCmd = `npx electron-rebuild --only ${modules.join(',')} --force --arch ${targetArch} --electron-version ${electronVersion}`;

  execSync(rebuildCmd, {
    stdio: 'inherit',
    cwd,
    env,
  });
}

/**
 * Rebuild a single module using prebuild-install (faster for prebuilt binaries)
 * Falls back to electron-rebuild if prebuild-install fails
 *
 * @param {Object} options
 * @param {string} options.moduleName - Module name (e.g., 'better-sqlite3')
 * @param {string} options.moduleRoot - Path to module directory
 * @param {string} options.platform - Platform name
 * @param {string} options.arch - Target architecture
 * @param {string} options.electronVersion - Electron version
 * @param {string} [options.projectRoot] - Project root for fallback rebuild
 */
function rebuildSingleModule(options) {
  const {
    moduleName,
    moduleRoot,
    platform,
    arch,
    electronVersion,
    projectRoot = path.resolve(__dirname, '..'),
  } = options;

  const targetArch = normalizeArch(arch);
  const env = buildEnvironment(platform, targetArch, electronVersion);
  env.npm_config_platform = platform;
  env.npm_config_target_platform = platform;

  // Try prebuild-install first (faster)
  try {
    env.npm_config_build_from_source = 'false';
    execFileSync(
      'npx',
      [
        '--yes',
        'prebuild-install',
        '--runtime=electron',
        `--target=${electronVersion}`,
        `--platform=${platform}`,
        `--arch=${targetArch}`,
        '--force',
      ],
      {
        cwd: moduleRoot,
        env,
        stdio: 'pipe', // Suppress output
      }
    );
    return true;
  } catch (error) {
    // Silently fall back to rebuild
  }

  // Fall back to electron-rebuild
  try {
    env.npm_config_build_from_source = 'true';
    execFileSync(
      'npx',
      [
        '--yes',
        'electron-rebuild',
        '--only',
        moduleName,
        '--force',
        `--platform=${platform}`,
        `--arch=${targetArch}`,
      ],
      {
        cwd: projectRoot,
        env,
        stdio: 'inherit',
      }
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to rebuild ${moduleName}:`, error.message);
    return false;
  }
}

/**
 * Verify native module binary exists
 */
function verifyModuleBinary(moduleRoot, moduleName) {
  const binaryPaths = {
    'better-sqlite3': path.join(moduleRoot, 'build', 'Release', 'better_sqlite3.node'),
    'bcrypt': path.join(moduleRoot, 'lib', 'binding', 'napi-v3', 'bcrypt_lib.node'),
    'node-pty': path.join(moduleRoot, 'build', 'Release', 'pty.node'),
  };

  const binaryPath = binaryPaths[moduleName];
  return binaryPath && fs.existsSync(binaryPath);
}

module.exports = {
  normalizeArch,
  getModulesToRebuild,
  buildEnvironment,
  rebuildWithElectronRebuild,
  rebuildSingleModule,
  verifyModuleBinary,
};
