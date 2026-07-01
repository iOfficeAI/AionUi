import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const removeRegistry = readFileSync('resources/windows/installer-remove-registry.nsh', 'utf8');
const x64Entry = readFileSync('resources/windows/windows-installer-x64.nsh', 'utf8');
const arm64Entry = readFileSync('resources/windows/windows-installer-arm64.nsh', 'utf8');

describe('Windows NSIS resilient install-dir removal', () => {
  it('preserves the atomic failure boundary separately from residual delete failures', () => {
    expect(removeRegistry).toContain('Var /GLOBAL AionUiAtomicFailedPath');
    expect(removeRegistry).toContain('Var /GLOBAL AionUiAtomicRemoveSucceeded');
    expect(removeRegistry).toContain('StrCpy $AionUiAtomicRemoveSucceeded "0"');
    expect(removeRegistry).toContain('StrCpy $AionUiAtomicRemoveSucceeded "1"');
    expect(removeRegistry).toContain('Var /GLOBAL AionUiRemoveResidueCount');
    expect(removeRegistry).toContain('removeDirResult=$AionUiRemoveDirResult');
    expect(removeRegistry).toContain('removeResidueCount=$AionUiRemoveResidueCount');
    expect(removeRegistry).toContain('atomicFailedPath=$AionUiAtomicFailedPath');
  });

  it('degrades residual delete failures only after atomic removal succeeded', () => {
    const residualBranch = removeRegistry.slice(
      removeRegistry.indexOf('$AionUiAtomicRemoveSucceeded == "1"'),
      removeRegistry.indexOf('!insertmacro AIONUI_LOG_EVENT "remove-final')
    );

    expect(residualBranch).toContain('phase=residual-delete-failed');
    expect(residualBranch).toContain('degraded=continue');
    expect(residualBranch).toContain('fatal=0');
    expect(residualBranch).not.toContain('Quit');
    expect(residualBranch).not.toContain('SetErrorLevel');
  });

  it('fails residual delete errors when there is no atomic success proof', () => {
    const noProofBranch = removeRegistry.slice(
      removeRegistry.indexOf('phase=residual-delete-failed-no-atomic-proof'),
      removeRegistry.indexOf('!insertmacro AIONUI_LOG_EVENT "remove-final')
    );

    expect(noProofBranch).toContain('fatal=1');
    expect(noProofBranch).toContain('degraded=none');
    expect(noProofBranch).toContain('!insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"');
    expect(noProofBranch).toContain('!insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
    expect(noProofBranch).not.toContain('degraded=continue');
  });

  it('treats atomic removal failure as fatal and clears registry before quitting', () => {
    const fatalBranch = removeRegistry.slice(
      removeRegistry.indexOf('phase=atomic-failed'),
      removeRegistry.indexOf('!macro customUnInit')
    );

    expect(fatalBranch).toContain('fatal=1');
    expect(fatalBranch).toContain('!insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"');
    expect(fatalBranch).toContain('!insertmacro AIONUI_FAIL');
    expect(fatalBranch).toContain('${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
  });

  it('has long-path PowerShell deletion retries and an RMDir fallback', () => {
    expect(removeRegistry).toContain('200,500,1000');
    expect(removeRegistry).toContain('remove-resilient-leftover');
    expect(removeRegistry).toContain('remove-resilient-summary');
    expect(removeRegistry).toContain('fallback=RMDir');
    expect(removeRegistry).toContain('RMDir /r "$INSTDIR"');
  });

  it('defines shared remove macros only in the common remove include', () => {
    expect(removeRegistry).toMatch(/!macro\s+AIONUI_REMOVE_INSTALL_DIR\b/);
    expect(x64Entry).not.toMatch(/!macro\s+AIONUI_REMOVE_INSTALL_DIR\b/);
    expect(arm64Entry).not.toMatch(/!macro\s+AIONUI_REMOVE_INSTALL_DIR\b/);
  });
});
