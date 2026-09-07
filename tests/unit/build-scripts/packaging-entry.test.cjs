const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-entry-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'scripts/build-with-builder.js',
    'scripts/build-inputs.js',
    'packages/shared-scripts/src/build-cache.js',
  ]) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../../..', file), dest);
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main: './out/main/index.js', version: '1.0.0' }));
  const hook = path.join(root, 'hook.cjs');
  fs.writeFileSync(
    hook,
    `
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.cwd();
function write(file, content) {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}
cp.execSync = function(command) {
  fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(command) + '\\n');
  if (command.includes('electron-vite build')) {
    if (process.env.TEST_COMPILE_FAILURE) throw new Error('mock compilation failed');
    write('out/main/index.js', 'main bundle');
    write('out/preload/index.js', 'preload bundle');
    write('out/renderer/assets/index-test.js', 'renderer bundle');
    write('out/renderer/assets/index-test.css', 'css bundle');
    write('out/renderer/index.html', '<html><div id="root"></div><script type="module" src="./assets/index-test.js"></script><link href="./assets/index-test.css" rel="stylesheet"></html>');
  } else if (command.includes('build-mcp-servers.js')) {
    for (const name of ['image-gen', 'browser', 'lark-cli']) write('out/main/builtin-mcp-' + name + '.js', 'mcp bundle');
  } else {
    throw new Error('Unexpected external command: ' + command);
  }
  return Buffer.from('');
};
`
  );
  function run(extra = [], changes = {}) {
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (/^(AIONUI_|SENTRY_|VITE_|MAIN_VITE_|PRELOAD_VITE_|RENDERER_VITE_|GITHUB_)/.test(name)) delete env[name];
    }
    delete env.NODE_OPTIONS;
    Object.assign(env, changes, { NODE_OPTIONS: `--require=${hook}` });
    const result = spawnSync(
      process.execPath,
      ['scripts/build-with-builder.js', 'x64', '--mac', 'dmg', '--pack-only', ...extra],
      { cwd: root, env, encoding: 'utf8', timeout: 10000 }
    );
    return { ...result, output: result.stdout + result.stderr };
  }
  function builds() {
    return fs
      .readFileSync(path.join(root, 'calls.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('electron-vite build')).length;
  }
  return { root, run, builds };
}

test('real build entry reuses verified output and rebuilds corrupted content or changed configuration', (t) => {
  const { root, run, builds } = setup(t);
  let result = run();
  assert.equal(result.status, 0, result.output);
  assert.equal(builds(), 1);
  result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /verified-inputs-and-outputs/);
  assert.equal(builds(), 1);
  fs.writeFileSync(path.join(root, 'out/main/index.js'), 'corrupt');
  result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /output-content-mismatch/);
  assert.equal(builds(), 2);
  result = run([], { AIONUI_BUILD_CHANNEL: 'different' });
  assert.equal(result.status, 0, result.output);
  assert.equal(builds(), 3);
});

test('real build entry does not persist a success manifest after compilation failure', (t) => {
  const { root, run } = setup(t);
  const result = run([], { TEST_COMPILE_FAILURE: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /"stage":"vite","status":"failed"/);
  assert.equal(fs.existsSync(path.join(root, 'out/.vite-build-cache.json')), false);
});

test('real build entry refuses incomplete explicitly skipped output and keeps source map upload required', (t) => {
  const { root, run, builds } = setup(t);
  assert.equal(run().status, 0);
  fs.unlinkSync(path.join(root, 'out/renderer/assets/index-test.js'));
  const invalid = run(['--skip-vite']);
  assert.notEqual(invalid.status, 0);
  assert.equal(builds(), 1);
  assert.equal(run().status, 0);
  const result = run([], { SENTRY_AUTH_TOKEN: 'test-only-placeholder', SENTRY_UPLOAD_SOURCE_MAPS: 'true' });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /source-map-upload-required/);
  assert.ok(!result.output.includes('test-only-placeholder'));
  assert.equal(builds(), 3);
});
