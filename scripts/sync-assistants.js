#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sync Assistant Files Utility
 *
 * This script syncs assistant files from the source directory (assistant/)
 * to the Application Support directory, ensuring all subdirectories (including swarm/)
 * are properly copied for built-in assistants.
 *
 * Usage: node scripts/sync-assistants.js [assistant-id]
 *   - If assistant-id is provided, syncs only that assistant
 *   - If no assistant-id, syncs all built-in assistants
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Get Application Support directory
function getAppSupportDir() {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'AionUi');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'AionUi');
  } else {
    return path.join(os.homedir(), '.config', 'AionUi');
  }
}

// Recursively copy directory
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Sync a single assistant
function syncAssistant(assistantId, sourceDir, targetDir) {
  const sourcePath = path.join(sourceDir, assistantId);
  const targetPath = path.join(targetDir, `builtin-${assistantId}`);

  if (!fs.existsSync(sourcePath)) {
    console.error(`[Error] Source assistant not found: ${sourcePath}`);
    return false;
  }

  console.log(`[Sync] Syncing ${assistantId}...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Target: ${targetPath}`);

  try {
    copyDirectoryRecursive(sourcePath, targetPath);
    console.log(`  ✓ Synced successfully`);
    return true;
  } catch (error) {
    console.error(`  ✗ Sync failed:`, error.message);
    return false;
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const assistantId = args[0];

  const projectRoot = path.resolve(__dirname, '..');
  const sourceDir = path.join(projectRoot, 'assistant');
  const targetDir = path.join(getAppSupportDir(), 'config', 'assistants');

  console.log('[Sync] Assistant Files Sync Utility');
  console.log(`[Sync] Source: ${sourceDir}`);
  console.log(`[Sync] Target: ${targetDir}`);
  console.log('');

  if (!fs.existsSync(sourceDir)) {
    console.error(`[Error] Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(targetDir)) {
    console.log(`[Sync] Creating target directory: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (assistantId) {
    // Sync single assistant
    const success = syncAssistant(assistantId, sourceDir, targetDir);
    process.exit(success ? 0 : 1);
  } else {
    // Sync all assistants
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    const assistantDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

    console.log(`[Sync] Found ${assistantDirs.length} assistants to sync\n`);

    let successCount = 0;
    for (const dir of assistantDirs) {
      if (syncAssistant(dir.name, sourceDir, targetDir)) {
        successCount++;
      }
    }

    console.log('');
    console.log(`[Sync] Completed: ${successCount}/${assistantDirs.length} assistants synced`);
    process.exit(successCount === assistantDirs.length ? 0 : 1);
  }
}

main();
