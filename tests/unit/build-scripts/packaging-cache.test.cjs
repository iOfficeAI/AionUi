const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cache = require('../../../packages/shared-scripts/src/build-cache');
const { buildInputHash } = require('../../../scripts/build-inputs');
const { main: buildMcp } = require('../../../scripts/build-mcp-servers');
const { prepareHubResources } = require('../../../scripts/prepareHubResources');
const { prepareCrossTargetManagedResources } = require('../../../packages/shared-scripts/src/prepare-aioncore');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-cache-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

test('output manifests survive a different runner checkout and reject tampering', (t) => {
  const source = fixture(t);
  const target = fixture(t);
  const manifest = path.join(source, 'out/.mcp-build-cache.json');
  const output = path.join(source, 'out/main/server.js');
  write(output, 'verified bundle');
  cache.saveOutputs(manifest, 'input-key', [output]);
  fs.cpSync(path.join(source, 'out'), path.join(target, 'out'), { recursive: true });
  const restored = path.join(target, 'out/main/server.js');
  const restoredManifest = path.join(target, 'out/.mcp-build-cache.json');
  assert.equal(cache.outputsMatch(restoredManifest, 'input-key', [restored]), true);
  assert.equal(cache.outputsMatch(restoredManifest, 'changed-key', [restored]), false);
  write(restored, 'tampered bundle');
  assert.equal(cache.outputsMatch(restoredManifest, 'input-key', [restored]), false);
});

test('stage evidence records failed operations without hiding the original failure', (t) => {
  const root = fixture(t);
  const destination = path.join(root, 'stages.jsonl');
  const previous = process.env.BUILD_STAGE_REPORT;
  process.env.BUILD_STAGE_REPORT = destination;
  try {
    assert.throws(
      () =>
        cache.timed('compile', () => {
          throw new Error('compile failed');
        }),
      /compile failed/
    );
    const record = JSON.parse(fs.readFileSync(destination, 'utf8'));
    assert.equal(record.stage, 'compile');
    assert.equal(record.status, 'failed');
    assert.equal(typeof record.startedAt, 'string');
    assert.ok(record.elapsedMs >= 0);
  } finally {
    if (previous === undefined) delete process.env.BUILD_STAGE_REPORT;
    else process.env.BUILD_STAGE_REPORT = previous;
  }
});

test('content hashes ignore mtime and detect same-size edits, additions and removals', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'packages/a.ts');
  write(file, 'old');
  const stamp = new Date('2026-01-01');
  fs.utimesSync(file, stamp, stamp);
  const first = cache.inputHash(root, ['packages']);
  fs.utimesSync(file, new Date(), new Date());
  assert.equal(cache.inputHash(root, ['packages']), first);
  write(file, 'new');
  fs.utimesSync(file, stamp, stamp);
  assert.notEqual(cache.inputHash(root, ['packages']), first);
  const changed = cache.inputHash(root, ['packages']);
  write(path.join(root, 'packages/b.ts'), 'extra');
  assert.notEqual(cache.inputHash(root, ['packages']), changed);
  fs.unlinkSync(path.join(root, 'packages/b.ts'));
  assert.equal(cache.inputHash(root, ['packages']), changed);
});

test('Vite cache includes build identity, environment, dotenv and Uno config', (t) => {
  const root = fixture(t);
  write(path.join(root, 'package.json'), '{}');
  const env = { AIONUI_BUILD_COMMIT: 'abc' };
  const initial = buildInputHash(root, env);
  for (const field of [
    'AIONUI_BUILD_COMMIT',
    'AIONUI_BUILD_CHANNEL',
    'SENTRY_DSN',
    'VITE_FEATURE',
    'ELECTRON_BUILDER_ARCH',
  ]) {
    assert.notEqual(buildInputHash(root, { ...env, [field]: 'changed' }), initial);
  }
  write(path.join(root, '.env.production'), 'VITE_FEATURE=1');
  assert.notEqual(buildInputHash(root, env), initial);
  const dotenv = buildInputHash(root, env);
  write(path.join(root, 'uno.config.ts'), 'export default {}');
  assert.notEqual(buildInputHash(root, env), dotenv);
});

test('download cache rejects corruption and expected digest mismatch, obeys budget and write lock', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'input');
  const dest = path.join(root, 'result');
  const dir = path.join(root, 'cache');
  write(file, 'payload');
  assert.equal(cache.saveDownload(dir, 'source', file, 1), false);
  assert.equal(cache.saveDownload(dir, 'source', file), true);
  assert.equal(cache.restoreDownload(dir, 'source', dest, cache.sha256(file)), true);
  assert.equal(cache.restoreDownload(dir, 'source', dest, '0'.repeat(64)), false);
  const entry = fs.readdirSync(dir).find((name) => !name.startsWith('.'));
  write(path.join(dir, entry, 'content'), 'corrupt');
  assert.equal(cache.restoreDownload(dir, 'source', dest), false);
  assert.equal(cache.saveDownload(dir, 'source', file), true);
  assert.equal(cache.restoreDownload(dir, 'source', dest), true);
  write(path.join(dir, '.write-lock'), 'busy');
  assert.equal(cache.saveDownload(dir, 'other', file), false);
  assert.equal(fs.readFileSync(path.join(dir, '.write-lock'), 'utf8'), 'busy');
});

test('MCP cache checks all three outputs, missing/corrupt output and force rebuild', async (t) => {
  const root = fixture(t);
  write(path.join(root, 'package.json'), '{}');
  let calls = 0;
  const esbuild = {
    version: 'test',
    build: async ({ outfile }) => {
      calls++;
      write(outfile, 'bundle');
    },
  };
  assert.equal((await buildMcp({ root, esbuild })).cached, false);
  assert.equal((await buildMcp({ root, esbuild })).cached, true);
  assert.equal(calls, 3);
  write(path.join(root, 'out/main/builtin-mcp-browser.js'), 'broken');
  assert.equal((await buildMcp({ root, esbuild })).cached, false);
  fs.unlinkSync(path.join(root, 'out/main/builtin-mcp-image-gen.js'));
  assert.equal((await buildMcp({ root, esbuild })).cached, false);
  assert.equal((await buildMcp({ root, esbuild, force: true })).cached, false);
  assert.equal(calls, 12);
});

test('failed MCP compilation does not save successful cache identity', async (t) => {
  const root = fixture(t);
  const esbuild = {
    version: 'test',
    build: async () => {
      throw new Error('compile failed');
    },
  };
  await assert.rejects(buildMcp({ root, esbuild }), /compile failed/);
  assert.equal(fs.existsSync(path.join(root, 'out/.mcp-build-cache.json')), false);
});

function hubFixture(t) {
  const root = fixture(t);
  const archive = path.join(root, 'archive');
  write(archive, 'extension');
  const index = { extensions: { one: { dist: { tarball: 'one.zip', integrity: `sha256-${cache.sha256(archive)}` } } } };
  const calls = [];
  const download = async (relative, destination) => {
    calls.push(relative);
    write(destination, relative === 'index.json' ? JSON.stringify(index) : fs.readFileSync(archive));
    return `https://example.test/${relative}`;
  };
  return { root, cacheDir: path.join(root, 'cache'), archive, index, calls, download };
}

test('Hub refresh fetches index but reuses checksum verified archives; complete offline cache works', async (t) => {
  const data = hubFixture(t);
  assert.equal((await prepareHubResources(data)).complete, true);
  data.calls.length = 0;
  assert.equal((await prepareHubResources(data)).complete, true);
  assert.deepEqual(data.calls, ['index.json']);
  const offline = {
    ...data,
    download: async () => {
      throw new Error('offline');
    },
  };
  assert.equal((await prepareHubResources(offline)).complete, true);
});

test('Hub supports published SHA512 SRI and verifies cached bytes against it', async (t) => {
  const data = hubFixture(t);
  const crypto = require('node:crypto');
  data.index.extensions.one.dist.integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(data.archive)).digest('base64')}`;
  assert.equal((await prepareHubResources(data)).complete, true);
  data.calls.length = 0;
  assert.equal((await prepareHubResources(data)).complete, true);
  assert.deepEqual(data.calls, ['index.json']);
  data.index.extensions.one.dist.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
  assert.equal((await prepareHubResources(data)).complete, false);
});

test('Hub accepts SHA256 SRI and refuses malformed integrity without trusting an archive', async (t) => {
  const data = hubFixture(t);
  data.index.extensions.one.dist.integrity = `sha256-${Buffer.from(cache.sha256(data.archive), 'hex').toString('base64')}`;
  assert.equal((await prepareHubResources(data)).complete, true);
  data.index.extensions.one.dist.integrity = 'sha512-not-a-digest';
  assert.equal((await prepareHubResources(data)).complete, false);
});

test('Hub published SRI rejects a cached archive even when its local checksum is forged', async (t) => {
  const data = hubFixture(t);
  const crypto = require('node:crypto');
  data.index.extensions.one.dist.integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(data.archive)).digest('base64')}`;
  await prepareHubResources(data);
  for (const entry of fs.readdirSync(data.cacheDir)) {
    const directory = path.join(data.cacheDir, entry);
    const file = path.join(directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!manifest.source.includes('one.zip')) continue;
    write(path.join(directory, 'content'), 'forged');
    manifest.sha256 = cache.sha256(path.join(directory, 'content'));
    write(file, JSON.stringify(manifest));
  }
  await assert.rejects(
    prepareHubResources({
      ...data,
      download: async () => {
        throw new Error('offline');
      },
    }),
    /Hub archive integrity mismatch/
  );
  assert.equal(fs.readFileSync(path.join(data.root, 'resources/hub/one.zip'), 'utf8'), 'extension');
});

test('Hub index content change invalidates archive and partial failure preserves previous resources', async (t) => {
  const data = hubFixture(t);
  await prepareHubResources(data);
  const manifest = path.join(data.root, 'resources/hub/manifest.json');
  const previous = fs.readFileSync(manifest, 'utf8');
  data.index.extensions.one.dist.integrity = `sha256-${'0'.repeat(64)}`;
  const result = await prepareHubResources(data);
  assert.equal(result.published, false);
  assert.equal(result.complete, false);
  assert.equal(fs.readFileSync(manifest, 'utf8'), previous);
});

test('Hub corrupt offline archive fails without replacing last resource set', async (t) => {
  const data = hubFixture(t);
  await prepareHubResources(data);
  for (const entry of fs.readdirSync(data.cacheDir)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(data.cacheDir, entry, 'manifest.json'), 'utf8'));
    if (manifest.source.includes('one.zip')) write(path.join(data.cacheDir, entry, 'content'), 'corrupt');
  }
  await assert.rejects(
    prepareHubResources({
      ...data,
      download: async () => {
        throw new Error('offline');
      },
    }),
    /Incomplete offline/
  );
  assert.equal(fs.readFileSync(path.join(data.root, 'resources/hub/one.zip'), 'utf8'), 'extension');
});

test('Node verified archive cache avoids downloads, detects corruption and separates architecture', (t) => {
  const root = fixture(t);
  const previous = process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION;
  process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION = '22.0.0';
  t.after(() => {
    if (previous === undefined) delete process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION;
    else process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION = previous;
  });
  const binary = path.join(root, 'aioncore');
  write(binary, 'binary 22.0.0');
  const payload = path.join(root, 'archive');
  write(payload, 'node archive');
  const digest = cache.sha256(payload);
  const downloads = [];
  const options = {
    cacheDir: path.join(root, 'cache'),
    download: (url, destination) => {
      downloads.push(url);
      write(
        destination,
        url.endsWith('.txt')
          ? `${digest}  node-v22.0.0-win-x64.zip\n${digest}  node-v22.0.0-win-arm64.zip\n`
          : 'node archive'
      );
    },
    extract: (archive, output) => {
      const arch = path.basename(archive).includes('arm64') ? 'arm64' : 'x64';
      write(path.join(output, `node-v22.0.0-win-${arch}/node.exe`), 'node');
    },
  };
  const target = path.join(root, 'target');
  prepareCrossTargetManagedResources(binary, target, 'win32', 'x64', options);
  assert.equal(downloads.length, 2);
  prepareCrossTargetManagedResources(binary, target, 'win32', 'x64', options);
  assert.equal(downloads.length, 2);
  prepareCrossTargetManagedResources(binary, target, 'win32', 'arm64', options);
  assert.equal(downloads.length, 3);
  for (const entry of fs.readdirSync(options.cacheDir)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(options.cacheDir, entry, 'manifest.json'), 'utf8'));
    if (manifest.source.includes('win-x64.zip')) write(path.join(options.cacheDir, entry, 'content'), 'corrupt');
  }
  prepareCrossTargetManagedResources(binary, target, 'win32', 'x64', options);
  assert.equal(downloads.length, 4);
});

test('MCP source and tool version changes invalidate the cache', async (t) => {
  const root = fixture(t);
  write(path.join(root, 'packages/input.ts'), 'first');
  const esbuild = { version: 'one', build: async ({ outfile }) => write(outfile, 'bundle') };
  await buildMcp({ root, esbuild });
  write(path.join(root, 'packages/input.ts'), 'other');
  assert.equal((await buildMcp({ root, esbuild })).cached, false);
  assert.equal((await buildMcp({ root, esbuild: { ...esbuild, version: 'two' } })).cached, false);
});

test('Hub cold download failure never creates a complete cached index', async (t) => {
  const data = hubFixture(t);
  const download = async (relative, destination) => {
    if (relative !== 'index.json') throw new Error('interrupted archive');
    return data.download(relative, destination);
  };
  const result = await prepareHubResources({ ...data, download });
  assert.equal(result.complete, false);
  await assert.rejects(
    prepareHubResources({
      ...data,
      download: async () => {
        throw new Error('offline');
      },
    }),
    /offline/
  );
});

test('concurrent cache writers leave only complete readable entries', async (t) => {
  const root = fixture(t);
  const dir = path.join(root, 'cache');
  const archive = path.join(root, 'archive');
  write(archive, 'valid');
  const { spawn } = require('node:child_process');
  await Promise.all(
    [0, 1, 2, 3].map(
      (id) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [
            '-e',
            'const c=require(process.argv[1]); c.saveDownload(process.argv[2], process.argv[3], process.argv[4]);',
            require.resolve('../../../packages/shared-scripts/src/build-cache'),
            dir,
            String(id),
            archive,
          ]);
          child.on('error', reject);
          child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`writer exited ${code}`))));
        })
    )
  );
  const entries = fs.readdirSync(dir);
  assert.ok(entries.length >= 1);
  assert.ok(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry)));
  for (const entry of entries) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, entry, 'manifest.json'), 'utf8'));
    assert.equal(cache.restoreDownload(dir, manifest.source, path.join(root, 'restored')), true);
  }
});
