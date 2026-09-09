const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../../../scripts/local-build');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[workspace]\n');
  return fs.realpathSync(root);
}

test('Core targets preserve Cargo reuse and resolve symlink aliases to the same worktree', (t) => {
  const { coreTarget } = require('../../../scripts/local-build-state');
  const a = fixture(t),
    b = fixture(t);
  const first = coreTarget(a);
  assert.equal(first, path.join(fs.realpathSync(a), 'target'));
  assert.equal(coreTarget(a), first);
  assert.notEqual(coreTarget(b), first);
  fs.symlinkSync(a, path.join(b, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(coreTarget(path.join(b, 'alias')), first);
  fs.symlinkSync(first, path.join(b, 'target'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => coreTarget(b), /symlink|outside/);
});

test('local phases do not implicitly build installers or broaden focused tests', () => {
  assert.deepEqual(plan('dev'), [{ name: 'dev', command: 'bun', args: ['run', 'start'] }]);
  assert.deepEqual(plan('build')[0].args, ['scripts/build-with-builder.js', process.arch, '--pack-only']);
  assert.deepEqual(plan('focused', { crate: 'aionui-common' })[0].args, [
    'test',
    '--locked',
    '-p',
    'aionui-common',
    '--lib',
  ]);
  assert.throws(() => plan('focused'), /crate/);
  assert.throws(() => plan('unknown'), /Unknown/);
  if (['darwin', 'win32'].includes(process.platform)) {
    assert.equal(plan('package')[0].args.includes('--package-only'), true);
    assert.deepEqual(
      plan('release').map((stage) => stage.name),
      ['full', 'build', 'package']
    );
  } else assert.throws(() => plan('package'), /support macOS and Windows/);
});

test('audit distinguishes generated output and unknown data, and measures growth', (t) => {
  const { audit } = require('../../../scripts/local-build-audit');
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'out/main'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out/main/index.js'), 'bundle');
  fs.mkdirSync(path.join(root, 'out/mystery'));
  const before = audit(root);
  fs.appendFileSync(path.join(root, 'out/main/index.js'), 'more');
  const after = audit(root, undefined, before);
  assert.equal(after.entries.find((entry) => entry.path === path.join(root, 'out/main')).deltaBytes, 4);
  assert.equal(after.entries.find((entry) => entry.path === path.join(root, 'out/mystery')).kind, 'unknown');
  assert.equal(after.entries.find((entry) => entry.path === path.join(root, 'out/mystery')).reproducible, false);
});

test('source identity changes for dirty inputs and build locks reject concurrent writers', (t) => {
  const { source, acquire } = require('../../../scripts/local-build-state');
  const root = fixture(t);
  execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'initial'],
    { cwd: root }
  );
  const before = source(root);
  fs.appendFileSync(path.join(root, 'Cargo.toml'), '# changed');
  const after = source(root);
  assert.equal(before.commit, after.commit);
  assert.notEqual(before.inputHash, after.inputHash);
  assert.equal(after.dirty, true);
  const release = acquire(root);
  assert.throws(() => acquire(root), /lock/);
  release();
  acquire(root)();
});

test('cleanup refuses unknown, source-bearing and symlinked directories', (t) => {
  const { clean } = require('../../../scripts/local-build-audit');
  const root = fixture(t);
  assert.throws(() => clean(root, undefined, root, true), /Unknown|non-reproducible/);
  fs.mkdirSync(path.join(root, 'out/main'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out/main/keep.ts'), 'source');
  assert.throws(() => clean(root, undefined, path.join(root, 'out/main'), true), /Source|uncommitted|non-reproducible/);
  assert.ok(fs.existsSync(path.join(root, 'out/main/keep.ts')));
  fs.symlinkSync(root, path.join(root, 'out/renderer'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => clean(root, undefined, path.join(root, 'out/renderer'), true), /non-reproducible/);
});

test('cleanup blocks an open file then deletes only the released generated directory', async (t) => {
  const { clean } = require('../../../scripts/local-build-audit');
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.gitignore'), 'out/\n.workspace/\n');
  const target = path.join(root, 'out/main');
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(target, 'index.js');
  fs.writeFileSync(file, 'generated bundle');
  const { inputHash } = require('../../../packages/shared-scripts/src/build-cache');
  fs.writeFileSync(
    path.join(root, 'out/.vite-build-cache.json'),
    JSON.stringify({ outputHash: inputHash(root, ['out/main', 'out/preload', 'out/renderer']) })
  );
  if (!['darwin', 'linux'].includes(process.platform)) {
    assert.throws(() => clean(root, undefined, target, true), /ownership checks unavailable/);
    assert.ok(fs.existsSync(file));
    return;
  }
  const child = spawn(
    process.execPath,
    ['-e', 'require("fs").openSync(process.argv[1],"r");process.stdout.write("ready");setInterval(()=>{},1000)', file],
    { cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] }
  );
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  assert.throws(() => clean(root, undefined, target, true), /Active|Open files/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'generated bundle');
  const closed = once(child, 'close');
  child.kill();
  await closed;
  const result = clean(root, undefined, target, true);
  assert.equal(result.result, 'removed');
  assert.equal(result.afterBytes, 0);
  assert.ok(fs.existsSync(path.join(root, 'Cargo.toml')));
});

test('cleanup preserves ignored unknown additions even inside a previously generated output', (t) => {
  const { clean } = require('../../../scripts/local-build-audit');
  const { inputHash } = require('../../../packages/shared-scripts/src/build-cache');
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.gitignore'), 'out/\n.workspace/\n');
  const target = path.join(root, 'out/main');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'index.js'), 'built');
  fs.writeFileSync(
    path.join(root, 'out/.vite-build-cache.json'),
    JSON.stringify({ outputHash: inputHash(root, ['out/main', 'out/preload', 'out/renderer']) })
  );
  fs.writeFileSync(path.join(target, 'keep.ts'), 'ignored source');
  assert.throws(() => clean(root, undefined, target, true), /non-reproducible/);
  assert.equal(fs.readFileSync(path.join(target, 'keep.ts'), 'utf8'), 'ignored source');
});

test('Core bookkeeping never changes the source identity of a clean Cargo worktree', (t) => {
  const { source, acquire } = require('../../../scripts/local-build-state');
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.gitignore'), 'target/\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial'], {
    cwd: root,
  });
  const before = source(root);
  const release = acquire(root);
  try {
    assert.equal(source(root).inputHash, before.inputHash);
    assert.equal(source(root).dirty, false);
  } finally {
    release();
  }
});
