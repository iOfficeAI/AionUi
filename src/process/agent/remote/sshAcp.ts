/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteAgentConfig } from './types';

export const SSH_ACP_PROTOCOL = 'ssh-acp' as const;

export type SshAcpLaunch = {
  command: 'ssh';
  args: string[];
  remoteCommand: string;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseSshUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'ssh:') {
    throw new Error(`Unsupported SSH remote URL protocol: ${parsed.protocol}`);
  }
  if (!parsed.hostname) {
    throw new Error('SSH remote URL must include a host');
  }
  return parsed;
}

function getSshTarget(parsed: URL): string {
  const user = parsed.username ? `${decodeURIComponent(parsed.username)}@` : '';
  return `${user}${parsed.hostname}`;
}

function getRemoteCommand(parsed: URL): string {
  const command = parsed.searchParams.get('command')?.trim();
  if (!command) {
    throw new Error('SSH remote agent URL must include a command query parameter');
  }
  const cwd = decodeURIComponent(parsed.pathname || '').replace(/\/+$/, '');
  if (!cwd) return command;
  return `cd ${shellQuote(cwd)} && ${command}`;
}

function getIdentityArgs(config: RemoteAgentConfig): string[] {
  if (config.authType !== 'bearer' || !config.authToken?.trim()) return [];
  return ['-i', config.authToken.trim()];
}

export function isSshAcpRemoteAgent(config: RemoteAgentConfig): boolean {
  return config.protocol === SSH_ACP_PROTOCOL;
}

export function buildSshAcpLaunch(config: RemoteAgentConfig): SshAcpLaunch {
  const parsed = parseSshUrl(config.url);
  const args = ['-T', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', ...getIdentityArgs(config)];
  if (parsed.port) {
    args.push('-p', parsed.port);
  }
  const remoteCommand = getRemoteCommand(parsed);
  args.push(getSshTarget(parsed), remoteCommand);
  return { command: 'ssh', args, remoteCommand };
}

export function buildSshAcpConnectionTestArgs(
  config: Pick<RemoteAgentConfig, 'url' | 'authType' | 'authToken'>
): string[] {
  const parsed = parseSshUrl(config.url);
  const args = [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    ...getIdentityArgs(config as RemoteAgentConfig),
  ];
  if (parsed.port) {
    args.push('-p', parsed.port);
  }
  args.push(getSshTarget(parsed), 'printf ok');
  return args;
}
