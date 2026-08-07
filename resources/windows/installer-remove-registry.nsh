!ifndef CSBU_WORKMATE_INSTALLER_REMOVE_REGISTRY_NSH
!define CSBU_WORKMATE_INSTALLER_REMOVE_REGISTRY_NSH

!macro CSBU_WORKMATE_CLEAR_INSTALL_REGISTRY _REASON
  ; Standard NSIS installs keep their registry state. Failure paths must not
  ; erase a previously working installation's uninstall metadata.
  !insertmacro CSBU_WORKMATE_LOG_EVENT "event=registry-preserved reason=${_REASON} uninstallKey=${UNINSTALL_REGISTRY_KEY} installKey=${INSTALL_REGISTRY_KEY}"
!macroend

!macro CSBU_WORKMATE_LOG_ATOMIC_REMOVE_FAILURE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$failed = '$CsbuWorkMateAtomicFailedPath'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$CsbuWorkMateAtomicStagingDir'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$CsbuWorkMateSessionId'; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-atomic-failed'; kind = $$kind; pathLength = $$failed.Length; tempCandidateLength = $$tempCandidate.Length; atomicFailedPath = $$failed; tempCandidate = $$tempCandidate }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro CSBU_WORKMATE_LOG_REMOVE_FAILURE_JSON _PHASE _FATAL _FAILED_PATH _EXTRA_FIELDS
  !insertmacro CSBU_WORKMATE_LOG_JSON_EVENT "failure" "$$lockerText = '$CsbuWorkMateLockerList'; $$processes = @(); if ($$lockerText -and $$lockerText -notlike 'Windows did not identify*' -and $$lockerText -ne 'unknown process') { $$processes = @($$lockerText -split ',\s*' | Where-Object { $$_ } | ForEach-Object { if ($$_ -match '^(.*)\(([0-9]+)\)$$') { [ordered]@{ name = $$Matches[1]; pid = [int]$$Matches[2] } } else { [ordered]@{ name = $$_; pid = $$null } } }) }; $$payload.code = '${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED}'; $$payload.phase = '${_PHASE}'; $$payload.failedPath = '${_FAILED_PATH}'; $$payload.blockingProcesses = @($$processes); if ($$lockerText -like 'CSBU WorkMate installer(*)') { $$payload.fallbackReason = 'installer-self-lock'; $$payload.message = 'The installer process is using the install directory as its current output directory.' } elseif ($$processes.Count -eq 0) { $$payload.fallbackReason = 'restart-manager-no-process'; $$payload.message = 'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' } else { $$payload.fallbackReason = ''; $$payload.message = '' }; $$payload.fatal = ('${_FATAL}' -eq '1'); ${_EXTRA_FIELDS}"
!macroend

!macro CSBU_WORKMATE_REMOVE_INSTALL_DIR
  StrCpy $CsbuWorkMateRemoveResidueCount "0"
  ${If} $CsbuWorkMateRemoveResidueRoot == ""
    StrCpy $CsbuWorkMateRemoveResidueRoot "$INSTDIR"
  ${EndIf}
  StrCpy $CsbuWorkMateRemoveFirstFailedPath ""
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'Continue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$path = [System.IO.Path]::GetFullPath('$CsbuWorkMateRemoveResidueRoot'); \
    $$firstFailedFile = '$PLUGINSDIR\csbu-workmate-remove-first-failed.txt'; \
    Set-Content -LiteralPath $$firstFailedFile -Encoding UTF8 -NoNewline -Value ''; \
    function Write-InstallerLog($$message) { $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$CsbuWorkMateSessionId'; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-log'; message = $$message }; if ($$message -match '(^|\s)event=([^\s]+)') { $$payload.event = $$Matches[2] }; Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) } \
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
  Pop $CsbuWorkMateRemoveDirResult

  ClearErrors
  SetDetailsPrint none
  FileOpen $CsbuWorkMateRemoveFirstFailedFile "$PLUGINSDIR\csbu-workmate-remove-first-failed.txt" r
  ${IfNot} ${Errors}
    FileRead $CsbuWorkMateRemoveFirstFailedFile $CsbuWorkMateRemoveFirstFailedPath
    FileClose $CsbuWorkMateRemoveFirstFailedFile
  ${EndIf}
  SetDetailsPrint lastused

  ${If} $CsbuWorkMateRemoveDirResult == "error"
    !insertmacro CSBU_WORKMATE_LOG_EVENT "event=remove-longpath fallback=RMDir reason=no-powershell root=$INSTDIR"
    RMDir /r "$CsbuWorkMateRemoveResidueRoot"
    ${If} ${FileExists} "$CsbuWorkMateRemoveResidueRoot\*.*"
      StrCpy $CsbuWorkMateRemoveDirResult "1"
    ${Else}
      StrCpy $CsbuWorkMateRemoveDirResult "0"
    ${EndIf}
  ${EndIf}

  ${If} $CsbuWorkMateRemoveDirResult != 0
    StrCpy $CsbuWorkMateRemoveResidueCount $CsbuWorkMateRemoveDirResult
  ${EndIf}
!macroend

!macro customRemoveFiles
  !insertmacro CSBU_WORKMATE_LOG_EVENT "remove-start instDir=$INSTDIR"
  Var /GLOBAL CsbuWorkMateRemoveDirResult
  Var /GLOBAL CsbuWorkMateAtomicFailedPath
  Var /GLOBAL CsbuWorkMateAtomicRemoveSucceeded
  Var /GLOBAL CsbuWorkMateAtomicStagingDir
  Var /GLOBAL CsbuWorkMateRemoveResidueCount
  Var /GLOBAL CsbuWorkMateRemoveResidueRoot
  Var /GLOBAL CsbuWorkMateRemoveFirstFailedPath
  Var /GLOBAL CsbuWorkMateRemoveFirstFailedFile
  StrCpy $CsbuWorkMateAtomicFailedPath ""
  StrCpy $CsbuWorkMateAtomicRemoveSucceeded "0"
  StrCpy $CsbuWorkMateAtomicStagingDir ""
  StrCpy $CsbuWorkMateRemoveResidueCount "0"
  StrCpy $CsbuWorkMateRemoveResidueRoot "$INSTDIR"
  StrCpy $CsbuWorkMateRemoveFirstFailedPath ""

  SetOutPath $TEMP
  StrCpy $CsbuWorkMateCurrentOutDir "$TEMP"

  ${if} ${isUpdated}
    StrCpy $CsbuWorkMateAtomicStagingDir "$INSTDIR.__old"
    ${If} ${FileExists} "$CsbuWorkMateAtomicStagingDir\*.*"
      StrCpy $CsbuWorkMateRemoveResidueRoot "$CsbuWorkMateAtomicStagingDir"
      !insertmacro CSBU_WORKMATE_LOG_EVENT "remove-stale-staging start root=$CsbuWorkMateRemoveResidueRoot"
      !insertmacro CSBU_WORKMATE_REMOVE_INSTALL_DIR
      StrCpy $CsbuWorkMateRemoveResidueRoot "$INSTDIR"
    ${EndIf}

    csbu_workmate_retry_atomic_rename:
      ClearErrors
      Rename "$INSTDIR" "$CsbuWorkMateAtomicStagingDir"
    ${if} ${Errors}
      DetailPrint "Atomic update cleanup failed before replacing previous installation: $INSTDIR"
      StrCpy $CsbuWorkMateAtomicFailedPath "$INSTDIR"
      !insertmacro CSBU_WORKMATE_LOG_ATOMIC_REMOVE_FAILURE
      !insertmacro CSBU_WORKMATE_CAPTURE_FAILED_PATH_LOCKERS "$CsbuWorkMateAtomicFailedPath"
      ${IfNot} ${Silent}
        !insertmacro CSBU_WORKMATE_PROMPT_FAILED_PATH_LOCKERS "$CsbuWorkMateAtomicFailedPath" "atomic-failed" csbu_workmate_retry_atomic_rename csbu_workmate_cancel_atomic_rename csbu_workmate_continue_atomic_failed
        csbu_workmate_cancel_atomic_rename:
      ${EndIf}
      csbu_workmate_continue_atomic_failed:
      !insertmacro CSBU_WORKMATE_LOG_REMOVE_FAILURE_JSON "atomic-failed" "1" "$CsbuWorkMateAtomicFailedPath" "$$payload.atomicFailedPath = '$CsbuWorkMateAtomicFailedPath'"
      !insertmacro CSBU_WORKMATE_LOG_EVENT "code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 degraded=none firstFailed=$CsbuWorkMateAtomicFailedPath atomicFailedPath=$CsbuWorkMateAtomicFailedPath"
      !insertmacro CSBU_WORKMATE_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 firstFailed=$CsbuWorkMateAtomicFailedPath lockers=$CsbuWorkMateLockerList" "${CSBU_WORKMATE_MSG_REPLACE_LOCKED_EN}" "${CSBU_WORKMATE_MSG_REPLACE_LOCKED_ZH}" "${CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
    ${else}
      !insertmacro CSBU_WORKMATE_LOG_EVENT "remove-atomic result=0 staging=$CsbuWorkMateAtomicStagingDir"
      StrCpy $CsbuWorkMateAtomicRemoveSucceeded "1"
      StrCpy $CsbuWorkMateRemoveResidueRoot "$CsbuWorkMateAtomicStagingDir"
    ${endif}
  ${endif}

  csbu_workmate_retry_remove_install_dir:
    !insertmacro CSBU_WORKMATE_REMOVE_INSTALL_DIR
  ${if} $CsbuWorkMateRemoveDirResult != 0
    !insertmacro CSBU_WORKMATE_CAPTURE_FAILED_PATH_LOCKERS "$CsbuWorkMateRemoveFirstFailedPath"
    ${if} $CsbuWorkMateAtomicRemoveSucceeded == "1"
      ${IfNot} ${Silent}
        !insertmacro CSBU_WORKMATE_PROMPT_FAILED_PATH_LOCKERS "$CsbuWorkMateRemoveFirstFailedPath" "residual-delete-failed" csbu_workmate_retry_remove_install_dir csbu_workmate_cancel_remove_after_rm csbu_workmate_continue_after_rm
        csbu_workmate_cancel_remove_after_rm:
          !insertmacro CSBU_WORKMATE_LOG_REMOVE_FAILURE_JSON "residual-delete-failed" "1" "$CsbuWorkMateRemoveFirstFailedPath" "$$payload.residueRoot = '$CsbuWorkMateRemoveResidueRoot'; $$payload.failedCount = '$CsbuWorkMateRemoveResidueCount'; $$payload.removeDirResult = '$CsbuWorkMateRemoveDirResult'; $$payload.atomicSucceeded = ('$CsbuWorkMateAtomicRemoveSucceeded' -eq '1')"
          !insertmacro CSBU_WORKMATE_LOG_EVENT "code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 residueRoot=$CsbuWorkMateRemoveResidueRoot failedCount=$CsbuWorkMateRemoveResidueCount firstFailed=$CsbuWorkMateRemoveFirstFailedPath removeDirResult=$CsbuWorkMateRemoveDirResult removeResidueCount=$CsbuWorkMateRemoveResidueCount atomicFailedPath=$CsbuWorkMateAtomicFailedPath atomicSucceeded=$CsbuWorkMateAtomicRemoveSucceeded"
          !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 firstFailed=$CsbuWorkMateRemoveFirstFailedPath lockers=$CsbuWorkMateLockerList" "${CSBU_WORKMATE_MSG_PREVIOUS_FILE_OPEN_EN}" "${CSBU_WORKMATE_MSG_PREVIOUS_FILE_OPEN_ZH}" "${CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
      ${EndIf}
      csbu_workmate_continue_after_rm:
      DetailPrint `CSBU WorkMate previous installation had locked residual files; continuing after atomic cleanup succeeded: $INSTDIR`
      !insertmacro CSBU_WORKMATE_LOG_EVENT "code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed degraded=continue fatal=0 residueRoot=$CsbuWorkMateRemoveResidueRoot failedCount=$CsbuWorkMateRemoveResidueCount firstFailed=$CsbuWorkMateRemoveFirstFailedPath removeDirResult=$CsbuWorkMateRemoveDirResult removeResidueCount=$CsbuWorkMateRemoveResidueCount atomicFailedPath=$CsbuWorkMateAtomicFailedPath atomicSucceeded=$CsbuWorkMateAtomicRemoveSucceeded"
    ${else}
      DetailPrint `Can't safely remove previous installation without atomic cleanup proof: $INSTDIR`
      ${IfNot} ${Silent}
        !insertmacro CSBU_WORKMATE_PROMPT_FAILED_PATH_LOCKERS "$CsbuWorkMateRemoveFirstFailedPath" "residual-delete-failed-no-atomic-proof" csbu_workmate_retry_remove_install_dir csbu_workmate_cancel_remove_no_atomic csbu_workmate_continue_remove_no_atomic
        csbu_workmate_cancel_remove_no_atomic:
      ${EndIf}
      csbu_workmate_continue_remove_no_atomic:
      !insertmacro CSBU_WORKMATE_LOG_REMOVE_FAILURE_JSON "residual-delete-failed-no-atomic-proof" "1" "$CsbuWorkMateRemoveFirstFailedPath" "$$payload.residueRoot = '$CsbuWorkMateRemoveResidueRoot'; $$payload.failedCount = '$CsbuWorkMateRemoveResidueCount'; $$payload.removeDirResult = '$CsbuWorkMateRemoveDirResult'; $$payload.atomicSucceeded = ('$CsbuWorkMateAtomicRemoveSucceeded' -eq '1')"
      !insertmacro CSBU_WORKMATE_LOG_EVENT "code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof degraded=none fatal=1 residueRoot=$CsbuWorkMateRemoveResidueRoot failedCount=$CsbuWorkMateRemoveResidueCount firstFailed=$CsbuWorkMateRemoveFirstFailedPath removeDirResult=$CsbuWorkMateRemoveDirResult removeResidueCount=$CsbuWorkMateRemoveResidueCount atomicFailedPath=$CsbuWorkMateAtomicFailedPath atomicSucceeded=$CsbuWorkMateAtomicRemoveSucceeded"
      !insertmacro CSBU_WORKMATE_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${CSBU_WORKMATE_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof fatal=1 firstFailed=$CsbuWorkMateRemoveFirstFailedPath removeDirResult=$CsbuWorkMateRemoveDirResult lockers=$CsbuWorkMateLockerList" "${CSBU_WORKMATE_MSG_REMOVE_PREVIOUS_DIR_EN}" "${CSBU_WORKMATE_MSG_REMOVE_PREVIOUS_DIR_ZH}" "${CSBU_WORKMATE_MSG_CLOSE_INSTALL_DIR_ACTION_EN}" "${CSBU_WORKMATE_MSG_CLOSE_INSTALL_DIR_ACTION_ZH}"
    ${endif}
  ${else}
    !insertmacro CSBU_WORKMATE_LOG_EVENT "remove-final errors=0 instDir=$INSTDIR removeDirResult=$CsbuWorkMateRemoveDirResult removeResidueCount=$CsbuWorkMateRemoveResidueCount removeResidueRoot=$CsbuWorkMateRemoveResidueRoot atomicFailedPath=$CsbuWorkMateAtomicFailedPath atomicSucceeded=$CsbuWorkMateAtomicRemoveSucceeded"
    ${ifNot} ${isUpdated}
      !insertmacro CSBU_WORKMATE_DELETE_INSTALL_STATE
      !insertmacro CSBU_WORKMATE_LOG_EVENT "event=install-state-delete reason=user-uninstall"
    ${endif}
  ${endif}
!macroend

!macro customUnInit
  !insertmacro CSBU_WORKMATE_STAGE_INSTALL_STATE_HELPER
  !insertmacro CSBU_WORKMATE_LOG_EVENT "uninit instDir=$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro CSBU_WORKMATE_LOG_EVENT "uninstall-section start instDir=$INSTDIR"
!macroend

!endif
