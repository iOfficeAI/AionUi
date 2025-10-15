#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI Setup Script - Auto-configure development environment
 * 自动配置开发环境脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'aionui-cli.mjs');

console.log('[Setup] Configuring AionUi CLI...');

try {
  // 1. Ensure CLI file has executable permission (Unix-like systems)
  if (process.platform !== 'win32') {
    console.log('[Setup] Setting executable permission for CLI...');
    fs.chmodSync(CLI_PATH, 0o755);
    console.log('[Setup] ✓ Executable permission set');
  }

  // 2. Rebuild better-sqlite3 for Electron
  console.log('[Setup] Rebuilding better-sqlite3 for Electron...');
  try {
    execSync('npx electron-rebuild -f -w better-sqlite3', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    console.log('[Setup] ✓ better-sqlite3 rebuilt successfully');
  } catch (error) {
    console.warn('[Setup] ⚠ Failed to rebuild better-sqlite3, you may need to run manually:');
    console.warn('         npx electron-rebuild -f -w better-sqlite3');
  }

  // 3. Link CLI globally (optional, only in dev environment)
  // Skip npm link in CI or if NODE_ENV=production
  const isDevEnvironment = !process.env.CI && process.env.NODE_ENV !== 'production';

  if (isDevEnvironment) {
    console.log('[Setup] Linking CLI globally for development...');
    try {
      execSync('npm link', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe', // Suppress output to avoid clutter
      });
      console.log('[Setup] ✓ CLI linked globally, you can now use "aionui" command');
    } catch (error) {
      console.warn('[Setup] ⚠ Failed to link CLI globally (this is optional)');
      console.warn('         You can manually run: npm link');
    }
  } else {
    console.log('[Setup] ℹ Skipping global link (CI or production environment)');
  }

  console.log('\n[Setup] ✅ Setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Run "npm run start:webui" to start the application');
  console.log('  2. Or use "aionui" command in terminal for CLI interface');

} catch (error) {
  console.error('[Setup] ❌ Setup failed:', error.message);
  console.error('\nPlease run these commands manually:');
  console.error('  1. npx electron-rebuild -f -w better-sqlite3');
  console.error('  2. npm link (optional, for global CLI access)');
  process.exit(1);
}
