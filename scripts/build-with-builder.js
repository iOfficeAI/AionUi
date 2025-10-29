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
const archList = ['x64', 'arm64', 'ia32', 'armv7l'];
const builderArgs = args
  .filter(arg => {
    // Filter out 'auto' and architecture flags (both --x64 and x64 formats)
    if (arg === 'auto') return false;
    if (archList.includes(arg)) return false;
    if (arg.startsWith('--') && archList.includes(arg.slice(2))) return false;
    return true;
  })
  .join(' ');

// Get target architecture from electron-builder.yml
function getTargetArchFromConfig(platform) {
  try {
    const configPath = path.resolve(__dirname, '../electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf8');

    const platformRegex = new RegExp(`^${platform}:\\s*$`, 'm');
    const platformMatch = content.match(platformRegex);
    if (!platformMatch) return null;

    const platformStartIndex = platformMatch.index;
    const afterPlatform = content.slice(platformStartIndex + platformMatch[0].length);
    const nextPlatformMatch = afterPlatform.match(/^[a-zA-Z][a-zA-Z0-9]*:/m);
    const platformBlock = nextPlatformMatch
      ? content.slice(platformStartIndex, platformStartIndex + platformMatch[0].length + nextPlatformMatch.index)
      : content.slice(platformStartIndex);

    const archMatch = platformBlock.match(/arch:\s*\[\s*([a-z0-9_]+)/i);
    return archMatch ? archMatch[1].trim() : null;
  } catch (error) {
    return null;
  }
}

// Determine target architecture
const buildMachineArch = process.arch;
let targetArch;
let multiArch = false;

// Check if multiple architectures are specified (support both --x64 and x64 formats)
const rawArchArgs = args
  .filter(arg => {
    if (archList.includes(arg)) return true;
    if (arg.startsWith('--') && archList.includes(arg.slice(2))) return true;
    return false;
  })
  .map(arg => arg.startsWith('--') ? arg.slice(2) : arg);

// Remove duplicates to avoid treating "x64 --x64" as multiple architectures
const archArgs = [...new Set(rawArchArgs)];

if (archArgs.length > 1) {
  // Multiple unique architectures specified - let electron-builder handle it
  multiArch = true;
  targetArch = archArgs[0]; // Use first arch for webpack build
  console.log(`🔨 Multi-architecture build detected: ${archArgs.join(', ')}`);
} else if (args[0] === 'auto') {
  // Auto mode: detect from electron-builder.yml
  let detectedPlatform = null;
  if (builderArgs.includes('--linux')) detectedPlatform = 'linux';
  else if (builderArgs.includes('--mac')) detectedPlatform = 'mac';
  else if (builderArgs.includes('--win')) detectedPlatform = 'win';

  const configArch = detectedPlatform ? getTargetArchFromConfig(detectedPlatform) : null;
  targetArch = configArch || buildMachineArch;
} else {
  // Explicit architecture or default to build machine
  targetArch = archArgs[0] || buildMachineArch;
}

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

  // 2. Run Forge to build webpack bundles with explicit architecture
  console.log(`📦 Building ${targetArch}...`);
  // Use cross-platform command: npm exec works on both Unix and Windows
  execSync(`npm exec electron-forge -- package --arch=${targetArch}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_BUILDER_ARCH: targetArch,
      FORGE_SKIP_NATIVE_REBUILD: 'false'  // Ensure native modules are rebuilt during packaging
    }
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

  // 5. 运行 electron-builder 生成分发包（DMG/ZIP/EXE等）
  // Run electron-builder to create distributables (DMG/ZIP/EXE, etc.)
  const isRelease = process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/v');
  const publishArg = isRelease ? '' : '--publish=never';

  // 根据模式添加架构标志
  // Add arch flags based on mode
  let archFlag = '';
  if (multiArch) {
    // 多架构模式：将所有架构标志传递给 electron-builder
    // Multi-arch mode: pass all arch flags to electron-builder
    archFlag = archArgs.map(arch => `--${arch}`).join(' ');
    console.log(`🚀 Packaging for multiple architectures: ${archArgs.join(', ')}...`);
  } else {
    // 单架构模式：使用确定的目标架构
    // Single arch mode: use the determined target arch
    archFlag = `--${targetArch}`;
    console.log(`🚀 Creating distributables for ${targetArch}...`);
  }

  execSync(`npx electron-builder ${builderArgs} ${archFlag} ${publishArg}`, { stdio: 'inherit' });

  console.log('✅ Build completed!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
