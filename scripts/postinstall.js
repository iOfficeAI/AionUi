/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

/**
 * Get the platform-specific Electron path within dist/.
 */
function getElectronPlatformPath() {
  const platform = os.platform();
  if (platform === 'darwin' || platform === 'mas') {
    return 'Electron.app/Contents/MacOS/Electron';
  } else if (platform === 'win32') {
    return 'electron.exe';
  }
  return 'electron';
}

/**
 * Check whether the Electron app bundle is complete.
 * On macOS, the Frameworks/ directory must exist alongside the main binary.
 */
function isElectronBundleComplete(electronDir, platformPath) {
  const binaryPath = path.join(electronDir, 'dist', platformPath);
  if (!fs.existsSync(binaryPath)) return false;

  const platform = os.platform();
  if (platform === 'darwin' || platform === 'mas') {
    const frameworksDir = path.join(
      electronDir,
      'dist',
      'Electron.app',
      'Contents',
      'Frameworks',
    );
    if (!fs.existsSync(frameworksDir)) return false;
  }
  return true;
}

/**
 * Try to re-extract Electron from the @electron/get cache.
 * Returns true if extraction succeeded.
 */
function tryExtractFromCache(electronDir) {
  const version = require(path.join(electronDir, 'package.json')).version;
  const platform = os.platform();
  const arch = process.arch;
  const platformLabel = platform === 'darwin' ? 'darwin' : platform;
  const zipName = `electron-v${version}-${platformLabel}-${arch}.zip`;

  // Check standard electron cache locations
  const cacheLocations = [
    path.join(os.homedir(), 'Library', 'Caches', 'electron'),
    path.join(os.homedir(), '.cache', 'electron'),
    path.join(os.tmpdir(), 'electron-cache'),
  ];

  for (const cacheRoot of cacheLocations) {
    if (!fs.existsSync(cacheRoot)) continue;
    try {
      const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const zipPath = path.join(cacheRoot, entry.name, zipName);
        if (fs.existsSync(zipPath)) {
          console.log('Found cached Electron zip:', zipPath);
          const distPath = path.join(electronDir, 'dist');
          fs.rmSync(distPath, { recursive: true, force: true });
          fs.mkdirSync(distPath, { recursive: true });
          execSync(`unzip -q "${zipPath}" -d "${distPath}"`, { stdio: 'inherit' });
          console.log('Extracted Electron from cache to', distPath);
          return true;
        }
      }
    } catch {
      // Try next cache location
    }
  }
  return false;
}

/**
 * Ensure the Electron binary is properly installed.
 * Bun sometimes skips or incompletely runs electron's postinstall,
 * leaving dist/ present but path.txt missing or the app bundle
 * incomplete — which causes electron-vite to throw "Electron uninstall"
 * or dyld framework errors at dev start.
 */
function ensureElectronBinary() {
  try {
    // Resolve the actual electron package directory (handles Bun's .bun/ structure)
    const electronIndex = require.resolve('electron');
    const electronDir = path.dirname(electronIndex);
    const pathTxt = path.join(electronDir, 'path.txt');
    const platformPath = getElectronPlatformPath();

    // Full check: path.txt exists, points to correct path, and bundle is complete
    if (fs.existsSync(pathTxt)) {
      const storedPath = fs.readFileSync(pathTxt, 'utf-8').trim();
      if (storedPath === platformPath && isElectronBundleComplete(electronDir, platformPath)) {
        console.log('Electron binary verified:', platformPath);
        return;
      }
      console.log('Electron bundle incomplete (path.txt present but bundle damaged), repairing...');
    } else {
      console.log('Electron path.txt missing, repairing...');
    }

    // Step 1: Try running electron's own install script
    const installScript = path.join(electronDir, 'install.js');
    if (fs.existsSync(installScript)) {
      console.log('Running electron/install.js...');
      try {
        execSync(`node "${installScript}"`, { stdio: 'inherit', timeout: 60000 });
      } catch {
        console.log('electron/install.js did not complete, trying cache extraction...');
      }
    }

    // Step 2: Check if install.js fixed it
    if (fs.existsSync(pathTxt) && isElectronBundleComplete(electronDir, platformPath)) {
      console.log('Electron binary restored via install.js');
      return;
    }

    // Step 3: Try extracting from cache (handles incomplete extraction)
    if (tryExtractFromCache(electronDir)) {
      if (isElectronBundleComplete(electronDir, platformPath)) {
        fs.writeFileSync(pathTxt, platformPath);
        console.log('Electron restored from cache, path.txt written:', platformPath);
        return;
      }
    }

    // Step 4: Last resort — if binary exists, just write path.txt
    const binaryPath = path.join(electronDir, 'dist', platformPath);
    if (fs.existsSync(binaryPath)) {
      fs.writeFileSync(pathTxt, platformPath);
      console.log('Electron path.txt repaired manually:', platformPath);
    } else {
      console.warn('WARNING: Electron binary not found. Run:');
      console.warn('  rm -rf node_modules/electron/dist && node node_modules/electron/install.js');
    }
  } catch (e) {
    console.warn('Electron binary check failed:', e.message);
  }
}

function runPostInstall() {
  try {
    // Always verify electron binary first (fixes Bun postinstall skips)
    ensureElectronBinary();

    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      execSync('bunx electron-builder install-app-deps', {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_build_from_source: 'true',
        },
      });
    }
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
