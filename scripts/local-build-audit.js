// Read-only inventory; an entry is never deletion authority by itself.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { worktree, coreTarget, command, acquire, stateDirectory } = require('./local-build-state');
const { inputHash } = require('../packages/shared-scripts/src/build-cache');

function size(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { bytes: 0, allocatedBytes: 0, exists: false };
  if (stat.isSymbolicLink()) return { bytes: 0, allocatedBytes: 0, exists: true, unsafe: 'symlink' };
  if (!stat.isDirectory()) return { bytes: stat.size, allocatedBytes: stat.blocks * 512, exists: true };
  const result = { bytes: 0, allocatedBytes: stat.blocks * 512, exists: true };
  for (const name of fs.readdirSync(file)) {
    const child = size(path.join(file, name));
    result.bytes += child.bytes;
    result.allocatedBytes += child.allocatedBytes;
    if (child.unsafe) result.unsafe = child.unsafe;
  }
  return result;
}
function generatedProof(owner, target) {
  try {
    if (['main', 'preload', 'renderer'].some((name) => target === path.join(owner, 'out', name))) {
      const manifest = JSON.parse(fs.readFileSync(path.join(owner, 'out/.vite-build-cache.json'), 'utf8'));
      return manifest.outputHash === inputHash(owner, ['out/main', 'out/preload', 'out/renderer']);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(stateDirectory(owner), 'cargo-output.json'), 'utf8'));
    return manifest.target === target && manifest.outputHash === inputHash(owner, [path.relative(owner, target)]);
  } catch {
    return false;
  }
}
function audit(root, core, previous) {
  root = worktree(root);
  const entries = [];
  const add = (file, kind, owner, reproducible = false) => {
    const usage = size(file);
    const prior = previous?.entries?.find((entry) => entry.path === file);
    entries.push({
      path: file,
      kind,
      owner,
      reproducible: reproducible && !usage.unsafe && generatedProof(owner, file),
      ...usage,
      deltaBytes: prior ? usage.bytes - prior.bytes : null,
      deltaAllocatedBytes: prior ? usage.allocatedBytes - prior.allocatedBytes : null,
    });
  };
  const out = path.join(root, 'out');
  if (fs.existsSync(out) && !fs.lstatSync(out).isSymbolicLink()) {
    for (const name of fs.readdirSync(out)) {
      const generated = ['main', 'preload', 'renderer'].includes(name);
      const kind = generated
        ? 'client-build'
        : /\.(dmg|exe|blockmap)$|\.app$|unpacked|^mac/.test(name)
          ? 'runtime-artifact'
          : /log|report|smoke/.test(name)
            ? 'evidence-or-log'
            : 'unknown';
      add(path.join(out, name), kind, root, generated);
    }
  } else add(out, 'unknown', root);
  for (const name of ['resources/bundled-aioncore', 'resources/hub', 'resources/bundled-bun'])
    add(path.join(root, name), 'runtime-resource', root);
  add(path.join(root, '.workspace/local-build'), 'evidence-or-log', root);
  add(path.join(root, 'node_modules'), 'dependencies', root);
  if (core) {
    core = worktree(core);
    const target = coreTarget(core);
    for (const name of fs.existsSync(target) ? fs.readdirSync(target) : ['debug', 'release']) {
      add(
        path.join(target, name),
        name === 'debug' || name === 'release' ? 'cargo-target' : 'unknown',
        core,
        name === 'debug'
      );
    }
  }
  for (const relative of [
    '.cache/aionui-build',
    'Library/Caches/electron',
    'Library/Caches/electron-builder',
    'Library/Caches/sccache',
    '.bun/install/cache',
    '.cargo/registry',
    '.cargo/git',
  ]) {
    add(path.join(os.homedir(), relative), 'shared-cache', 'shared; retained');
  }
  return {
    schema: 1,
    source: 'local-filesystem',
    measuredAt: new Date().toISOString(),
    worktree: root,
    core,
    entries,
    exclusions: [
      'Source, user configuration, business data and logs are never cleanup candidates. Shared caches are retained.',
    ],
    worktrees: command(root, 'git', ['worktree', 'list', '--porcelain']),
    coreWorktrees: core ? command(core, 'git', ['worktree', 'list', '--porcelain']) : null,
    coverage: 'Selected UI and optional Core worktree only; registered peer worktrees are listed but not traversed',
    freeBytes: fs.statfsSync(root).bavail * fs.statfsSync(root).bsize,
  };
}
function assertIdle(owner, target) {
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error('Process/file ownership checks unavailable on this platform');
  const processes = command(owner, 'ps', ['-axo', 'pid=,ppid=,command='])
    .split('\n')
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }] : [];
    });
  const ancestors = new Set([process.pid]);
  let current = process.pid;
  while (current > 1) {
    current = processes.find((item) => item.pid === current)?.parent || 0;
    ancestors.add(current);
  }
  const writers = processes.filter(
    (item) => !ancestors.has(item.pid) && /cargo|rustc|electron|aioncore|GEAUi|app-builder|node|bun/i.test(item.command)
  );
  if (writers.some((item) => item.command.includes(owner) || item.command.includes(target))) {
    throw new Error('Active build/client process associated with cleanup owner');
  }
  for (const args of [
    ['-nP', '+D', target, '-Fp'],
    ['-nP', '-a', '-d', 'cwd', '-Fpn'],
  ]) {
    const result = spawnSync('lsof', args, { encoding: 'utf8', timeout: 30000 });
    if (result.error || ![0, 1].includes(result.status) || result.stderr.trim())
      throw new Error('File/process ownership unknown; lsof could not complete cleanly');
    if (args.includes('+D') && result.stdout.trim()) throw new Error('Open files in cleanup target');
    if (args.includes('cwd')) {
      let pid;
      for (const line of result.stdout.split('\n')) {
        if (line.startsWith('p')) pid = Number(line.slice(1));
        if (
          line.startsWith('n') &&
          !ancestors.has(pid) &&
          (line.slice(1) === target ||
            line.slice(1).startsWith(target + path.sep) ||
            (writers.some((item) => item.pid === pid) &&
              (line.slice(1) === owner || line.slice(1).startsWith(owner + path.sep))))
        )
          throw new Error('Active process cwd in cleanup target');
      }
    }
  }
}
function clean(root, core, target, execute = false) {
  root = worktree(root);
  target = path.resolve(target);
  const release = acquire(root);
  let releaseCore;
  try {
    if (core && worktree(core) !== root) releaseCore = acquire(worktree(core));
    const entry = audit(root, core).entries.find((item) => item.path === target);
    if (!entry?.reproducible || !entry.exists) throw new Error('Unknown or non-reproducible cleanup target');
    if (fs.realpathSync(target) !== target) throw new Error('Cleanup target traverses a symlink');
    const relative = path.relative(entry.owner, target);
    if (command(entry.owner, 'git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', relative]))
      throw new Error('Source or uncommitted files in cleanup target');
    if (size(target).unsafe) throw new Error('Symlink inside cleanup target');
    assertIdle(entry.owner, target);
    if (execute) {
      // Recheck immediately before deleting; cooperative writers hold the same locks.
      assertIdle(entry.owner, target);
      fs.rmSync(target, { recursive: true });
    }
    return {
      path: target,
      beforeBytes: entry.bytes,
      afterBytes: size(target).bytes,
      result: execute ? 'removed' : 'dry-run',
      reason: 'Known generated cache, no tracked/untracked source, no observed process/file use',
    };
  } finally {
    releaseCore?.();
    release();
  }
}
module.exports = { size, audit, clean, assertIdle };
