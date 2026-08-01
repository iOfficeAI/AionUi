/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WINDOWS_VALUE_NAMES = ['CSBU WorkMate', 'com.csbu.workmate'] as const;
const REGISTRY_TIMEOUT_MS = 3000;
const MAX_REGISTRY_OUTPUT_BYTES = 64 * 1024;

export type RegistryCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RegistryCommandRunner = (args: readonly string[]) => Promise<RegistryCommandResult>;

const getRegExecutable = (): string => {
  return path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe');
};

export const runRegistryCommand: RegistryCommandRunner = (args) => {
  return new Promise((resolve, reject) => {
    const child = spawn(getRegExecutable(), [...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;

    const finishWithError = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const collectOutput = (current: string, chunk: Buffer): string => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_REGISTRY_OUTPUT_BYTES) {
        child.kill();
        finishWithError(new Error('Windows startup registry command produced too much output'));
        return current;
      }
      return current + chunk.toString('utf8');
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = collectOutput(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = collectOutput(stderr, chunk);
    });
    child.once('error', (error) => finishWithError(error));
    child.once('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });

    const timeout = setTimeout(() => {
      child.kill();
      finishWithError(new Error(`Windows startup registry command timed out after ${REGISTRY_TIMEOUT_MS}ms`));
    }, REGISTRY_TIMEOUT_MS);
  });
};

const commandTargetsExecutable = (stdout: string, executablePath: string): boolean => {
  return stdout.toLocaleLowerCase().includes(executablePath.toLocaleLowerCase());
};

const queryRegistryValue = async (
  valueName: string,
  executablePath: string,
  runCommand: RegistryCommandRunner
): Promise<boolean> => {
  const result = await runCommand(['query', WINDOWS_RUN_KEY, '/v', valueName]);
  if (result.exitCode !== 0) {
    return false;
  }
  return commandTargetsExecutable(result.stdout, executablePath);
};

const buildStartupCommand = (executablePath: string, startupArgs: readonly string[]): string => {
  if (executablePath.includes('"') || startupArgs.some((arg) => arg.includes('"'))) {
    throw new Error('Windows startup command contains an unsupported quote character');
  }
  return [`"${executablePath}"`, ...startupArgs].join(' ');
};

export const getWindowsStartOnBootEnabled = async (
  executablePath: string,
  runCommand: RegistryCommandRunner = runRegistryCommand
): Promise<boolean> => {
  const registrations = await Promise.all(
    WINDOWS_VALUE_NAMES.map((valueName) => queryRegistryValue(valueName, executablePath, runCommand))
  );
  return registrations.some(Boolean);
};

const deleteRegistryValues = async (
  valueNames: readonly string[],
  runCommand: RegistryCommandRunner,
  errorContext: string
): Promise<void> => {
  const results = await Promise.all(
    valueNames.map((valueName) => runCommand(['delete', WINDOWS_RUN_KEY, '/v', valueName, '/f']))
  );
  const failedResult = results.find((result) => result.exitCode !== 0);
  if (failedResult) {
    throw new Error(`${errorContext} (exit code ${failedResult.exitCode})`);
  }
};

export const setWindowsStartOnBootEnabled = async (
  enabled: boolean,
  executablePath: string,
  startupArgs: readonly string[],
  runCommand: RegistryCommandRunner = runRegistryCommand
): Promise<void> => {
  if (enabled) {
    const result = await runCommand([
      'add',
      WINDOWS_RUN_KEY,
      '/v',
      WINDOWS_VALUE_NAMES[0],
      '/t',
      'REG_SZ',
      '/d',
      buildStartupCommand(executablePath, startupArgs),
      '/f',
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to enable Windows startup registration (exit code ${result.exitCode})`);
    }

    const legacyNames = WINDOWS_VALUE_NAMES.slice(1);
    const legacyRegistrations = await Promise.all(
      legacyNames.map((legacyName) => queryRegistryValue(legacyName, executablePath, runCommand))
    );
    const registeredLegacyNames = legacyNames.filter((_, index) => legacyRegistrations[index]);
    await deleteRegistryValues(
      registeredLegacyNames,
      runCommand,
      'Failed to remove legacy Windows startup registration'
    );
    return;
  }

  const registrations = await Promise.all(
    WINDOWS_VALUE_NAMES.map((valueName) => queryRegistryValue(valueName, executablePath, runCommand))
  );
  const registeredNames = WINDOWS_VALUE_NAMES.filter((_, index) => registrations[index]);
  await deleteRegistryValues(registeredNames, runCommand, 'Failed to disable Windows startup registration');
};
