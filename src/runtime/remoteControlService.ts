/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import '@/adapter/headless';
import { cleanupWebAdapter } from '@/webserver/adapter';
import { SERVER_CONFIG } from '@/webserver/config/constants';
import { startWebServerWithInstance } from '@/webserver/index';
import { bootstrapRuntimeCore } from './bootstrap';

const hasSwitch = (flag: string): boolean => {
  return process.argv.includes(`--${flag}`);
};

const getSwitchValue = (flag: string): string | undefined => {
  const withEqualsPrefix = `--${flag}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(withEqualsPrefix));
  if (equalsArg) {
    return equalsArg.slice(withEqualsPrefix.length);
  }

  const argIndex = process.argv.indexOf(`--${flag}`);
  if (argIndex !== -1) {
    const nextArg = process.argv[argIndex + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      return nextArg;
    }
  }

  return undefined;
};

const parsePortValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const portNumber = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }
  return portNumber;
};

const parseBooleanEnv = (value?: string): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const resolveRemoteAccess = (): boolean => {
  const envRemote = parseBooleanEnv(process.env.AIONUI_ALLOW_REMOTE || process.env.AIONUI_REMOTE);
  const hostHint = process.env.AIONUI_HOST?.trim();
  const hostRequestsRemote = hostHint ? ['0.0.0.0', '::', '::0'].includes(hostHint) : false;

  return hasSwitch('remote') || hostRequestsRemote || envRemote === true;
};

const resolvePort = (): number => {
  const cliPort = parsePortValue(getSwitchValue('port') ?? getSwitchValue('webui-port'));
  if (cliPort) return cliPort;

  const envPort = parsePortValue(process.env.AIONUI_PORT ?? process.env.PORT);
  if (envPort) return envPort;

  return SERVER_CONFIG.DEFAULT_PORT;
};

let shuttingDown = false;

async function main(): Promise<void> {
  await bootstrapRuntimeCore();

  const port = resolvePort();
  const allowRemote = resolveRemoteAccess();
  const instance = await startWebServerWithInstance(port, allowRemote);

  console.log(`[RemoteControlService] started on port=${instance.port}, allowRemote=${instance.allowRemote}`);

  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[RemoteControlService] ${signal} received, shutting down...`);

    instance.wss.clients.forEach((client) => {
      client.close(1000, 'Service shutting down');
    });

    await new Promise<void>((resolve) => {
      instance.server.close(() => resolve());
      setTimeout(resolve, 2000);
    });

    cleanupWebAdapter();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
}

void main().catch((error) => {
  console.error('[RemoteControlService] startup failed:', error);
  process.exit(1);
});
