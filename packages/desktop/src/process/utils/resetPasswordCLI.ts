/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}OK${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}ERR${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

export function resolveResetPasswordUsername(argv: string[]): string {
  const resetPasswordIndex = argv.indexOf('--resetpass');
  if (resetPasswordIndex === -1) {
    return 'admin';
  }

  const argsAfterCommand = argv.slice(resetPasswordIndex + 1);
  return argsAfterCommand.find((arg) => !arg.startsWith('--')) || 'admin';
}

// index.ts:487 already started a backend for every mode including --resetpass,
// so we reuse __backendPort instead of spawning a short-lived one. username arg
// is advisory; backend operates on get_primary_webui_user() == system_default_user.
export async function resetPasswordCLI(username: string): Promise<void> {
  log.info(`Target user: ${username} (advisory — operates on system_default_user)`);
  const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  if (!port) {
    log.error('Backend did not start — cannot reset password');
    process.exit(1);
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/webui/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reset-password failed (${res.status}): ${body}`);
    }
    const payload = (await res.json()) as { data?: { new_password?: string } };
    const newPassword = payload.data?.new_password;
    if (!newPassword) throw new Error('reset-password returned no new_password');
    log.success('Password reset successfully.');
    log.info('New password:');
    log.highlight(newPassword);
    log.info('');
    log.warning('Please change this password after next login.');
  } catch (error) {
    log.error(error instanceof Error ? error.message : 'Password reset failed');
    process.exit(1);
  }
}
