/**
 * prepareHubResources.js
 *
 * Downloads the AionHub index.json and all extension zip packages
 * into resources/hub/ so they are bundled with the app as local fallback.
 *
 * Called during the build pipeline before electron-builder runs.
 *
 * Environment variables:
 *   AIONUI_HUB_TAG    - Git tag to fetch from (default: 'dist-latest')
 *   AIONUI_HUB_SKIP   - Set to '1' to skip hub resource preparation
 *   AIONUI_HUB_UPDATE_LOCK - Set to '1' to explicitly update hub-lock.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HUB_DIR = path.join(PROJECT_ROOT, 'resources', 'hub');
const HUB_LOCK_PATH = path.join(PROJECT_ROOT, 'resources', 'hub-lock.json');

const DEFAULT_TAG = 'dist-latest';
const BASE_URLS = [
  `https://raw.githubusercontent.com/iOfficeAI/AionHub/${process.env.AIONUI_HUB_TAG || DEFAULT_TAG}/`,
  `https://cdn.jsdelivr.net/gh/iOfficeAI/AionHub@${process.env.AIONUI_HUB_TAG || DEFAULT_TAG}/`,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isSafeHubFilename(value) {
  return typeof value === 'string' && /^[\w][\w.-]*\.zip$/.test(value) && !value.includes('..');
}

function readHubLock() {
  if (!fs.existsSync(HUB_LOCK_PATH)) {
    throw new Error('resources/hub-lock.json is missing; run with AIONUI_HUB_UPDATE_LOCK=1 to create it');
  }
  const lock = JSON.parse(fs.readFileSync(HUB_LOCK_PATH, 'utf8'));
  if (lock.schemaVersion !== 1 || lock.tag !== (process.env.AIONUI_HUB_TAG || DEFAULT_TAG)) {
    throw new Error('resources/hub-lock.json schema or tag does not match this build');
  }
  if (!lock.files || typeof lock.files !== 'object' || Array.isArray(lock.files)) {
    throw new Error('resources/hub-lock.json has no valid files map');
  }
  return lock;
}

function verifyHash(filePath, expectedHash, label) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error(`Invalid SHA-256 in hub lock for ${label}`);
  }
  const actualHash = sha256File(filePath);
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 mismatch for ${label}: expected ${expectedHash}, got ${actualHash}`);
  }
}

function verifyHubDirectory(hubDir, lock, requireManifest = true) {
  const indexPath = path.join(hubDir, 'index.json');
  if (!fs.existsSync(indexPath)) throw new Error('Hub index.json is missing');
  verifyHash(indexPath, lock.files['index.json'], 'index.json');

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const extensions = index.extensions || {};
  if (!Object.keys(extensions).length) throw new Error('Hub index contains no extensions');

  const actualZips = new Set(fs.readdirSync(hubDir).filter((name) => name.endsWith('.zip')));
  const expectedEntries = [];
  for (const [name, extension] of Object.entries(extensions)) {
    const file = extension.dist && extension.dist.tarball;
    if (!isSafeHubFilename(file)) throw new Error(`Hub extension ${name} has an invalid tarball path`);
    const lockKey = `extensions/${file}`;
    const zipPath = path.join(hubDir, file);
    if (!fs.existsSync(zipPath)) throw new Error(`Hub extension ${name} is missing ${file}`);
    verifyHash(zipPath, lock.files[lockKey], file);
    actualZips.delete(file);
    expectedEntries.push({ name, file, size: fs.statSync(zipPath).size });
  }

  if (actualZips.size > 0) {
    throw new Error(`Hub directory contains untracked extension archives: ${[...actualZips].join(', ')}`);
  }

  if (requireManifest) {
    const manifestPath = path.join(hubDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('Hub manifest.json is missing');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifestNames = new Set((manifest.extensions || []).map((entry) => entry.name));
    for (const entry of expectedEntries) {
      if (!manifestNames.has(entry.name)) throw new Error(`Hub manifest is missing ${entry.name}`);
    }
  }

  return expectedEntries;
}

function verifyHubResources() {
  return verifyHubDirectory(HUB_DIR, readHubLock());
}

/**
 * Download a URL to a local file path. Tries each base URL in order.
 * Returns the base URL that succeeded.
 */
async function downloadFile(relativePath, destPath) {
  for (const base of BASE_URLS) {
    const url = new URL(relativePath, base).toString();
    try {
      await downloadUrl(url, destPath);
      return url;
    } catch (error) {
      console.warn(`  [hub] Failed from ${url}: ${error.message}`);
    }
  }
  throw new Error(`Failed to download ${relativePath} from all mirrors`);
}

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const get = url.startsWith('https') ? https.get : require('http').get;
      get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function prepareHubResources() {
  if (process.env.AIONUI_HUB_SKIP === '1') {
    console.log('[hub] Skipping hub resource preparation (AIONUI_HUB_SKIP=1)');
    return { skipped: true };
  }

  const tag = process.env.AIONUI_HUB_TAG || DEFAULT_TAG;
  const updateLock = process.env.AIONUI_HUB_UPDATE_LOCK === '1';
  console.log(`[hub] Preparing hub resources from tag: ${tag}`);

  const stagingDir = fs.mkdtempSync(path.join(PROJECT_ROOT, '.hub-download-'));
  let stagedLock = updateLock ? null : readHubLock();

  try {
    // Download into staging first. Existing bundle contents are replaced only after
    // every archive has passed the tracked SHA-256 lock.
    const indexPath = path.join(stagingDir, 'index.json');
    console.log('[hub] Downloading index.json...');
    const indexUrl = await downloadFile('index.json', indexPath);
    console.log(`[hub] index.json downloaded from ${indexUrl}`);

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const extensions = index.extensions || {};
    const names = Object.keys(extensions);

    console.log(`[hub] Found ${names.length} extensions to bundle`);

    for (const name of names) {
      const ext = extensions[name];
      const tarball = ext.dist && ext.dist.tarball;
      if (!isSafeHubFilename(tarball)) throw new Error(`Hub extension ${name} has an invalid tarball path`);
      const zipPath = path.join(stagingDir, tarball);
      await downloadFile(tarball, zipPath);
      console.log(`[hub] ${name} -> ${tarball} downloaded`);
    }

    if (updateLock) {
      const files = { 'index.json': sha256File(indexPath) };
      for (const name of names) {
        const file = extensions[name].dist.tarball;
        files[`extensions/${file}`] = sha256File(path.join(stagingDir, file));
      }
      stagedLock = { schemaVersion: 1, tag, files };
    }

    const results = verifyHubDirectory(stagingDir, stagedLock, false);
    const manifest = {
      tag,
      generatedAt: new Date().toISOString(),
      indexUrl,
      extensions: results,
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    fs.rmSync(HUB_DIR, { recursive: true, force: true });
    fs.renameSync(stagingDir, HUB_DIR);
    if (updateLock) fs.writeFileSync(HUB_LOCK_PATH, `${JSON.stringify(stagedLock, null, 2)}\n`);
    verifyHubResources();

    console.log(`[hub] Done: ${results.length}/${names.length} extensions bundled in resources/hub/`);
    return { skipped: false, count: results.length, total: names.length };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

// Support both direct execution and require() from build-with-builder.js
if (require.main === module) {
  prepareHubResources().catch((err) => {
    console.error('[hub] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { prepareHubResources, verifyHubResources };
