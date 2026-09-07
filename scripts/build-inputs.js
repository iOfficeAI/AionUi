const fs = require('fs');
const { execFileSync } = require('child_process');
const { inputHash } = require('../packages/shared-scripts/src/build-cache');

const INPUTS = [
  'package.json',
  'package-lock.json',
  'bun.lock',
  'tsconfig.json',
  'uno.config.ts',
  'packages',
  'public',
  'scripts',
  'patches',
];

function buildInputHash(root, env = process.env) {
  const environment = Object.fromEntries(
    Object.keys(env)
      .toSorted()
      .filter(
        (name) =>
          /^(VITE_|MAIN_VITE_|PRELOAD_VITE_|RENDERER_VITE_|AIONUI_|SENTRY_)/.test(name) ||
          ['CI', 'GITHUB_SHA', 'GITHUB_REF', 'NODE_ENV', 'env', 'ELECTRON_BUILDER_ARCH'].includes(name)
      )
      .map((name) => [name, env[name]])
  );
  // The configuration falls back to HEAD, even when source contents are unchanged.
  let head = '';
  if (!env.AIONUI_BUILD_COMMIT?.trim() && !env.GITHUB_SHA?.trim()) {
    try {
      head = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {}
  }
  const tools = {};
  for (const name of ['electron-vite', 'vite', 'esbuild', 'unocss', '@sentry/vite-plugin']) {
    try {
      tools[name] = JSON.parse(
        fs.readFileSync(require.resolve(`${name}/package.json`, { paths: [root] }), 'utf8')
      ).version;
    } catch {
      tools[name] = 'unavailable';
    }
  }
  const envFiles = fs.readdirSync(root).filter((name) => name === '.env' || name.startsWith('.env.'));
  return inputHash(root, [...INPUTS, ...envFiles], {
    schema: 1,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    tools,
    head,
    environment,
  });
}

module.exports = { buildInputHash };
