#!/usr/bin/env node

/**
 * Simplified build script for AionUi
 * Coordinates Electron Forge (webpack) and electron-builder (packaging)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const builderArgs = args.join(' ');

// Determine target architecture
const buildMachineArch = process.arch;
const targetArch = args.find(arg => ['x64', 'arm64', 'ia32', 'armv7l'].includes(arg)) || buildMachineArch;

console.log(`🔨 Building for architecture: ${targetArch}`);
console.log(`📋 Builder arguments: ${builderArgs || '(none)'}`);

const packageJsonPath = path.resolve(__dirname, '../package.json');

try {
  // 1. Ensure package.json main entry is correct for Forge
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.main !== '.webpack/main') {
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  // 2. Run Forge to build webpack bundles
  console.log(`📦 Building ${targetArch}...`);
  execSync('npm run package', {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_BUILDER_ARCH: targetArch }
  });

  // 3. Verify Forge output
  const webpackDir = path.resolve(__dirname, '../.webpack');
  if (!fs.existsSync(webpackDir)) {
    throw new Error('Forge did not generate .webpack directory');
  }

  // Find the architecture-specific output or use default
  const possibleDirs = [
    path.join(webpackDir, targetArch),
    path.join(webpackDir, buildMachineArch),
    webpackDir
  ];

  let sourceDir = webpackDir;
  for (const dir of possibleDirs) {
    if (fs.existsSync(path.join(dir, 'main'))) {
      sourceDir = dir;
      break;
    }
  }

  // 4. Ensure required directories exist for electron-builder
  const ensureDir = (srcDir, destDir, name) => {
    const src = path.join(srcDir, name);
    const dest = path.join(webpackDir, name);

    if (fs.existsSync(src) && src !== dest) {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }

      if (process.platform === 'win32') {
        execSync(`xcopy "${src}" "${dest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
      } else {
        execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
      }
    }
  };

  ensureDir(sourceDir, webpackDir, 'main');
  ensureDir(sourceDir, webpackDir, 'renderer');
  if (sourceDir !== webpackDir && fs.existsSync(path.join(sourceDir, 'native_modules'))) {
    ensureDir(sourceDir, webpackDir, 'native_modules');
  }

  // 5. Run electron-builder
  const isRelease = process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/v');
  const publishArg = isRelease ? '' : '--publish=never';

  console.log(`🚀 Packaging...`);
  execSync(`npx electron-builder ${builderArgs} ${publishArg}`, { stdio: 'inherit' });

  console.log('✅ Build completed!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
