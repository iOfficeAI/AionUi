import { describe, expect, it } from 'vitest';
import { collectBackendInstallDiagnostics } from '@/process/startup/backendInstallDiagnostics';
import { appendAutoUpdateDiagnosticEvent } from '@/process/services/autoUpdateDiagnostics';

describe('collectBackendInstallDiagnostics', () => {
  it('records packaged runtime manifest and missing backend binary metadata', () => {
    const files = new Map<string, { mtimeMs: number; size: number; content?: string }>([
      ['C:\\AionUi\\resources', { mtimeMs: 1000, size: 0 }],
      ['C:\\AionUi\\resources\\bundled-aioncore\\win32-x64', { mtimeMs: 2000, size: 0 }],
      [
        'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\manifest.json',
        {
          mtimeMs: 3000,
          size: 88,
          content: JSON.stringify({
            version: 'v0.9.0',
            generatedAt: '2026-05-29T12:00:00.000Z',
            sourceType: 'download',
            files: ['aioncore.exe', 'managed-resources/'],
          }),
        },
      ],
    ]);

    const diagnostics = collectBackendInstallDiagnostics(
      {
        runtimeKey: 'win32-x64',
        binaryName: 'aioncore.exe',
        resourcesPath: 'C:\\AionUi\\resources',
        checkedBundledPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      },
      {
        appVersion: '2.1.7',
        arch: 'x64',
        execPath: 'C:\\AionUi\\AionUi.exe',
        isPackaged: true,
        platform: 'win32',
        readFile: (filePath) => files.get(filePath)?.content,
        stat: (filePath) => files.get(filePath),
      }
    );

    expect(diagnostics).toEqual({
      appVersion: '2.1.7',
      arch: 'x64',
      binaryExists: false,
      binaryName: 'aioncore.exe',
      binaryPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      bundledDirPath: 'C:\\AionUi\\resources\\bundled-aioncore',
      execPath: 'C:\\AionUi\\AionUi.exe',
      isPackaged: true,
      manifestExists: true,
      manifestFiles: ['aioncore.exe', 'managed-resources/'],
      manifestGeneratedAt: '2026-05-29T12:00:00.000Z',
      manifestPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\manifest.json',
      manifestSize: 88,
      manifestMtimeMs: 3000,
      manifestSourceType: 'download',
      manifestVersion: 'v0.9.0',
      platform: 'win32',
      resourcesDirMtimeMs: 1000,
      resourcesPath: 'C:\\AionUi\\resources',
      runtimeDirMtimeMs: 2000,
      runtimeDirPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64',
      runtimeKey: 'win32-x64',
    });
  });
});

describe('appendAutoUpdateDiagnosticEvent', () => {
  it('records macOS native updater readiness events with platform and elapsed time', () => {
    const state = appendAutoUpdateDiagnosticEvent(
      {
        currentAppVersion: '2.1.27',
        events: [],
      },
      {
        at: '2026-07-01T09:40:33.000Z',
        elapsedMs: 1234,
        platform: 'darwin',
        status: 'native-update-ready',
        version: '2.1.28',
      }
    );

    expect(state.lastEvent).toEqual({
      at: '2026-07-01T09:40:33.000Z',
      elapsedMs: 1234,
      platform: 'darwin',
      status: 'native-update-ready',
      version: '2.1.28',
    });
    expect(state.lastQuitAndInstallAt).toBeUndefined();
  });

  it('keeps recent updater events and records quitAndInstall separately', () => {
    const state = appendAutoUpdateDiagnosticEvent(
      {
        currentAppVersion: '2.1.7',
        events: [],
      },
      {
        at: '2026-05-30T08:00:00.000Z',
        status: 'downloaded',
        version: '2.1.8',
      }
    );

    const next = appendAutoUpdateDiagnosticEvent(state, {
      at: '2026-05-30T08:01:00.000Z',
      status: 'quit-and-install',
    });

    expect(next).toEqual({
      currentAppVersion: '2.1.7',
      events: [
        {
          at: '2026-05-30T08:00:00.000Z',
          status: 'downloaded',
          version: '2.1.8',
        },
        {
          at: '2026-05-30T08:01:00.000Z',
          status: 'quit-and-install',
        },
      ],
      lastEvent: {
        at: '2026-05-30T08:01:00.000Z',
        status: 'quit-and-install',
      },
      lastQuitAndInstallAt: '2026-05-30T08:01:00.000Z',
    });
  });
});
