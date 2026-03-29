import { readFileSync } from 'fs';
import { homedir } from 'os';
import { posix, win32 } from 'path';
import type { CodexSandboxMode } from './codexConfig';

export type CodexLaunchOptions = {
  yoloMode?: boolean;
  sandboxMode?: CodexSandboxMode;
};

const isWindowsStylePath = (value: string): boolean => /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

const joinCodexConfigPath = (baseDirectory: string): string => {
  const pathApi = process.platform === 'win32' || isWindowsStylePath(baseDirectory) ? win32 : posix;
  return pathApi.join(baseDirectory, 'config.toml');
};

export function getCodexConfigPath(env: NodeJS.ProcessEnv = process.env, homeDirectory: string = homedir()): string {
  const codexHome = env.CODEX_HOME?.trim();
  if (codexHome) {
    return joinCodexConfigPath(codexHome);
  }

  const pathApi = process.platform === 'win32' || isWindowsStylePath(homeDirectory) ? win32 : posix;
  return pathApi.join(homeDirectory, '.codex', 'config.toml');
}

export function parseCodexApprovalPolicy(content: string): string | null {
  const match = content.match(/^\s*approval_policy\s*=\s*['"]?([^'"#\s]+)['"]?/m);
  return match?.[1] ?? null;
}

export function readUserApprovalPolicyConfig(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const configPath = getCodexConfigPath(env);
    const content = readFileSync(configPath, 'utf-8');
    return parseCodexApprovalPolicy(content);
  } catch {
    return null;
  }
}

export function applyCodexLaunchOptions(
  baseArgs: string[],
  options: CodexLaunchOptions = {},
  userApprovalPolicy: string | null = null
): string[] {
  let finalArgs = [...baseArgs];

  if (options.yoloMode) {
    finalArgs = [...finalArgs, '-c', 'approval_policy=never'];
  } else if (userApprovalPolicy && userApprovalPolicy !== 'never') {
    finalArgs = [...finalArgs, '-c', `approval_policy=${userApprovalPolicy}`];
  }

  if (options.sandboxMode) {
    finalArgs = [...finalArgs, '-c', `sandbox_mode="${options.sandboxMode}"`];
  }

  return finalArgs;
}
