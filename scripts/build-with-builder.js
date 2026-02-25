#!/usr/bin/env node

/**
 * Simplified build script for AionUi
 * Coordinates electron-vite (bundling) and electron-builder (packaging)
 *
 * Features:
 * - Incremental builds: use --skip-vite to skip Vite compilation if out/ exists
 * - Skip native rebuild: use --skip-native to skip native module rebuilding
 * - Packaging only: use --pack-only to skip electron-builder distributable creation
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DMG retry logic for macOS: detects DMG creation failures by checking artifacts
// (.app exists but .dmg missing) and retries only the DMG step using
// electron-builder --prepackaged with the .app path (not the parent directory).
// This preserves full DMG styling (window size, icon positions, background)
// Background: GitHub Actions macos-14 runners occasionally suffer from transient
// "Device not configured" hdiutil errors (electron-builder#8415, actions/runner-images#12323).
const DMG_RETRY_MAX = 3;
const DMG_RETRY_DELAY_SEC = 30;

// Incremental build: hash of source files to detect changes
const INCREMENTAL_CACHE_FILE = 'out/.build-hash';

function computeSourceHash() {
  const hash = crypto.createHash('md5');
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'electron.vite.config.ts',
    'electron-builder.yml',
  ];

  for (const file of filesToHash) {
    const filePath = path.resolve(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      hash.update(file + ':');
      hash.update(content);
    }
  }

  // Add key src directories modification times
  const srcDirs = ['src', 'public'];
  for (const dir of srcDirs) {
    const dirPath = path.resolve(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      const stat = fs.statSync(dirPath);
      hash.update(dir + ':' + stat.mtimeMs);
    }
  }

  return hash.digest('hex');
}

function loadCachedHash() {
  try {
    const cacheFile = path.resolve(__dirname, '..', INCREMENTAL_CACHE_FILE);
    if (fs.existsSync(cacheFile)) {
      return fs.readFileSync(cacheFile, 'utf8').trim();
    }
  } catch {}
  return null;
}

function saveCurrentHash(hash) {
  try {
    const cacheFile = path.resolve(__dirname, '..', INCREMENTAL_CACHE_FILE);
    const viteDir = path.dirname(cacheFile);
    if (!fs.existsSync(viteDir)) {
      fs.mkdirSync(viteDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, hash);
  } catch {}
}

function viteBuildExists() {
  const outDir = path.resolve(__dirname, '../out');
  const mainDir = path.join(outDir, 'main');
  const rendererDir = path.join(outDir, 'renderer');

  return fs.existsSync(path.join(mainDir, 'index.js')) &&
         fs.existsSync(path.join(rendererDir, 'index.html'));
}

function shouldSkipViteBuild(skipViteFlag, forceFlag) {
  if (forceFlag) return false;
  if (skipViteFlag) return true;

  // Auto-detect: skip if build exists and hash matches
  const currentHash = computeSourceHash();
  const cachedHash = loadCachedHash();

  if (cachedHash && currentHash === cachedHash && viteBuildExists()) {
    console.log('📦 Incremental build: Vite output unchanged, skipping compilation');
    return true;
  }

  return false;
}

function cleanupDiskImages() {
  try {
    // Detach all mounted disk images that may block subsequent DMG creation:
    // hdiutil info → grep device paths → force detach each
    const result = spawnSync('sh', ['-c',
      'hdiutil info 2>/dev/null | grep /dev/disk | awk \'{print $1}\' | xargs -I {} hdiutil detach {} -force 2>/dev/null'
    ], { stdio: 'ignore' });
    if (result.status !== 0) {
      console.log(`   ℹ️  Disk image cleanup exit code: ${result.status}`);
    }
    return result.status === 0;
  } catch (error) {
    console.log(`   ℹ️  Disk image cleanup failed: ${error.message}`);
    return false;
  }
}

// Find the .app directory from electron-builder output
function findAppDir(outDir) {
  const candidates = ['mac', 'mac-arm64', 'mac-x64', 'mac-universal'];
  for (const dir of candidates) {
    const fullPath = path.join(outDir, dir);
    if (fs.existsSync(fullPath)) {
      const hasApp = fs.readdirSync(fullPath).some(f => f.endsWith('.app'));
      if (hasApp) return fullPath;
    }
  }
  return null;
}

// Check if DMG exists in output directory
function dmgExists(outDir) {
  try {
    return fs.readdirSync(outDir).some(f => f.endsWith('.dmg'));
  } catch {
    return false;
  }
}

// Create DMG using electron-builder --prepackaged with .app path
// This preserves DMG styling from electron-builder.yml (window size, icon positions, background)
function createDmgWithPrepackaged(appDir, targetArch) {
  const appName = fs.readdirSync(appDir).find(f => f.endsWith('.app'));
  if (!appName) throw new Error(`No .app found in ${appDir}`);
  const appPath = path.join(appDir, appName);

  execSync(
    `bunx electron-builder --mac dmg --${targetArch} --prepackaged "${appPath}" --publish=never`,
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );
}

function buildWithDmgRetry(cmd, targetArch) {
  const isMac = process.platform === 'darwin';
  const outDir = path.resolve(__dirname, '../out');

  try {
    execSync(cmd, { stdio: 'inherit', shell: process.platform === 'win32' });
    return;
  } catch (error) {
    // On non-macOS or if .app doesn't exist, just throw
    const appDir = isMac ? findAppDir(outDir) : null;
    if (!appDir || dmgExists(outDir)) throw error;

    // .app exists but no .dmg → DMG creation failed
    console.log('\n🔄 Build failed during DMG creation (.app exists, .dmg missing)');
    console.log('   Retrying DMG creation with --prepackaged...');

    for (let attempt = 1; attempt <= DMG_RETRY_MAX; attempt++) {
      cleanupDiskImages();
      spawnSync('sleep', [String(DMG_RETRY_DELAY_SEC)]);

      try {
        console.log(`\n📀 DMG retry attempt ${attempt}/${DMG_RETRY_MAX}...`);
        createDmgWithPrepackaged(appDir, targetArch);
        console.log('✅ DMG created successfully on retry');
        return;
      } catch (retryError) {
        console.log(`   ⚠️  DMG retry ${attempt}/${DMG_RETRY_MAX} failed`);
        cleanupDiskImages();
        if (attempt === DMG_RETRY_MAX) {
          console.log(`   ❌ DMG creation failed after ${DMG_RETRY_MAX} retries`);
          throw retryError;
        }
      }
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const archList = ['x64', 'arm64', 'ia32', 'armv7l'];

// Check for special flags
const skipVite = args.includes('--skip-vite');
const skipNative = args.includes('--skip-native');
const packOnly = args.includes('--pack-only');
const forceBuild = args.includes('--force');

const builderArgs = args
  .filter(arg => {
    // Filter out 'auto', architecture flags, and special flags
    if (arg === 'auto') return false;
    if (arg === '--skip-vite' || arg === '--skip-native' || arg === '--pack-only' || arg === '--force') return false;
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
if (skipVite) console.log('⚡ --skip-vite: Will skip Vite compilation if output exists');
if (skipNative) console.log('⚡ --skip-native: Will skip native module rebuilding');
if (packOnly) console.log('⚡ --pack-only: Will skip electron-builder distributable creation');
if (forceBuild) console.log('⚡ --force: Force full rebuild');

const packageJsonPath = path.resolve(__dirname, '../package.json');

try {
  // 1. Ensure package.json main entry is correct for electron-vite
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.main !== './out/main/index.js') {
    packageJson.main = './out/main/index.js';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  // 2. Check if we can skip Vite build (incremental build)
  const skipViteBuild = shouldSkipViteBuild(skipVite, forceBuild);

  if (!skipViteBuild) {
    // Run electron-vite to build all bundles (main + preload + renderer)
    console.log(`📦 Building ${targetArch}...`);
    execSync(`bunx electron-vite build`, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ELECTRON_BUILDER_ARCH: targetArch,
      }
    });

    // Save hash after successful build
    saveCurrentHash(computeSourceHash());
  } else {
    console.log('📦 Using cached Vite build output');
  }

  // 3. Verify electron-vite output
  const outDir = path.resolve(__dirname, '../out');
  if (!fs.existsSync(outDir)) {
    throw new Error('electron-vite did not generate out/ directory');
  }

  // 4. Validate output structure
  const mainIndex = path.join(outDir, 'main', 'index.js');
  const rendererIndex = path.join(outDir, 'renderer', 'index.html');

  if (!fs.existsSync(mainIndex)) {
    throw new Error('Missing main entry: out/main/index.js');
  }

  if (!fs.existsSync(rendererIndex)) {
    throw new Error('Missing renderer entry: out/renderer/index.html');
  }

  // If --pack-only, skip electron-builder distributable creation
  if (packOnly) {
    console.log('✅ Package completed! (skipped distributable creation)');
    return;
  }

  // 5. 运行 electron-builder 生成分发包（DMG/ZIP/EXE等）
  // Run electron-builder to create distributables (DMG/ZIP/EXE, etc.)
  // Always disable auto-publish to avoid electron-builder's implicit tag-based publishing
  // Publishing is handled by a separate release job in CI
  const publishArg = '--publish=never';

  // Set compression level based on environment
  // 7za -mx accepts numeric values: 0 (store) to 9 (ultra)
  // CI builds use 9 (maximum) for smallest size
  // Local builds use 7 (normal) for 30-50% faster ASAR packing
  const isCI = process.env.CI === 'true';
  if (!process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL) {
    process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = isCI ? '9' : '7';
  }
  console.log(`📦 Compression level: ${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL} (${isCI ? 'CI build' : 'local build'})`);

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

  buildWithDmgRetry(`bunx electron-builder ${builderArgs} ${archFlag} ${publishArg}`, targetArch);

  console.log('✅ Build completed!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
