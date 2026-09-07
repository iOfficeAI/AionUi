const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inputHash(root, inputs, context = {}) {
  const files = new Set();
  function visit(relative) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).toSorted()) {
        if (['node_modules', 'out', '.git'].includes(name)) continue;
        visit(path.join(relative, name));
      }
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      files.add(relative);
    }
  }
  inputs.forEach(visit);
  const hash = crypto.createHash('sha256').update(JSON.stringify(context));
  for (const file of [...files].toSorted()) {
    hash.update(JSON.stringify([file.replace(/\\/g, '/'), sha256(path.join(root, file))]));
  }
  return hash.digest('hex');
}

function outputsMatch(manifestPath, key, outputs) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return (
      manifest.schema === 2 &&
      manifest.key === key &&
      outputs.every(
        (file) => manifest.outputs[path.relative(path.dirname(manifestPath), file).replace(/\\/g, '/')] === sha256(file)
      )
    );
  } catch {
    return false;
  }
}

function saveOutputs(manifestPath, key, outputs) {
  const manifest = {
    schema: 2,
    key,
    outputs: Object.fromEntries(
      outputs.map((file) => [path.relative(path.dirname(manifestPath), file).replace(/\\/g, '/'), sha256(file)])
    ),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const temporary = `${manifestPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(manifest));
    fs.renameSync(temporary, manifestPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// This cache owns only its v1 directory. A full/busy cache stops admitting new
// files; it never evicts another build's files. All reads verify content.
function cacheEntry(cacheDir, source) {
  return path.join(cacheDir, crypto.createHash('sha256').update(source).digest('hex'));
}

function restoreDownload(cacheDir, source, destination, expectedSha256) {
  try {
    const entry = cacheEntry(cacheDir, source);
    const manifest = JSON.parse(fs.readFileSync(path.join(entry, 'manifest.json'), 'utf8'));
    const file = path.join(entry, 'content');
    if (manifest.source !== source || sha256(file) !== manifest.sha256) return false;
    if (expectedSha256 && manifest.sha256 !== expectedSha256) return false;
    fs.copyFileSync(file, destination);
    return sha256(destination) === manifest.sha256;
  } catch {
    return false;
  }
}

function saveDownload(cacheDir, source, file, maxBytes = 512 * 1024 * 1024) {
  let lock;
  let temporary;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    lock = fs.openSync(path.join(cacheDir, '.write-lock'), 'wx');
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const used = entries.reduce((sum, entry) => {
      const content = path.join(cacheDir, entry.name, 'content');
      return sum + (fs.existsSync(content) ? fs.statSync(content).size : 0);
    }, 0);
    if (entries.length >= 256 || used + fs.statSync(file).size > maxBytes) return false;
    temporary = fs.mkdtempSync(path.join(cacheDir, '.pending-'));
    fs.copyFileSync(file, path.join(temporary, 'content'));
    fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify({ source, sha256: sha256(file) }));
    const entry = cacheEntry(cacheDir, source);
    // A corrupt entry may be replaced; a concurrent reader treats its absence as a miss.
    fs.rmSync(entry, { recursive: true, force: true });
    fs.renameSync(temporary, entry);
    return true;
  } catch {
    // Cache availability must not decide whether an otherwise valid build works.
    return false;
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.rmSync(path.join(cacheDir, '.write-lock'), { force: true });
    }
  }
}

function timed(stage, action, details = {}) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  let status = 'failed';
  try {
    const result = action();
    status = 'ok';
    return result;
  } finally {
    const record = JSON.stringify({
      stage,
      status,
      startedAt,
      elapsedMs: Math.round(performance.now() - start),
      ...details,
    });
    console.log(`[build-stage] ${record}`);
    if (process.env.BUILD_STAGE_REPORT) {
      try {
        fs.appendFileSync(process.env.BUILD_STAGE_REPORT, `${record}\n`);
      } catch {
        console.warn('[build-stage] Could not persist stage evidence; console evidence is still available');
      }
    }
  }
}

module.exports = { sha256, inputHash, outputsMatch, saveOutputs, restoreDownload, saveDownload, timed };
