import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsResourcesDir = 'resources/windows';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function macroBody(content: string, name: string) {
  const start = content.indexOf(`!macro ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = content.indexOf('!macroend', start);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}

describe('Windows NSIS uninstaller and registry healing', () => {
  it('rebuilds a missing installed uninstaller from the bundled artifact', () => {
    const repairHeal = read(join(windowsResourcesDir, 'installer-repair-heal.nsh'));

    expect(repairHeal).toContain('File "/oname=$PLUGINSDIR\\AionUi-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"');
    expect(repairHeal).toContain('phase=rebuilt');
    expect(repairHeal).not.toContain('AIONUI_LOG_UNINSTALLER_REPAIR "missing"');
    expect(repairHeal).toContain('AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED');
  });

  it('retries locked uninstaller overwrites after stopping owned app processes', () => {
    const repairHeal = read(join(windowsResourcesDir, 'installer-repair-heal.nsh'));

    expect(repairHeal).toContain('copy-failed-retry');
    expect(repairHeal).toContain('AIONUI_STOP_APP_PROCESSES');
    expect(repairHeal).toContain('Sleep 1000');
    expect(repairHeal).toContain('AIONUI_FAIL_REPORTABLE ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED}');
  });

  it('clears empty or stale registry keys and only repairs valid install locations', () => {
    const repairHeal = read(join(windowsResourcesDir, 'installer-repair-heal.nsh'));
    const removeRegistry = read(join(windowsResourcesDir, 'installer-remove-registry.nsh'));
    const healRegistry = macroBody(repairHeal, 'AIONUI_HEAL_INSTALL_REGISTRY');
    const customInit = macroBody(repairHeal, 'customInit');
    const emptyIndex = healRegistry.indexOf('phase=missing-install-location');
    const staleIndex = healRegistry.indexOf('phase=stale-install-location');

    expect(repairHeal).toContain('!macro AIONUI_HEAL_INSTALL_REGISTRY');
    expect(repairHeal).toContain('ReadRegStr');
    expect(repairHeal).toContain('InstallLocation');
    expect(repairHeal).toContain('UninstallString');
    expect(repairHeal).toContain('registry-heal');
    expect(healRegistry.indexOf('AIONUI_CLEAR_INSTALL_REGISTRY "missing-install-location"', emptyIndex)).toBeGreaterThan(emptyIndex);
    expect(healRegistry.indexOf('AIONUI_CLEAR_INSTALL_REGISTRY "stale-install-location"', staleIndex)).toBeGreaterThan(staleIndex);
    expect(healRegistry).toContain('StrCpy $AionUiRegistryInstallIsValid "1"');
    expect(customInit).toContain('${If} $AionUiRegistryInstallIsValid == "1"');
    expect(customInit).toContain('AIONUI_REPAIR_INSTALLED_UNINSTALLER');
    expect(removeRegistry).toContain('!macro AIONUI_CLEAR_INSTALL_REGISTRY');
    expect(removeRegistry).toContain('DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"');
    expect(removeRegistry).toContain('DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"');
  });
});
