const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const webpackTempDir = path.resolve(__dirname, '..', '.webpack');
try {
  // Guard against stale .DS_Store / temp artifacts that break forge cleanup.
  fs.rmSync(webpackTempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
} catch (error) {
  console.warn('[start-forge] failed to remove .webpack before start:', error);
}

const env = { ...process.env };
if (process.platform === 'win32') {
  env.FORGE_SKIP_NATIVE_REBUILD = 'true';
}

const extraArgs = process.argv.slice(2);
const args = ['start'];
if (extraArgs.length > 0) {
  args.push('--', ...extraArgs);
}

const result = spawnSync('electron-forge', args, {
  stdio: 'inherit',
  shell: true,
  env,
});

process.exit(result.status ?? 0);
