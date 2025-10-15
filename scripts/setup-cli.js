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

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║     🚀 AionUi Development Environment Setup           ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

try {
  // 1. Ensure CLI file has executable permission (Unix-like systems)
  if (process.platform !== 'win32') {
    console.log('[1/3] Setting executable permission for CLI...');
    fs.chmodSync(CLI_PATH, 0o755);
    console.log('      ✓ Executable permission set');
  } else {
    console.log('[1/3] Checking CLI file...');
    console.log('      ✓ CLI file ready (Windows)');
  }

  // 2. Rebuild better-sqlite3 for Electron (optional, skip on errors)
  console.log('\n[2/3] Rebuilding native modules for Electron...');
  try {
    execSync('npx electron-rebuild -f -w better-sqlite3', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
    console.log('      ✓ better-sqlite3 rebuilt successfully');
  } catch (error) {
    console.log('      ⚠ Skipped rebuild (optional step)');
    console.log('      ℹ Native modules will be rebuilt when you start the app');
  }

  // 3. Link CLI globally (optional, only in dev environment)
  // Skip npm link in CI or if NODE_ENV=production
  const isDevEnvironment = !process.env.CI && process.env.NODE_ENV !== 'production';

  console.log('\n[3/3] Setting up CLI command...');
  if (isDevEnvironment) {
    try {
      execSync('npm link', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
      console.log('      ✓ CLI linked globally');
      console.log('      ℹ You can now use "aionui" command anywhere');
    } catch (error) {
      console.log('      ⚠ Skipped global link (optional)');
      console.log('      ℹ Run "npm link" manually if you want global access');
    }
  } else {
    console.log('      ℹ Skipped (CI/production environment)');
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     ✅ Setup Complete!                                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📋 Next steps:\n');
  console.log('  Option 1 (GUI): npm run start:webui');
  console.log('  Option 2 (CLI): aionui\n');

  console.log('📚 For more information, see: docs/DEVELOPMENT.md\n');

} catch (error) {
  console.error('\n❌ Setup encountered an error:', error.message);
  console.error('\n💡 This is usually fine! You can:');
  console.error('   1. Ignore and run: npm run start:webui');
  console.error('   2. Or rebuild manually: npx electron-rebuild -f -w better-sqlite3\n');
  // Don't exit with error code to prevent npm install from failing
  process.exit(0);
}
