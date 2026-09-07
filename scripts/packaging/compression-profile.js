const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const { sha256 } = require('../../packages/shared-scripts/src/build-cache');

function contentDigest(root) {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    const file = path.join(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) hash.update(JSON.stringify([relative, 'link', fs.readlinkSync(file)]));
    else if (stat.isDirectory())
      fs.readdirSync(file)
        .sort()
        .forEach((name) => visit(path.join(relative, name)));
    else hash.update(JSON.stringify([relative.replace(/\\/g, '/'), sha256(file)]));
  }
  visit('');
  return hash.digest('hex');
}

function compareCompression({ prepackaged, destination, command, execute = execSync }) {
  if (!command.includes('--publish=never')) throw new Error('Compression comparison must disable publishing');
  const before = contentDigest(prepackaged);
  const samples = [];
  for (const level of [7, 9]) {
    const output = path.join(destination, `level-${level}`);
    if (fs.existsSync(output)) throw new Error('Comparison output already exists; use a fresh destination');
    const start = performance.now();
    execute(`${command} --prepackaged "${prepackaged}" --config.directories.output="${output}"`, {
      stdio: 'inherit',
      timeout: 1200000,
      env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: String(level) },
    });
    const elapsedMs = Math.round(performance.now() - start);
    const installers = fs.readdirSync(output).filter((name) => name.endsWith('.exe'));
    if (installers.length !== 1) throw new Error('Expected one comparison installer');
    if (contentDigest(prepackaged) !== before) throw new Error('Prepackaged input changed during comparison');
    const installer = path.join(output, installers[0]);
    samples.push({ level, elapsedMs, installerBytes: fs.statSync(installer).size, sha256: sha256(installer) });
  }
  return {
    schema: 1,
    inputHash: before,
    inputUnchanged: true,
    samples,
    recommendation: 'measure-before-changing-default',
    interpretation:
      'Same prepackaged input and signing policy. Each sample includes installer assembly and signing, not compression alone. Samples run sequentially on one runner; order effects remain possible.',
  };
}

module.exports = { compareCompression, contentDigest };
