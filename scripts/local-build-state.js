const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inputHash } = require('../packages/shared-scripts/src/build-cache');

function command(cwd, executable, args) {
  return execFileSync(executable, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}
function worktree(root) {
  const canonical = fs.realpathSync(root);
  const top = fs.realpathSync(command(canonical, 'git', ['rev-parse', '--show-toplevel']));
  if (top !== canonical) throw new Error('Expected a worktree root');
  return canonical;
}
function coreTarget(root) {
  root = worktree(root);
  if (!fs.existsSync(path.join(root, 'Cargo.toml'))) throw new Error('Core requires Cargo.toml');
  const target = path.join(root, 'target');
  if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error('Cargo target symlink points outside its worktree');
  // Explicit --target-dir overrides both environment and Cargo config. Keep the
  // native Cargo layout so existing worktree-local artifacts remain reusable.
  return target;
}
function source(root) {
  root = worktree(root);
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean);
  return {
    worktree: root,
    commit: command(root, 'git', ['rev-parse', 'HEAD']),
    dirty: !!command(root, 'git', ['status', '--porcelain']),
    inputHash: inputHash(root, files),
  };
}
function stateDirectory(root) {
  return fs.existsSync(path.join(root, 'Cargo.toml'))
    ? path.join(coreTarget(root), '.aionui-local-build')
    : path.join(root, '.workspace/local-build');
}
function acquire(root) {
  const file = path.join(stateDirectory(root), 'active.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
  } catch {
    throw new Error(
      `Build/cleanup lock exists: ${file}. Inspect the recorded PID; remove only this lock after proving it is no longer active.`
    );
  }
  return () => fs.unlinkSync(file);
}
module.exports = { command, writeJson, worktree, coreTarget, source, acquire, stateDirectory };
