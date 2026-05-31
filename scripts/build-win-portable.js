#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const archFlags = new Set(['--x64', '--arm64', '--ia32', '--armv7l', 'x64', 'arm64', 'ia32', 'armv7l']);
const userArgs = process.argv.slice(2);
const hasArchArg = userArgs.some((arg) => archFlags.has(arg));

const buildScript = path.join(__dirname, 'build-with-builder.js');
const args = [
  buildScript,
  'auto',
  '--win',
  'portable',
  '--config.appId=com.aionui.app.keyboard-shortcuts',
  '--config.productName=AionUiKeyboardShortcuts',
  '--config.executableName=AionUiKeyboardShortcuts',
  '--config.portable.artifactName=${productName}-keyboard-shortcuts-${version}-${os}-${arch}-portable.${ext}',
];

if (!hasArchArg) {
  args.push('--x64');
}

args.push(...userArgs);

const result = spawnSync(process.execPath, args, {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
