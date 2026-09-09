const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkRoute } = require('../../../scripts/packaging/core-capability-smoke.cjs');
const { getPinnedActionsSource } = require('../../../packages/shared-scripts/src/prepare-aioncore.js');

test('default Core sources bind platform runs to a repository and exact SHA without overriding explicit sources', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-source-pin-'));
  const keys = [
    'AIONUI_BACKEND_RUN_ID',
    'AIONUI_BACKEND_VERSION',
    'AIONUI_BACKEND_LOCAL_BINARY',
    'AIONUI_BACKEND_LOCAL_BUNDLE_DIR',
    'AIONUI_BACKEND_RELEASE_REPOSITORY',
  ];
  const before = keys.map((key) => process.env[key]);
  keys.forEach((key) => delete process.env[key]);
  t.after(() => {
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
  const pin = {
    repository: 'example/Core',
    headSha: 'a'.repeat(40),
    runs: { 'darwin-arm64': '123', 'win32-x64': '456' },
  };
  const write = () => fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ aioncoreBuild: pin }));
  write();
  assert.deepEqual(getPinnedActionsSource(root, 'darwin', 'arm64'), {
    repository: pin.repository,
    headSha: pin.headSha,
    runId: '123',
  });
  assert.equal(getPinnedActionsSource(root, 'win32', 'x64').runId, '456');
  assert.equal(getPinnedActionsSource(root, 'linux', 'x64'), null);
  for (const key of keys) {
    process.env[key] = 'explicit-source';
    assert.equal(getPinnedActionsSource(root, 'darwin', 'arm64'), null);
    delete process.env[key];
  }
  pin.headSha = 'main';
  write();
  assert.throws(() => getPinnedActionsSource(root, 'darwin', 'arm64'), /Invalid pinned/);
});

test('a running Core must reach the business authentication handler, not a generic route or auth fallback', async (t) => {
  let response = [404, { success: false, code: 'NOT_FOUND' }];
  const server = http.createServer((request, res) => {
    assert.equal(request.url, '/api/gea/sales-plan/periods?pageNo=1&pageSize=1');
    assert.equal(request.headers.authorization, undefined);
    res.writeHead(response[0], { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response[1]));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const port = server.address().port;
  await assert.rejects(checkRoute(port), /Core business route unavailable/);
  response = [200, { success: true }];
  await assert.rejects(checkRoute(port), /Core business route unavailable/);
  response = [401, { code: 'UNAUTHORIZED' }];
  await assert.rejects(checkRoute(port), /sales-plan handler/);
  response = [401, { code: 'GEA_AUTH_REQUIRED' }];
  assert.equal((await checkRoute(port)).status, 'passed');
});
