import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsResourcesDir = 'resources/windows';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function countOccurrences(content: string, needle: string) {
  return content.split(needle).length - 1;
}

const removeRegistry = read(join(windowsResourcesDir, 'installer-remove-registry.nsh'));
const repairHeal = read(join(windowsResourcesDir, 'installer-repair-heal.nsh'));
const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
const updaterService = read('packages/desktop/src/process/services/autoUpdaterService.ts');

describe('Windows NSIS deadlock recovery', () => {
  it('defines registry cleanup for both install and uninstall keys', () => {
    expect(removeRegistry).toContain('!macro AIONUI_CLEAR_INSTALL_REGISTRY');
    expect(removeRegistry).toContain('DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"');
    expect(removeRegistry).toContain('DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"');
    expect(removeRegistry).toContain('event=registry-clear reason=${_REASON}');
  });

  it('clears registry before fatal remove failures and reports with user consent', () => {
    const failIndex = removeRegistry.indexOf('AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
    const clearIndex = removeRegistry.lastIndexOf('AIONUI_CLEAR_INSTALL_REGISTRY', failIndex);

    expect(failIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeLessThan(failIndex);
    expect(countOccurrences(removeRegistry, 'AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"')).toBeGreaterThanOrEqual(1);
    expect(removeRegistry).not.toContain('AIONUI_LOG_EVENT "event=registry-clear reason=remove-failed-before-quit"');
  });

  it('keeps residual delete degradation behind atomic success proof', () => {
    const noProofIndex = removeRegistry.indexOf('phase=residual-delete-failed-no-atomic-proof');
    const degradedIndex = removeRegistry.indexOf('phase=residual-delete-failed degraded=continue');
    const successGuardIndex = removeRegistry.lastIndexOf('AionUiAtomicRemoveSucceeded == "1"', degradedIndex);

    expect(removeRegistry).toContain('StrCpy $AionUiAtomicRemoveSucceeded "0"');
    expect(removeRegistry).toContain('StrCpy $AionUiAtomicRemoveSucceeded "1"');
    expect(successGuardIndex).toBeGreaterThanOrEqual(0);
    expect(noProofIndex).toBeGreaterThan(degradedIndex);
    expect(removeRegistry.slice(noProofIndex)).toContain('AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
  });

  it('makes explicit user-triggered update installs non-silent while preserving app-quit auto install', () => {
    expect(updaterService).toContain('autoUpdater.quitAndInstall(false, true)');
    expect(updaterService).toContain('autoUpdater.autoInstallOnAppQuit = true');
  });

  it('keeps valid drive-bound install locations and heals invalid ones before old uninstall', () => {
    const customInitIndex = repairHeal.indexOf('!macro customInit');
    const healIndex = repairHeal.indexOf('AIONUI_HEAL_INSTALL_REGISTRY', customInitIndex);
    const repairIndex = repairHeal.indexOf('AIONUI_REPAIR_INSTALLED_UNINSTALLER', customInitIndex);

    expect(healIndex).toBeGreaterThan(customInitIndex);
    expect(repairIndex).toBeGreaterThan(healIndex);
    expect(repairHeal).toContain('phase=valid-install-location');
    expect(repairHeal).toContain('phase=stale-install-location');
    expect(repairHeal).not.toMatch(/installDirectory|\/D=/i);
  });

  it('diagnoses reentry without allowing a second instance to write the install directory', () => {
    expect(updateVerify).toContain('event=installer-reentry');
    expect(updateVerify).toContain('already running');
    expect(updateVerify).toContain('Abort');
    expect(updateVerify).not.toMatch(/ClearErrors\s+.*ALLOW_ONLY_ONE_INSTALLER_INSTANCE/s);
  });
});
