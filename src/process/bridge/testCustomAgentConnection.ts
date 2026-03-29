/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Two-step connection test for custom ACP agents:
 * 1. Verify CLI command exists (which/where)
 * 2. Spawn CLI and send ACP initialize request
 */
import { execFileSync } from 'child_process';
import { AcpConnection } from '@process/agent/acp/AcpConnection';
import * as os from 'os';

type TestResult = {
  success: boolean;
  msg?: string;
  data?: { step: 'cli_check' | 'acp_initialize'; error?: string };
};

export async function testCustomAgentConnection(params: {
  command: string;
  acpArgs?: string[];
  env?: Record<string, string>;
}): Promise<TestResult> {
  const { command, acpArgs, env } = params;

  // Step 1: Check if CLI command exists
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const baseCommand = command.split(' ')[0];

  try {
    execFileSync(whichCmd, [baseCommand], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch {
    return {
      success: false,
      msg: `Command "${baseCommand}" not found. Make sure it is installed and in your PATH.`,
      data: { step: 'cli_check', error: `Command not found: ${baseCommand}` },
    };
  }

  // Step 2: Spawn CLI and send ACP initialize
  const connection = new AcpConnection();
  const tempDir = os.tmpdir();

  try {
    await connection.connect('custom', command, tempDir, acpArgs, env);
    await connection.disconnect();
    return {
      success: true,
      msg: 'Connection successful',
      data: { step: 'acp_initialize' },
    };
  } catch (error) {
    try {
      await connection.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      msg: `ACP initialize failed: ${errorMsg}`,
      data: { step: 'acp_initialize', error: errorMsg },
    };
  }
}
