import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildWindowsHydratedPath,
  hydrateWindowsProcessPath,
  parseWindowsProfilePathEntries,
  parseWindowsRegistryPathOutput,
} from '@/process/startup/windowsPath';

const windowsOnlyIt = process.platform === 'win32' ? it : it.skip;

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

describe('parseWindowsProfilePathEntries', () => {
  it('extracts PATH additions from PowerShell profile snippets', () => {
    const content = `
$env:Path += ';D:\\Portable\\opencode\\bin'
$env:PATH = "$env:USERPROFILE\\.local\\bin;$env:PATH"
`;

    expect(
      parseWindowsProfilePathEntries(content, {
        USERPROFILE: 'C:\\Users\\zhoukai',
      })
    ).toEqual(['D:\\Portable\\opencode\\bin', 'C:\\Users\\zhoukai\\.local\\bin']);
  });

  it('extracts PATH additions from Git Bash profile snippets', () => {
    const content = `
export PATH="$HOME/.bun/bin:/d/AgentBin:$PATH"
`;

    expect(
      parseWindowsProfilePathEntries(content, {
        HOME: 'C:\\Users\\zhoukai',
      })
    ).toEqual(['C:\\Users\\zhoukai\\.bun\\bin', 'D:\\AgentBin']);
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
      profileContents: [],
      fallbackPathEntries: [],
      env: {
        USERPROFILE: 'C:\\Users\\zhoukai',
      },
    });

    expect(hydrated).toBe(
      'C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;D:\\AgentBin;C:\\Users\\zhoukai\\AppData\\Roaming\\npm'
    );
  });

  it('merges shell profile and fallback paths when they are not in registry PATH', () => {
    const hydrated = buildWindowsHydratedPath({
      currentPath: 'C:\\Windows\\System32',
      userRegistryOutput: '',
      machineRegistryOutput: '',
      profileContents: [`$env:Path += ';D:\\Portable\\opencode\\bin'`],
      fallbackPathEntries: ['C:\\Users\\zhoukai\\AppData\\Roaming\\npm', 'D:\\Portable\\opencode\\bin'],
      env: {
        USERPROFILE: 'C:\\Users\\zhoukai',
      },
    });

    expect(hydrated).toBe(
      'D:\\Portable\\opencode\\bin;C:\\Users\\zhoukai\\AppData\\Roaming\\npm;C:\\Windows\\System32'
    );
  });

  windowsOnlyIt('hydrates PATH from real Windows profile files and existing fallback directories', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aionui-windows-path-'));
    const userProfile = path.join(root, 'User');
    const appData = path.join(userProfile, 'AppData', 'Roaming');
    const localAppData = path.join(userProfile, 'AppData', 'Local');
    const profileDir = path.join(userProfile, 'Documents', 'PowerShell');
    const profileOnlyBin = path.join(userProfile, 'portable-opencode', 'bin');
    const npmBin = path.join(appData, 'npm');
    const windowsApps = path.join(localAppData, 'Microsoft', 'WindowsApps');

    try {
      mkdirSync(profileOnlyBin, { recursive: true });
      mkdirSync(npmBin, { recursive: true });
      mkdirSync(windowsApps, { recursive: true });
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(
        path.join(profileDir, 'Microsoft.PowerShell_profile.ps1'),
        `$env:Path += ';${profileOnlyBin}'\n`,
        'utf8'
      );

      const env: NodeJS.ProcessEnv = {
        Path: 'C:\\Windows\\System32',
        USERPROFILE: userProfile,
        APPDATA: appData,
        LOCALAPPDATA: localAppData,
      };

      const hydrated = hydrateWindowsProcessPath(env);

      expect(hydrated.split(';')).toEqual(expect.arrayContaining([profileOnlyBin, npmBin, windowsApps]));
      expect(env.PATH).toBe(hydrated);
      expect(env.Path).toBe(hydrated);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
