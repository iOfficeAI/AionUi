const { spawnSync } = require('child_process');

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
