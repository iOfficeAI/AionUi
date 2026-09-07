// Runs in the packaged Electron's Node mode, against its own ASAR dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');

const archive = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const packagedRequire = createRequire(path.join(archive, 'package.json'));
const priorModules = new Set(Object.keys(require.cache));
function assertPackaged(file) {
  const relative = path.relative(archive, file);
  assert.ok(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative),
    `Dependency escaped target ASAR: ${file}`
  );
}
function load(entry) {
  assertPackaged(packagedRequire.resolve(entry));
  return packagedRequire(entry);
}
for (const entry of ['zod', 'zod/v3', 'zod/v4']) {
  const { z } = load(entry);
  const schema = z.object({ name: z.string(), count: z.number().int().positive() });
  assert.deepEqual(schema.parse({ name: 'offline-smoke', count: 1 }), { name: 'offline-smoke', count: 1 });
  assert.equal(schema.safeParse({ name: 'offline-smoke', count: -1 }).success, false);
}
const { CallToolRequestSchema } = load('@modelcontextprotocol/sdk/types.js');
assert.equal(
  CallToolRequestSchema.parse({ method: 'tools/call', params: { name: 'offline-smoke', arguments: {} } }).method,
  'tools/call'
);
const source = path.join(archive, 'node_modules/zod/src');
function verifyNoTests(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    assert.notEqual(item.name, 'tests', `Zod test source survived packaging: ${item.name}`);
    verifyNoTests(path.join(directory, item.name));
  }
}
verifyNoTests(source);
const hub = path.join(path.dirname(archive), 'hub');
const hubManifest = JSON.parse(fs.readFileSync(path.join(hub, 'manifest.json'), 'utf8'));
const hubIndex = JSON.parse(fs.readFileSync(path.join(hub, 'index.json'), 'utf8'));
assert.equal(hubManifest.complete, true, 'Packaged Hub resource set is incomplete');
assert.ok(hubManifest.extensions.length > 0, 'Packaged Hub has no offline extensions');
assert.deepEqual(hubManifest.extensions.map((entry) => entry.name).sort(), Object.keys(hubIndex.extensions).sort());
for (const entry of hubManifest.extensions) {
  assert.equal(path.basename(entry.file), entry.file, 'Hub archive must be inside its resource directory');
  const bytes = fs.readFileSync(path.join(hub, entry.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
}
// Also reject transitive CommonJS dependencies resolved outside the packaged app.
for (const file of Object.keys(require.cache)) if (!priorModules.has(file)) assertPackaged(file);
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      schema: 1,
      status: 'passed',
      platform: process.platform,
      electron: process.versions.electron,
      assertions: [
        'zod-v3-v4-valid-and-invalid-input',
        'mcp-call-tool-request',
        'zod-test-sources-absent',
        'hub-index-and-archives-complete',
      ],
      boundary: 'Packaged dependency execution in Electron Node mode; installer and full UI acceptance are separate.',
    },
    null,
    2
  )
);
