/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  const platform = process.platform;
  const checkCmd = platform === 'win32' ? `where ${command}` : `which ${command}`;

  try {
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a Chrome executable is available.
 */
async function isChromeInstalled(): Promise<boolean> {
  if (await commandExists('google-chrome')) {
    return true;
  }
  if (await commandExists('google-chrome-stable')) {
    return true;
  }
  if (await commandExists('chromium')) {
    return true;
  }
  if (await commandExists('chromium-browser')) {
    return true;
  }

  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    possiblePaths.push('/Applications/chrome/Google Chrome.app/Contents/MacOS/Google Chrome');
    possiblePaths.push('/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary');
  } else {
    possiblePaths.push('/usr/bin/google-chrome');
    possiblePaths.push('/usr/bin/google-chrome-stable');
    possiblePaths.push('/usr/bin/chromium');
    possiblePaths.push('/usr/bin/chromium-browser');
    possiblePaths.push('/opt/google/chrome/chrome');
    possiblePaths.push('/snap/bin/chromium');
  }

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Find the Chrome executable path.
 */
async function findChromeExecutable(): Promise<string | null> {
  const platform = process.platform;

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];
    const possiblePaths: string[] = [];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      possiblePaths.push(path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'));
    }

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }

  if (platform === 'darwin') {
    const possiblePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/chrome/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }

  const possibleCommands = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const command of possibleCommands) {
    if (await commandExists(command)) {
      return command;
    }
  }

  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
  ];
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

/**
 * Open a blank Chrome tab using the user's installed Chrome profile.
 */
async function openChromeBlankTab(): Promise<void> {
  const chromePath = await findChromeExecutable();
  if (!chromePath) {
    await shell.openExternal('about:blank');
    return;
  }

  const child = spawn(chromePath, ['--new-tab', 'about:blank'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  child.on('error', async () => {
    await shell.openExternal('about:blank');
  });
}

/**
 * Check if VS Code is installed
 */
async function isVSCodeInstalled(): Promise<boolean> {
  // First check if 'code' command exists
  if (await commandExists('code')) {
    return true;
  }

  // Check common installation paths
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
    possiblePaths.push('/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code');
  } else {
    // Linux
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Open folder with specified tool
 */
async function openFolderWithTool(
  folderPath: string,
  tool: 'vscode' | 'terminal' | 'explorer' | 'chrome'
): Promise<void> {
  const platform = process.platform;

  switch (tool) {
    case 'vscode': {
      const vsChild = spawn('code', [folderPath], { detached: true, stdio: 'ignore' });
      vsChild.unref();
      vsChild.on('error', async () => {
        const codePath = await findVSCodeExecutable();
        if (codePath) {
          // On Windows, .cmd/.bat files must be spawned with shell: true
          const useShell = platform === 'win32' && /\.(cmd|bat)$/i.test(codePath);
          const fallback = spawn(codePath, [folderPath], { detached: true, stdio: 'ignore', shell: useShell });
          fallback.unref();
          fallback.on('error', () => {
            shell.openPath(folderPath).catch(() => {});
          });
        } else {
          await shell.openPath(folderPath);
        }
      });
      break;
    }

    case 'terminal': {
      if (platform === 'win32') {
        // Windows: Use PowerShell via cmd /c start
        // Using 'start' command ensures PowerShell opens in a visible window
        const child = spawn(
          'cmd.exe',
          [
            '/c',
            'start',
            'powershell.exe',
            '-NoExit',
            '-Command',
            `Set-Location -LiteralPath '${folderPath.replace(/'/g, "''")}'`,
          ],
          {
            detached: true,
            windowsHide: false,
          }
        );
        child.on('error', (err) => {
          console.error('[shellBridge] Failed to spawn PowerShell:', err);
        });
        child.unref();
      } else if (platform === 'darwin') {
        // macOS: Open Terminal
        const child = spawn('open', ['-a', 'Terminal', folderPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } else {
        // Linux: Try common terminal emulators
        const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'terminator'];
        let opened = false;

        for (const term of terminals) {
          if (await commandExists(term)) {
            const args = term === 'gnome-terminal' ? [`--working-directory=${folderPath}`] : [folderPath];
            const child = spawn(term, args, { detached: true, stdio: 'ignore' });
            child.unref();
            opened = true;
            break;
          }
        }

        if (!opened) {
          // Fallback to xdg-open
          await shell.openPath(folderPath);
        }
      }
      break;
    }

    case 'chrome': {
      await openChromeBlankTab();
      break;
    }

    case 'explorer':
    default: {
      // Open in file explorer/finder
      if (platform === 'darwin') {
        spawn('open', [folderPath], { detached: true, stdio: 'ignore' });
      } else if (platform === 'linux') {
        spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' });
      } else {
        // Windows and fallback
        await shell.openPath(folderPath);
      }
      break;
    }
  }
}

/**
 * Find VS Code executable path
 */
async function findVSCodeExecutable(): Promise<string | null> {
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
  } else {
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return codePath;
    }
  }

  return null;
}

export function initShellBridge(): void {
  ipcBridge.shell.openFile.provider(async (path) => {
    try {
      const errorMessage = await shell.openPath(path);
      if (errorMessage) {
        console.warn(`[shellBridge] Failed to open path: ${errorMessage}`);
      }
    } catch (error) {
      console.warn(`[shellBridge] Failed to open path:`, (error as Error).message);
    }
  });

  ipcBridge.shell.showItemInFolder.provider((path) => {
    shell.showItemInFolder(path);
    return Promise.resolve();
  });

  ipcBridge.shell.openExternal.provider(async (url) => {
    try {
      new URL(url);
    } catch {
      console.warn(`[shellBridge] Invalid URL passed to openExternal: ${url}`);
      return;
    }
    try {
      await shell.openExternal(url);
    } catch (error) {
      console.warn(`[shellBridge] Failed to open external URL: ${url}`, (error as Error).message);
    }
  });

  // Check if a tool is installed
  ipcBridge.shell.checkToolInstalled.provider(async ({ tool }) => {
    switch (tool) {
      case 'vscode':
        return isVSCodeInstalled();
      case 'chrome':
        return isChromeInstalled();
      case 'terminal': {
        if (process.platform === 'win32') {
          // On Windows, PowerShell is always available (or fallback to CMD)
          return true;
        }
        // Terminal is always available on macOS and Linux
        return true;
      }
      case 'explorer':
        // File explorer is always available
        return true;
      default:
        return false;
    }
  });

  // Open folder with specified tool
  ipcBridge.shell.openFolderWith.provider(async ({ folderPath, tool }) => {
    try {
      await openFolderWithTool(folderPath, tool);
    } catch (error) {
      console.error(`[shellBridge] Failed to open folder with ${tool}:`, error);
      // Fallback to default shell open
      await shell.openPath(folderPath);
    }
  });
}
