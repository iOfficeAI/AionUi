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
    $$log = '$AionUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
    $$failed = '$AionUiAtomicFailedPath'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$AionUiAtomicStagingDir'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$AionUiSessionId'; version = '${VERSION}'; arch = '${AIONUI_TARGET_ARCH}'; updated = ('$AionUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-atomic-failed'; kind = $$kind; pathLength = $$failed.Length; tempCandidateLength = $$tempCandidate.Length; atomicFailedPath = $$failed; tempCandidate = $$tempCandidate }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro AIONUI_LOG_REMOVE_FAILURE_JSON _PHASE _FATAL _FAILED_PATH _EXTRA_FIELDS
  !insertmacro AIONUI_LOG_JSON_EVENT "failure" "$$lockerText = '$AionUiLockerList'; $$processes = @(); if ($$lockerText -and $$lockerText -notlike 'Windows did not identify*' -and $$lockerText -ne 'unknown process') { $$processes = @($$lockerText -split ',\s*' | Where-Object { $$_ } | ForEach-Object { if ($$_ -match '^(.*)\(([0-9]+)\)$$') { [ordered]@{ name = $$Matches[1]; pid = [int]$$Matches[2] } } else { [ordered]@{ name = $$_; pid = $$null } } }) }; $$payload.code = '${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}'; $$payload.phase = '${_PHASE}'; $$payload.failedPath = '${_FAILED_PATH}'; $$payload.blockingProcesses = @($$processes); if ($$lockerText -like 'AionUi installer(*)') { $$payload.fallbackReason = 'installer-self-lock'; $$payload.message = 'The installer process is using the install directory as its current output directory.' } elseif ($$processes.Count -eq 0) { $$payload.fallbackReason = 'restart-manager-no-process'; $$payload.message = 'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' } else { $$payload.fallbackReason = ''; $$payload.message = '' }; $$payload.fatal = ('${_FATAL}' -eq '1'); ${_EXTRA_FIELDS}"
!macroend

!macro AIONUI_REMOVE_INSTALL_DIR
  StrCpy $AionUiRemoveResidueCount "0"
  ${If} $AionUiRemoveResidueRoot == ""
    StrCpy $AionUiRemoveResidueRoot "$INSTDIR"
  ${EndIf}
  StrCpy $AionUiRemoveFirstFailedPath ""
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'Continue'; \
    $$log = '$AionUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
    $$path = [System.IO.Path]::GetFullPath('$AionUiRemoveResidueRoot'); \
    $$firstFailedFile = '$PLUGINSDIR\aionui-remove-first-failed.txt'; \
    Set-Content -LiteralPath $$firstFailedFile -Encoding UTF8 -NoNewline -Value ''; \
    function Write-InstallerLog($$message) { $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$AionUiSessionId'; version = '${VERSION}'; arch = '${AIONUI_TARGET_ARCH}'; updated = ('$AionUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-log'; message = $$message }; if ($$message -match '(^|\s)event=([^\s]+)') { $$payload.event = $$Matches[2] }; Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) } \
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
      if ($$failed.Count -gt 0) { Set-Content -LiteralPath $$firstFailedFile -Encoding UTF8 -NoNewline -Value $$failed[0]; exit $$failed.Count } \
      Write-InstallerLog ('remove-longpath result=0 instDir=' + $$path); \
      exit 0 \
    } catch { \
      Write-InstallerLog ('remove-longpath result=1 instDir=' + $$path + ' error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop $AionUiRemoveDirResult

  ClearErrors
  SetDetailsPrint none
  FileOpen $AionUiRemoveFirstFailedFile "$PLUGINSDIR\aionui-remove-first-failed.txt" r
  ${IfNot} ${Errors}
    FileRead $AionUiRemoveFirstFailedFile $AionUiRemoveFirstFailedPath
    FileClose $AionUiRemoveFirstFailedFile
  ${EndIf}
  SetDetailsPrint lastused

  ${If} $AionUiRemoveDirResult == "error"
    !insertmacro AIONUI_LOG_EVENT "event=remove-longpath fallback=RMDir reason=no-powershell root=$INSTDIR"
    RMDir /r "$AionUiRemoveResidueRoot"
    ${If} ${FileExists} "$AionUiRemoveResidueRoot\*.*"
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
  Var /GLOBAL AionUiAtomicStagingDir
  Var /GLOBAL AionUiRemoveResidueCount
  Var /GLOBAL AionUiRemoveResidueRoot
  Var /GLOBAL AionUiRemoveFirstFailedPath
  Var /GLOBAL AionUiRemoveFirstFailedFile
  StrCpy $AionUiAtomicFailedPath ""
  StrCpy $AionUiAtomicRemoveSucceeded "0"
  StrCpy $AionUiAtomicStagingDir ""
  StrCpy $AionUiRemoveResidueCount "0"
  StrCpy $AionUiRemoveResidueRoot "$INSTDIR"
  StrCpy $AionUiRemoveFirstFailedPath ""

  SetOutPath $TEMP
  StrCpy $AionUiCurrentOutDir "$TEMP"

  ${if} ${isUpdated}
    StrCpy $AionUiAtomicStagingDir "$INSTDIR.__old"
    ${If} ${FileExists} "$AionUiAtomicStagingDir\*.*"
      StrCpy $AionUiRemoveResidueRoot "$AionUiAtomicStagingDir"
      !insertmacro AIONUI_LOG_EVENT "remove-stale-staging start root=$AionUiRemoveResidueRoot"
      !insertmacro AIONUI_REMOVE_INSTALL_DIR
      StrCpy $AionUiRemoveResidueRoot "$INSTDIR"
    ${EndIf}

    aionui_retry_atomic_rename:
      ClearErrors
      Rename "$INSTDIR" "$AionUiAtomicStagingDir"
    ${if} ${Errors}
      DetailPrint "Atomic update cleanup failed before replacing previous installation: $INSTDIR"
      StrCpy $AionUiAtomicFailedPath "$INSTDIR"
      !insertmacro AIONUI_LOG_ATOMIC_REMOVE_FAILURE
      !insertmacro AIONUI_CAPTURE_FAILED_PATH_LOCKERS "$AionUiAtomicFailedPath"
      ${IfNot} ${Silent}
        !insertmacro AIONUI_PROMPT_FAILED_PATH_LOCKERS "$AionUiAtomicFailedPath" "atomic-failed" aionui_retry_atomic_rename aionui_cancel_atomic_rename aionui_continue_atomic_failed
        aionui_cancel_atomic_rename:
      ${EndIf}
      aionui_continue_atomic_failed:
      !insertmacro AIONUI_LOG_REMOVE_FAILURE_JSON "atomic-failed" "1" "$AionUiAtomicFailedPath" "$$payload.atomicFailedPath = '$AionUiAtomicFailedPath'"
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 degraded=none firstFailed=$AionUiAtomicFailedPath atomicFailedPath=$AionUiAtomicFailedPath"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 firstFailed=$AionUiAtomicFailedPath lockers=$AionUiLockerList" "${AIONUI_MSG_REPLACE_LOCKED_EN}" "${AIONUI_MSG_REPLACE_LOCKED_ZH}" "${AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
    ${else}
      !insertmacro AIONUI_LOG_EVENT "remove-atomic result=0 staging=$AionUiAtomicStagingDir"
      StrCpy $AionUiAtomicRemoveSucceeded "1"
      StrCpy $AionUiRemoveResidueRoot "$AionUiAtomicStagingDir"
    ${endif}
  ${endif}

  aionui_retry_remove_install_dir:
    !insertmacro AIONUI_REMOVE_INSTALL_DIR
  ${if} $AionUiRemoveDirResult != 0
    !insertmacro AIONUI_CAPTURE_FAILED_PATH_LOCKERS "$AionUiRemoveFirstFailedPath"
    ${if} $AionUiAtomicRemoveSucceeded == "1"
      ${IfNot} ${Silent}
        !insertmacro AIONUI_PROMPT_FAILED_PATH_LOCKERS "$AionUiRemoveFirstFailedPath" "residual-delete-failed" aionui_retry_remove_install_dir aionui_cancel_remove_after_rm aionui_continue_after_rm
        aionui_cancel_remove_after_rm:
          !insertmacro AIONUI_LOG_REMOVE_FAILURE_JSON "residual-delete-failed" "1" "$AionUiRemoveFirstFailedPath" "$$payload.residueRoot = '$AionUiRemoveResidueRoot'; $$payload.failedCount = '$AionUiRemoveResidueCount'; $$payload.removeDirResult = '$AionUiRemoveDirResult'; $$payload.atomicSucceeded = ('$AionUiAtomicRemoveSucceeded' -eq '1')"
          !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 residueRoot=$AionUiRemoveResidueRoot failedCount=$AionUiRemoveResidueCount firstFailed=$AionUiRemoveFirstFailedPath removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
          !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 firstFailed=$AionUiRemoveFirstFailedPath lockers=$AionUiLockerList" "${AIONUI_MSG_PREVIOUS_FILE_OPEN_EN}" "${AIONUI_MSG_PREVIOUS_FILE_OPEN_ZH}" "${AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
      ${EndIf}
      aionui_continue_after_rm:
      DetailPrint `AionUi previous installation had locked residual files; continuing after atomic cleanup succeeded: $INSTDIR`
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed degraded=continue fatal=0 residueRoot=$AionUiRemoveResidueRoot failedCount=$AionUiRemoveResidueCount firstFailed=$AionUiRemoveFirstFailedPath removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
    ${else}
      DetailPrint `Can't safely remove previous installation without atomic cleanup proof: $INSTDIR`
      ${IfNot} ${Silent}
        !insertmacro AIONUI_PROMPT_FAILED_PATH_LOCKERS "$AionUiRemoveFirstFailedPath" "residual-delete-failed-no-atomic-proof" aionui_retry_remove_install_dir aionui_cancel_remove_no_atomic aionui_continue_remove_no_atomic
        aionui_cancel_remove_no_atomic:
      ${EndIf}
      aionui_continue_remove_no_atomic:
      !insertmacro AIONUI_LOG_REMOVE_FAILURE_JSON "residual-delete-failed-no-atomic-proof" "1" "$AionUiRemoveFirstFailedPath" "$$payload.residueRoot = '$AionUiRemoveResidueRoot'; $$payload.failedCount = '$AionUiRemoveResidueCount'; $$payload.removeDirResult = '$AionUiRemoveDirResult'; $$payload.atomicSucceeded = ('$AionUiAtomicRemoveSucceeded' -eq '1')"
      !insertmacro AIONUI_LOG_EVENT "code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof degraded=none fatal=1 residueRoot=$AionUiRemoveResidueRoot failedCount=$AionUiRemoveResidueCount firstFailed=$AionUiRemoveFirstFailedPath removeDirResult=$AionUiRemoveDirResult removeResidueCount=$AionUiRemoveResidueCount atomicFailedPath=$AionUiAtomicFailedPath atomicSucceeded=$AionUiAtomicRemoveSucceeded"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof fatal=1 firstFailed=$AionUiRemoveFirstFailedPath removeDirResult=$AionUiRemoveDirResult lockers=$AionUiLockerList" "${AIONUI_MSG_REMOVE_PREVIOUS_DIR_EN}" "${AIONUI_MSG_REMOVE_PREVIOUS_DIR_ZH}" "${AIONUI_MSG_CLOSE_INSTALL_DIR_ACTION_EN}" "${AIONUI_MSG_CLOSE_INSTALL_DIR_ACTION_ZH}"
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
