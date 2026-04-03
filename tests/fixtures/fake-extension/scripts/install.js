#!/usr/bin/env node
/**
 * onInstall lifecycle hook for the fake ACP extension.
 *
 * Simulates `bun add -g` by making the fake-acp-cli available in a temporary
 * bin directory. On Unix, creates a symlink. On Windows, writes a .cmd wrapper
 * script (symlinks require admin privileges on Windows).
 *
 * Compatible with lifecycleRunner.ts which does:
 *   const mod = require(scriptPath);
 *   const hookFn = mod.default || mod[hookName] || mod;
 *   hookFn(context);
 *
 * Receives context: { extensionName, extensionDir, version }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WINDOWS = process.platform === 'win32';

/**
 * @param {{ extensionName: string; extensionDir: string; version: string }} context
 */
function onInstall(context) {
  const extensionDir = context.extensionDir;

  // The fake-acp-cli/index.js lives alongside this extension in the fixtures dir
  const fakeCliSource = path.resolve(extensionDir, '..', 'fake-acp-cli', 'index.js');

  // Create a temp bin directory
  const binDir = path.join(os.tmpdir(), 'fake-acp-bin');
  fs.mkdirSync(binDir, { recursive: true });

  if (IS_WINDOWS) {
    // Windows: write a .cmd wrapper that invokes node with the CLI script
    const cmdPath = path.join(binDir, 'fake-acp-cli.cmd');
    const cmdContent = `@echo off\r\nnode "${fakeCliSource}" %*\r\n`;
    fs.writeFileSync(cmdPath, cmdContent, 'utf-8');

    // Also write a marker file so tests can resolve the real CLI path
    const markerPath = path.join(binDir, 'fake-acp-cli.target');
    fs.writeFileSync(markerPath, fakeCliSource, 'utf-8');

    console.log(`[fake-extension install] Created wrapper ${cmdPath} -> ${fakeCliSource}`);
  } else {
    // Unix: symlink
    const symlinkTarget = path.join(binDir, 'fake-acp-cli');

    // Remove existing symlink if present
    try {
      fs.unlinkSync(symlinkTarget);
    } catch {
      // ignore
    }

    fs.symlinkSync(fakeCliSource, symlinkTarget);
    fs.chmodSync(symlinkTarget, 0o755);

    console.log(`[fake-extension install] Symlinked ${symlinkTarget} -> ${fakeCliSource}`);
  }
}

module.exports = onInstall;
module.exports.onInstall = onInstall;
