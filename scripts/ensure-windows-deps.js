#!/usr/bin/env node
/**
 * Ensure Windows-specific build prerequisites (Python + VS Build Tools) before running Electron dev server.
 * 非 Windows 平台直接跳过；Windows 平台会自动安装 Python 和 VS Build Tools。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Allow advanced users/CI to skip the automatic check via env flag.
// 允许高级用户或 CI 通过环境变量跳过自动检查
const SKIP_ENV = process.env.AIONUI_SKIP_WIN_SETUP;

if (process.platform !== 'win32' || SKIP_ENV === '1') {
  process.exit(0);
}

// PowerShell helper that performs the heavy lifting (install Python / VS Build Tools)
// 执行实际安装逻辑的 PowerShell 脚本
const psScriptPath = path.resolve(__dirname, 'setup-windows-deps.ps1');
if (!fs.existsSync(psScriptPath)) {
  console.warn('[win-setup] Required script not found:', psScriptPath);
  process.exit(0);
}

console.log('[win-setup] Ensuring Windows prerequisites (Python + Build Tools)...');
const result = spawnSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', psScriptPath, '-SkipNpmInstall'], {
  // Attach to parent stdio so user can see progress / elevation prompts
  // 继承父进程的标准输入输出，确保用户能看到安装过程或权限提示
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('\n[win-setup] Failed to install prerequisites. Please re-run PowerShell as administrator and execute:');
  console.error(`  powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`);
  console.error('Or set AIONUI_SKIP_WIN_SETUP=1 to skip automatic checks.');
  process.exit(result.status || 1);
}

console.log('[win-setup] Windows prerequisites satisfied.');
