const { execFileSync } = require('child_process');
const { Arch } = require('builder-util');
const fs = require('fs');
const path = require('path');

/**
 * Ensure architecture-specific native modules (better-sqlite3) are rebuilt for Linux bundles.
 * This runs after electron-builder finishes packaging each target architecture.
 */
const resolveArch = (input) => {
  let archValue = input;

  if (typeof archValue === 'string') {
    if (Arch[archValue] !== undefined) {
      return archValue;
    }
    const numeric = Number(archValue);
    if (!Number.isNaN(numeric)) {
      archValue = numeric;
    } else {
      return archValue;
    }
  }

  const enumValue = Arch[archValue];
  if (typeof enumValue === 'string') {
    return enumValue;
  }
  switch (archValue) {
    case Arch.x64:
      return 'x64';
    case Arch.arm64:
      return 'arm64';
    case Arch.armv7l:
      return 'armv7l';
    case Arch.ia32:
      return 'ia32';
    default:
      return process.arch;
  }
};

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = resolveArch(arch);

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
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
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
        `--arch=${targetArch}`,
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
        `--arch=${targetArch}`,
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
    console.log(`[afterPack] Downloading prebuilt better-sqlite3 for linux-${targetArch}`);
    runPrebuildInstall();
  } catch (error) {
    console.warn('[afterPack] prebuild-install failed, attempting local rebuild...', error.message);
    runElectronRebuild();
  }

  const binaryPath = path.join(moduleRoot, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`[afterPack] Failed to produce better_sqlite3.node for linux-${targetArch}`);
  }

  // Keep `.webpack` native_modules in sync for runtime lookups
  const webpackRoot = path.join(appOutDir, 'resources', '.webpack');
  const asarWebpackRoot = path.join(appOutDir, 'resources', 'app.asar.unpacked', '.webpack');
  const relativeTargets = new Set(['main/native_modules/build/Release']);

  if (fs.existsSync(webpackRoot)) {
    for (const entry of fs.readdirSync(webpackRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      relativeTargets.add(`${entry.name}/main/native_modules/build/Release`);
    }
  }

  for (const rel of relativeTargets) {
    const sourceDir = path.join(webpackRoot, rel);
    const destDir = path.join(asarWebpackRoot, rel);

    if (fs.existsSync(path.dirname(sourceDir))) {
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.copyFileSync(binaryPath, path.join(sourceDir, 'better_sqlite3.node'));
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(binaryPath, path.join(destDir, 'better_sqlite3.node'));
  }

  console.log(`[afterPack] better-sqlite3 prepared for linux-${targetArch}`);
};
