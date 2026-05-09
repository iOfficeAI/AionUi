/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getEnhancedEnv } from '@process/utils/shellEnv';

type BootstrapState = 'already-installed' | 'installed' | 'skipped' | 'unsupported' | 'failed';

export type RecommendedCliBootstrapResult = {
  cli: 'claude' | 'openclaw' | 'hermes' | 'opencode';
  state: BootstrapState;
  reason?: string;
};

type BootstrapEnv = NodeJS.ProcessEnv;

type BootstrapDependencies = {
  isCommandAvailable?: (command: string, env: BootstrapEnv) => boolean;
  runCommand?: (command: string, args: string[], env: BootstrapEnv) => Promise<void>;
};

type InstallPlan = {
  cli: RecommendedCliBootstrapResult['cli'];
  detectCommand: string;
  buildInstallCommand: (
    env: BootstrapEnv,
    isAvailable: (command: string, env: BootstrapEnv) => boolean
  ) => { command: string; args: string[] } | null;
};

function resolveCommandOnPath(command: string, env: BootstrapEnv): string | null {
  const pathValue = env.PATH || '';
  const entries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean) : [''];

  for (const entry of entries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, process.platform === 'win32' ? `${command}${ext}` : command);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (candidate && candidate.length > 0) {
          return candidate;
        }
      } catch {
        // keep scanning PATH entries
      }
    }
  }

  return null;
}

function isCommandAvailable(command: string, env: BootstrapEnv): boolean {
  return resolveCommandOnPath(command, env) !== null;
}

function runCommand(command: string, args: string[], env: BootstrapEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', (error) => {
      reject(error);
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

function resolvePackageManager(
  env: BootstrapEnv,
  isAvailable: (command: string, env: BootstrapEnv) => boolean = isCommandAvailable
): string | null {
  if (isAvailable('bun', env)) return 'bun';
  if (isAvailable('npm', env)) return 'npm';
  return null;
}

function buildPackageInstallArgs(packageManager: string, packageName: string): string[] | null {
  if (packageManager === 'bun') {
    return ['add', '-g', packageName];
  }
  if (packageManager === 'npm') {
    return ['install', '-g', packageName];
  }
  return null;
}

function buildRecommendedInstallPlans(): InstallPlan[] {
  return [
    {
      cli: 'claude',
      detectCommand: 'claude',
      buildInstallCommand: (currentEnv, isAvailable) => {
        const manager = resolvePackageManager(currentEnv, isAvailable);
        const args = manager ? buildPackageInstallArgs(manager, '@anthropic-ai/claude-code') : null;
        return manager && args ? { command: manager, args } : null;
      },
    },
    {
      cli: 'openclaw',
      detectCommand: 'openclaw',
      buildInstallCommand: (currentEnv, isAvailable) => {
        if (process.platform === 'win32') {
          return {
            command: 'powershell',
            args: [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-Command',
              '& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard',
            ],
          };
        }
        if (!isAvailable('bash', currentEnv) || !isAvailable('curl', currentEnv)) return null;
        return {
          command: 'bash',
          args: ['-lc', 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'],
        };
      },
    },
    {
      cli: 'hermes',
      detectCommand: 'hermes',
      buildInstallCommand: (currentEnv, isAvailable) => {
        if (process.platform === 'win32') return null;
        if (!isAvailable('bash', currentEnv) || !isAvailable('curl', currentEnv)) return null;
        return {
          command: 'bash',
          args: [
            '-lc',
            'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash',
          ],
        };
      },
    },
    {
      cli: 'opencode',
      detectCommand: 'opencode',
      buildInstallCommand: (currentEnv, isAvailable) => {
        const manager = resolvePackageManager(currentEnv, isAvailable);
        const args = manager ? buildPackageInstallArgs(manager, 'opencode-ai') : null;
        return manager && args ? { command: manager, args } : null;
      },
    },
  ];
}

export async function ensureRecommendedCliBootstrap(
  customEnv?: BootstrapEnv,
  deps: BootstrapDependencies = {}
): Promise<RecommendedCliBootstrapResult[]> {
  if (process.env.AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP === '1') {
    return [
      { cli: 'claude', state: 'skipped', reason: 'bootstrap disabled by AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP' },
      { cli: 'openclaw', state: 'skipped', reason: 'bootstrap disabled by AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP' },
      { cli: 'hermes', state: 'skipped', reason: 'bootstrap disabled by AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP' },
      { cli: 'opencode', state: 'skipped', reason: 'bootstrap disabled by AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP' },
    ];
  }

  const env = getEnhancedEnv(customEnv);
  const resolveAvailable = deps.isCommandAvailable ?? isCommandAvailable;
  const runInstalledCommand = deps.runCommand ?? runCommand;
  const plans = buildRecommendedInstallPlans();
  const results: RecommendedCliBootstrapResult[] = [];

  for (const plan of plans) {
    if (resolveAvailable(plan.detectCommand, env)) {
      results.push({ cli: plan.cli, state: 'already-installed' });
      continue;
    }

    const installCommand = plan.buildInstallCommand(env, resolveAvailable);
    if (!installCommand) {
      results.push({
        cli: plan.cli,
        state: 'unsupported',
        reason:
          plan.cli === 'hermes'
            ? 'Hermes auto-install is only supported on macOS/Linux with bash and curl'
            : plan.cli === 'openclaw'
              ? 'No supported installer runtime found for openclaw'
              : 'No supported package manager found for auto-install',
      });
      continue;
    }

    try {
      await runInstalledCommand(installCommand.command, installCommand.args, env);
      results.push({ cli: plan.cli, state: 'installed' });
    } catch (error) {
      results.push({
        cli: plan.cli,
        state: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export function formatRecommendedCliBootstrapSummary(results: RecommendedCliBootstrapResult[]): string {
  return results
    .map((result) => {
      if (result.state === 'already-installed') return `${result.cli}=skip(installed)`;
      if (result.state === 'installed') return `${result.cli}=ok(installed)`;
      return `${result.cli}=${result.state}${result.reason ? `(${result.reason})` : ''}`;
    })
    .join(', ');
}
