/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getWindowsStartOnBootEnabled,
  setWindowsStartOnBootEnabled,
  type RegistryCommandRunner,
} from '@/process/services/StartOnBootService';
import { describe, expect, it, vi } from 'vitest';

const EXECUTABLE_PATH = 'E:\\Program Files\\csbuwork\\CSBU WorkMate\\CSBU WorkMate.exe';
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

const result = (exitCode: number, stdout = '') => ({ exitCode, stdout, stderr: '' });

describe('Windows start-on-boot service', () => {
  it('reports enabled when the current executable is registered under the primary value', async () => {
    const runCommand = vi
      .fn<RegistryCommandRunner>()
      .mockResolvedValue(result(0, `    CSBU WorkMate    REG_SZ    "${EXECUTABLE_PATH}" --start-on-boot`));

    await expect(getWindowsStartOnBootEnabled(EXECUTABLE_PATH, runCommand)).resolves.toBe(true);
    expect(runCommand).toHaveBeenCalledWith(['query', RUN_KEY, '/v', 'CSBU WorkMate']);
  });

  it('recognizes a compatible registration created with the legacy app id', async () => {
    const runCommand = vi
      .fn<RegistryCommandRunner>()
      .mockResolvedValueOnce(result(1))
      .mockResolvedValueOnce(result(0, `    com.csbu.workmate    REG_SZ    "${EXECUTABLE_PATH}" --start-on-boot`));

    await expect(getWindowsStartOnBootEnabled(EXECUTABLE_PATH, runCommand)).resolves.toBe(true);
  });

  it('does not treat another executable as enabled', async () => {
    const runCommand = vi
      .fn<RegistryCommandRunner>()
      .mockResolvedValue(result(0, '    CSBU WorkMate    REG_SZ    "C:\\Other\\WorkMate.exe" --start-on-boot'));

    await expect(getWindowsStartOnBootEnabled(EXECUTABLE_PATH, runCommand)).resolves.toBe(false);
  });

  it('enables startup asynchronously with the current executable and startup argument', async () => {
    const runCommand = vi.fn<RegistryCommandRunner>().mockResolvedValue(result(0));

    await setWindowsStartOnBootEnabled(true, EXECUTABLE_PATH, ['--start-on-boot'], runCommand);

    expect(runCommand).toHaveBeenNthCalledWith(1, [
      'add',
      RUN_KEY,
      '/v',
      'CSBU WorkMate',
      '/t',
      'REG_SZ',
      '/d',
      `"${EXECUTABLE_PATH}" --start-on-boot`,
      '/f',
    ]);
  });

  it('removes both supported registry names when disabling startup', async () => {
    const registeredValue = `    value    REG_SZ    "${EXECUTABLE_PATH}" --start-on-boot`;
    const runCommand = vi
      .fn<RegistryCommandRunner>()
      .mockResolvedValueOnce(result(0, registeredValue))
      .mockResolvedValueOnce(result(0, registeredValue))
      .mockResolvedValueOnce(result(0))
      .mockResolvedValueOnce(result(0));

    await setWindowsStartOnBootEnabled(false, EXECUTABLE_PATH, ['--start-on-boot'], runCommand);

    expect(runCommand).toHaveBeenNthCalledWith(3, ['delete', RUN_KEY, '/v', 'CSBU WorkMate', '/f']);
    expect(runCommand).toHaveBeenNthCalledWith(4, ['delete', RUN_KEY, '/v', 'com.csbu.workmate', '/f']);
  });

  it('rejects failed registry writes without reporting a successful toggle', async () => {
    const runCommand = vi.fn<RegistryCommandRunner>().mockResolvedValue(result(5));

    await expect(setWindowsStartOnBootEnabled(true, EXECUTABLE_PATH, ['--start-on-boot'], runCommand)).rejects.toThrow(
      'Failed to enable Windows startup registration'
    );
  });

  it('propagates registry timeouts so the bridge can return a safe failure response', async () => {
    const runCommand = vi.fn<RegistryCommandRunner>().mockRejectedValue(new Error('registry command timed out'));

    await expect(getWindowsStartOnBootEnabled(EXECUTABLE_PATH, runCommand)).rejects.toThrow(
      'registry command timed out'
    );
  });
});
