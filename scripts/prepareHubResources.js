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
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const crypto = require('node:crypto');
const { pipeline } = require('stream');
const { sha256, restoreDownload, saveDownload } = require('../packages/shared-scripts/src/build-cache');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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

function parseIntegrity(value) {
  if (!value) return null;
  // Keep the legacy hex form and support the SHA512 SRI used by the published Hub index.
  if (/^sha256-[a-fA-F0-9]{64}$/.test(value))
    return { algorithm: 'sha256', hex: value.slice(7).toLowerCase(), legacyContent: true };
  const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (match) {
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === (match[1] === 'sha256' ? 32 : 64) && bytes.toString('base64') === match[2])
      return { algorithm: match[1], hex: bytes.toString('hex') };
  }
  throw new Error('Unsupported Hub integrity format');
}

// Hub v1 publisher: iOfficeAI/AionHub/.github/scripts/build-extensions.js
// Its legacy hex digest covers sorted (relative path, uncompressed bytes) pairs.
// Read entries in memory without extracting untrusted archive paths to disk.
function hashHubContent(zipPath) {
  return new Promise((resolve, reject) => {
    require('yauzl').open(zipPath, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      let totalSize = 0;
      const fail = (error) => {
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('entry', (entry) => {
        const name = entry.fileName;
        if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000 || files.has(name)) {
          return fail(new Error('Unsafe Hub archive entry'));
        }
        if (name.endsWith('/')) return zip.readEntry();
        totalSize += entry.uncompressedSize;
        if (totalSize > 32 * 1024 * 1024) return fail(new Error('Hub content exceeds verification limit'));
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            files.set(name, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        const hash = crypto.createHash('sha256');
        for (const name of [...files.keys()].sort()) {
          hash.update(name);
          hash.update(files.get(name));
        }
        resolve(hash.digest('hex'));
      });
      zip.readEntry();
    });
  });
}

async function verifyIntegrity(zipPath, expected) {
  if (!expected) return;
  if (crypto.createHash(expected.algorithm).update(fs.readFileSync(zipPath)).digest('hex') === expected.hex) return;
  if (expected.legacyContent && (await hashHubContent(zipPath)) === expected.hex) return;
  throw new Error('Hub archive integrity mismatch');
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
          res.resume();
          follow(new URL(res.headers.location, url).toString(), redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        pipeline(res, file, (error) => {
          if (error) {
            fs.rmSync(destPath, { force: true });
            reject(error);
          } else {
            resolve();
          }
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function prepareHubResources({
  root = PROJECT_ROOT,
  download = downloadFile,
  cacheDir = path.join(os.homedir(), '.cache', 'aionui-build', 'hub-v1'),
} = {}) {
  if (process.env.AIONUI_HUB_SKIP === '1') {
    console.log('[hub] Skipping hub resource preparation (AIONUI_HUB_SKIP=1)');
    return { skipped: true };
  }
  const tag = process.env.AIONUI_HUB_TAG || DEFAULT_TAG;
  const hubDir = path.join(root, 'resources', 'hub');
  ensureDir(path.dirname(hubDir));
  const staging = fs.mkdtempSync(path.join(path.dirname(hubDir), '.hub-'));
  const indexPath = path.join(staging, 'index.json');
  const indexSource = `https://raw.githubusercontent.com/iOfficeAI/AionHub/${tag}/index.json`;
  let offline = false;
  try {
    let indexUrl;
    try {
      indexUrl = await download('index.json', indexPath);
    } catch (error) {
      if (!restoreDownload(cacheDir, indexSource, indexPath)) throw error;
      offline = true;
      indexUrl = indexSource;
      console.log('[hub-cache] offline: using last complete cached index');
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const extensions = Object.entries(index.extensions || {});
    const results = [];
    const filenames = new Set();
    for (const [name, ext] of extensions) {
      const tarball = ext.dist?.tarball;
      if (!tarball) continue;
      const filename = path.basename(tarball);
      if (filenames.has(filename)) throw new Error(`Duplicate Hub archive filename: ${filename}`);
      filenames.add(filename);
      const zipPath = path.join(staging, filename);
      const integrity = ext.dist?.integrity || '';
      // No checksum means no reuse: a mutable tag or URL alone is not a content identity.
      const source = `${indexSource}#${tarball}#${integrity}`;
      try {
        const expected = parseIntegrity(integrity);
        const cached =
          expected &&
          restoreDownload(
            cacheDir,
            source,
            zipPath,
            expected.algorithm === 'sha256' && !expected.legacyContent ? expected.hex : undefined
          );
        if (offline && !cached) throw new Error('Incomplete offline Hub cache');
        const url = cached ? new URL(tarball, indexSource).toString() : await download(tarball, zipPath);
        const digest = sha256(zipPath);
        await verifyIntegrity(zipPath, expected);
        if (expected && !cached) saveDownload(cacheDir, source, zipPath);
        results.push({ name, file: filename, size: fs.statSync(zipPath).size, url, sha256: digest });
        console.log(`[hub-cache] ${cached ? 'hit' : 'miss'}: ${name}`);
      } catch (error) {
        fs.rmSync(zipPath, { force: true });
        if (offline) throw error;
        console.error(`[hub] Failed to download ${name}: ${error.message}`);
      }
    }
    const complete = results.length === extensions.length;
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify(
        {
          tag,
          generatedAt: new Date().toISOString(),
          indexUrl,
          indexSha256: sha256(indexPath),
          complete,
          extensions: results,
        },
        null,
        2
      ) + '\n'
    );
    if (complete && results.every((entry) => extensions.find(([name]) => name === entry.name)[1].dist?.integrity)) {
      saveDownload(cacheDir, indexSource, indexPath);
    }
    // Keep the previous resource set on a partial refresh. The existing
    // non-fatal online extension policy is retained, and reported explicitly.
    if (!complete && fs.existsSync(hubDir)) {
      console.warn('[hub] Partial refresh; preserving previous resources (not a cache success)');
      return { skipped: false, count: results.length, total: extensions.length, complete, published: false };
    }
    const backup = `${staging}-previous`;
    if (fs.existsSync(hubDir)) fs.renameSync(hubDir, backup);
    try {
      fs.renameSync(staging, hubDir);
    } catch (error) {
      if (fs.existsSync(backup)) fs.renameSync(backup, hubDir);
      throw error;
    }
    fs.rmSync(backup, { recursive: true, force: true });
    return { skipped: false, count: results.length, total: extensions.length, complete, published: true };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Support both direct execution and require() from build-with-builder.js
if (require.main === module) {
  prepareHubResources().catch((err) => {
    console.error('[hub] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { prepareHubResources };
