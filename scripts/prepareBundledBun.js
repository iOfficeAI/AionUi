const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveCommand(commandName) {
  const resolver = process.platform === 'win32' ? 'where' : 'which';
  try {
    const output = execFileSync(resolver, [commandName], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });

    const first = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return first && fs.existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyIfExists(sourcePath, targetDir) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function prepareBundledBun() {
  const projectRoot = path.resolve(__dirname, '..');
  const targetDir = path.join(projectRoot, 'resources', 'bundled-bun', `${process.platform}-${process.arch}`);
  ensureDirectory(targetDir);

  try {
    const bunPath = resolveCommand(process.platform === 'win32' ? 'bun.exe' : 'bun');
    const bunxPath = resolveCommand(process.platform === 'win32' ? 'bunx.exe' : 'bunx');

    if (!bunPath || !bunxPath) {
      console.warn('⚠️  Skipping bundled bun/bunx: command not found on PATH');
      const manifest = {
        platform: process.platform,
        arch: process.arch,
        generatedAt: new Date().toISOString(),
        source: {
          bun: bunPath,
          bunx: bunxPath,
        },
        files: [],
        skipped: true,
        reason: 'missing-command',
      };
      fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
      return { prepared: false, reason: 'missing-command' };
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    ensureDirectory(targetDir);

    const copied = [];
    const copiedPaths = new Set();
    for (const sourcePath of [bunPath, bunxPath]) {
      const resolved = path.resolve(sourcePath);
      if (copiedPaths.has(resolved)) continue;
      copiedPaths.add(resolved);
      const targetPath = copyIfExists(resolved, targetDir);
      if (targetPath) copied.push(path.basename(targetPath));
    }

    if (process.platform === 'win32') {
      const bunxCmdPath = path.join(path.dirname(bunxPath), 'bunx.cmd');
      const targetPath = copyIfExists(bunxCmdPath, targetDir);
      if (targetPath) copied.push(path.basename(targetPath));
    }

    const manifest = {
      platform: process.platform,
      arch: process.arch,
      generatedAt: new Date().toISOString(),
      source: {
        bun: bunPath,
        bunx: bunxPath,
      },
      files: copied,
    };

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

    console.log(`📦 Bundled bun runtime prepared: ${path.relative(projectRoot, targetDir)} (${copied.join(', ')})`);
    return { prepared: true, dir: targetDir, files: copied };
  } catch (error) {
    console.warn(`⚠️  Failed to prepare bundled bun runtime: ${error instanceof Error ? error.message : String(error)}`);
    return { prepared: false, reason: 'error' };
  }
}

module.exports = prepareBundledBun;
