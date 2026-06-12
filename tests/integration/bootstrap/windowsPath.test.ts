import { describe, expect, it } from 'vitest';
import { buildWindowsHydratedPath, parseWindowsRegistryPathOutput } from '@/process/startup/windowsPath';

describe('parseWindowsRegistryPathOutput', () => {
  it('extracts and expands the Path value from reg.exe output', () => {
    const output = `

HKEY_CURRENT_USER\\Environment
    Path    REG_EXPAND_SZ    D:\\AgentBin;%USERPROFILE%\\AppData\\Roaming\\npm
`;

    expect(
      parseWindowsRegistryPathOutput(output, {
        USERPROFILE: 'C:\\Users\\zhoukai',
      })
    ).toEqual(['D:\\AgentBin', 'C:\\Users\\zhoukai\\AppData\\Roaming\\npm']);
  });

  it('returns an empty list when reg.exe does not return a Path value', () => {
    const output = `

HKEY_CURRENT_USER\\Environment
    TEMP    REG_SZ    C:\\Temp
`;

    expect(parseWindowsRegistryPathOutput(output, {})).toEqual([]);
  });
});

describe('buildWindowsHydratedPath', () => {
  it('merges missing user and machine registry paths into the current process PATH', () => {
    const hydrated = buildWindowsHydratedPath({
      currentPath: 'C:\\Windows\\System32;C:\\Users\\zhoukai\\AppData\\Roaming\\npm',
      userRegistryOutput: `

HKEY_CURRENT_USER\\Environment
    Path    REG_EXPAND_SZ    D:\\AgentBin;%USERPROFILE%\\AppData\\Roaming\\npm
`,
      machineRegistryOutput: `

HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment
    Path    REG_EXPAND_SZ    C:\\Program Files\\Git\\cmd;C:\\Windows\\System32
`,
      env: {
        USERPROFILE: 'C:\\Users\\zhoukai',
      },
    });

    expect(hydrated).toBe(
      'C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;D:\\AgentBin;C:\\Users\\zhoukai\\AppData\\Roaming\\npm'
    );
  });
});
