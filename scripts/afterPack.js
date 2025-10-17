const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Ensure architecture-specific native modules (better-sqlite3) are rebuilt for Linux bundles.
 * This runs after electron-builder finishes packaging each target architecture.
 */
module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'linux') {
    return;
  }

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
    console.warn(`[afterPack] better-sqlite3 module not found at ${moduleRoot}`);
    return;
  }

  const env = {
    ...process.env,
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_platform: 'linux',
    npm_config_target_platform: 'linux',
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'false',
  };

  const runPrebuildInstall = () => {
    execFileSync(
      'npx',
      [
        '--yes',
        'prebuild-install',
        '--runtime=electron',
        `--target=${electronVersion}`,
        '--platform=linux',
        `--arch=${arch}`,
        '--force',
      ],
      {
        cwd: moduleRoot,
        env,
        stdio: 'inherit',
      }
    );
  };

  const runElectronRebuild = () => {
    execFileSync(
      'npx',
      [
        '--yes',
        'electron-rebuild',
        '--only',
        'better-sqlite3',
        '--force',
        '--platform=linux',
        `--arch=${arch}`,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...env,
          npm_config_build_from_source: 'true',
        },
        stdio: 'inherit',
      }
    );
  };

  try {
    console.log(`[afterPack] Downloading prebuilt better-sqlite3 for linux-${arch}`);
    runPrebuildInstall();
  } catch (error) {
    console.warn('[afterPack] prebuild-install failed, attempting local rebuild...', error.message);
    runElectronRebuild();
  }

  const binaryPath = path.join(moduleRoot, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`[afterPack] Failed to produce better_sqlite3.node for linux-${arch}`);
  }

  // Keep `.webpack` native_modules in sync for runtime lookups
  const webpackRoot = path.join(appOutDir, 'resources', '.webpack');
  const candidateDirs = [
    path.join(webpackRoot, 'main', 'native_modules', 'build', 'Release'),
    path.join(webpackRoot, arch, 'main', 'native_modules', 'build', 'Release'),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(binaryPath, path.join(dir, 'better_sqlite3.node'));
    }
  }

  console.log(`[afterPack] better-sqlite3 prepared for linux-${arch}`);
};
