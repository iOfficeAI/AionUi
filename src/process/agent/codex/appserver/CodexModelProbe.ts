/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/acpTypes';
import { CodexAppServerClient } from './CodexAppServerClient';
import { CodexModelService } from './CodexModelService';

type CodexModelProbeClient = Pick<CodexAppServerClient, 'start' | 'request' | 'dispose'>;

type CodexModelProbeOptions = {
  command: string;
  args?: string[];
  cwd: string;
  currentModelId?: string;
};

type CodexModelProbeClientFactory = (options: {
  command: string;
  args: string[];
  cwd: string;
}) => CodexModelProbeClient;

const createCodexModelProbeClient: CodexModelProbeClientFactory = (options) => new CodexAppServerClient(options);

/** Load the account-scoped model catalog without creating a Codex thread. */
export async function probeCodexModelInfo(
  options: CodexModelProbeOptions,
  createClient: CodexModelProbeClientFactory = createCodexModelProbeClient
): Promise<AcpModelInfo> {
  const client = createClient({
    command: options.command,
    args: options.args ?? ['app-server'],
    cwd: options.cwd,
  });
  const modelService = new CodexModelService(client, options.currentModelId);

  try {
    await client.start();
    return await modelService.refresh();
  } finally {
    await client.dispose();
  }
}
