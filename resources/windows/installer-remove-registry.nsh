!ifndef AIONUI_INSTALLER_REMOVE_REGISTRY_NSH
!define AIONUI_INSTALLER_REMOVE_REGISTRY_NSH

!macro AIONUI_CLEAR_INSTALL_REGISTRY _REASON
  DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"
  !insertmacro AIONUI_LOG_EVENT "event=registry-clear reason=${_REASON} uninstallKey=${UNINSTALL_REGISTRY_KEY} installKey=${INSTALL_REGISTRY_KEY}"
!macroend

!macro AIONUI_LOG_ATOMIC_REMOVE_FAILURE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$failed = '$AionUiAtomicFailedPath'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$PLUGINSDIR\old-install'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] remove-atomic-failed kind=' + $$kind + ' pathLength=' + $$failed.Length + ' tempCandidateLength=' + $$tempCandidate.Length + ' atomicFailedPath=' + $$failed + ' tempCandidate=' + $$tempCandidate) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro AIONUI_REMOVE_INSTALL_DIR
  StrCpy $AionUiRemoveResidueCount "0"
  StrCpy $AionUiRemoveResidueRoot "$INSTDIR"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'Continue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$path = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    function Write-InstallerLog($$message) { Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] ' + $$message) } \
    function Convert-LongPath($$itemPath) { if ($$itemPath.StartsWith('\\')) { return '\\?\UNC\' + $$itemPath.TrimStart('\') } return '\\?\' + $$itemPath } \
    function Remove-WithRetries($$item, $$isDir) { \
      $$delays = @(200,500,1000); \
      for ($$i = 0; $$i -lt $$delays.Count; $$i++) { \
        try { \
          if ($$isDir) { [System.IO.Directory]::Delete((Convert-LongPath $$item), $$false) } else { [System.IO.File]::Delete((Convert-LongPath $$item)) } \
          return $$true \
        } catch { \
          if ($$i -lt $$delays.Count - 1) { Start-Sleep -Milliseconds $$delays[$$i] } else { Write-InstallerLog ('event=remove-resilient-leftover path=' + $$item + ' attempts=3 error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); return $$false } \
        } \
      } \
      return $$false \
    } \
    try { \
      if (-not (Test-Path -LiteralPath $$path)) { Write-InstallerLog ('remove-longpath result=0 instDir=' + $$path); exit 0 } \
      $$failed = New-Object System.Collections.Generic.List[string]; \
      foreach ($$file in @(Get-ChildItem -LiteralPath $$path -Force -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) { if (-not (Remove-WithRetries $$file.FullName $$false)) { $$failed.Add($$file.FullName) } } \
      foreach ($$dir in @(Get-ChildItem -LiteralPath $$path -Force -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) { if (-not (Remove-WithRetries $$dir.FullName $$true)) { $$failed.Add($$dir.FullName) } } \
      if (-not (Remove-WithRetries $$path $$true)) { $$failed.Add($$path) } \
      Write-InstallerLog ('event=remove-resilient-summary failedCount=' + $$failed.Count + ' root=' + $$path); \
      if ($$failed.Count -gt 0) { exit $$failed.Count } \
      Write-InstallerLog ('remove-longpath result=0 instDir=' + $$path); \
      exit 0 \
    } catch { \
      Write-InstallerLog ('remove-longpath result=1 instDir=' + $$path + ' error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop $AionUiRemoveDirResult

  ${If} $AionUiRemoveDirResult == "error"
    !insertmacro AIONUI_LOG_EVENT "event=remove-longpath fallback=RMDir reason=no-powershell root=$INSTDIR"
    RMDir /r "$INSTDIR"
    ${If} ${FileExists} "$INSTDIR\*.*"
      StrCpy $AionUiRemoveDirResult "1"
    ${Else}
      StrCpy $AionUiRemoveDirResult "0"
    ${EndIf}
  ${EndIf}

  ${If} $AionUiRemoveDirResult != 0
    StrCpy $AionUiRemoveResidueCount $AionUiRemoveDirResult
  ${EndIf}
!macroend

!macro customRemoveFiles
  !insertmacro AIONUI_LOG_EVENT "remove-start instDir=$INSTDIR"
  Var /GLOBAL AionUiRemoveDirResult
  Var /GLOBAL AionUiAtomicFailedPath
  Var /GLOBAL AionUiAtomicRemoveSucceeded
  Var /GLOBAL AionUiRemoveResidueCount
  Var /GLOBAL AionUiRemoveResidueRoot
  StrCpy $AionUiAtomicFailedPath ""
  StrCpy $AionUiAtomicRemoveSucceeded "0"
  StrCpy $AionUiRemoveResidueCount "0"
  StrCpy $AionUiRemoveResidueRoot "$INSTDIR"

  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R0
    !insertmacro AIONUI_LOG_EVENT "remove-atomic result=$R0"

    ${if} $R0 == 0
      StrCpy $AionUiAtomicRemoveSucceeded "1"
    ${else}
      DetailPrint "Atomic update cleanup failed; restoring previous installation before quitting: $R0"
      StrCpy $AionUiAtomicFailedPath $R0
      !insertmacro AIONUI_LOG_ATOMIC_REMOVE_FAILURE

      Push ""
      Call un.restoreFiles
      Pop $R0
      !insertmacro AIONUI_LOG_EVENT "remove-restore result=$R0"
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 degraded=none firstFailed=$AionUiAtomicFailedPath atomicFailedPath=$AionUiAtomicFailedPath"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 firstFailed=$AionUiAtomicFailedPath" "AionUi could not safely replace the previous installation." "Close AionUi and any file browsers in the install directory, then run this installer again."
    ${endif}
  ${endif}

  SetOutPath $TEMP
  !insertmacro AIONUI_REMOVE_INSTALL_DIR
  ${if} $AionUiRemoveDirResult != 0
    ${if} $AionUiAtomicRemoveSucceeded == "1"
      DetailPrint `AionUi previous installation had locked residual files; continuing after atomic cleanup succeeded: $INSTDIR`
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed degraded=continue fatal=0 residueRoot=$AionUiRemoveResidueRoot failedCount=$AionUiRemoveResidueCount removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
    ${else}
      DetailPrint `Can't safely remove previous installation without atomic cleanup proof: $INSTDIR`
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof degraded=none fatal=1 residueRoot=$AionUiRemoveResidueRoot failedCount=$AionUiRemoveResidueCount removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof fatal=1 removeDirResult=$AionUiRemoveDirResult" "AionUi could not remove the previous installation directory." "Close AionUi and any file browsers in the install directory, then run this installer again."
    ${endif}
  ${else}
    !insertmacro AIONUI_LOG_EVENT "remove-final errors=0 instDir=$INSTDIR removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount removeResidueRoot=$AionUiRemoveResidueRoot atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
  ${endif}
!macroend

!macro customUnInit
  !insertmacro AIONUI_LOG_EVENT "uninit instDir=$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro AIONUI_LOG_EVENT "uninstall-section start instDir=$INSTDIR"
!macroend

!endif
