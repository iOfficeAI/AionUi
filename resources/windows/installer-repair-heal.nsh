!ifndef CSBU_WORKMATE_INSTALLER_REPAIR_HEAL_NSH
!define CSBU_WORKMATE_INSTALLER_REPAIR_HEAL_NSH

Var /GLOBAL CsbuWorkMateRegistryInstallIsValid
Var /GLOBAL CsbuWorkMateInnerFailureSummary
Var /GLOBAL CsbuWorkMateInnerRootCode
Var /GLOBAL CsbuWorkMateInnerFailureReadResult

!macro CSBU_WORKMATE_READ_LAST_INNER_FAILURE
  InitPluginsDir
  StrCpy $CsbuWorkMateInnerRootCode ""
  StrCpy $CsbuWorkMateInnerFailureSummary "No specific locking process was identified. Close CSBU WorkMate, terminals, editors, and file managers opened in the install folder."
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$logPath = '$CsbuWorkMateSessionLogPath'; \
    $$summary = 'No specific locking process was identified. Close CSBU WorkMate, terminals, editors, and file managers opened in the install folder.'; \
    $$code = ''; \
    if ($$logPath -and (Test-Path -LiteralPath $$logPath)) { \
      $$events = @(Get-Content -LiteralPath $$logPath -ErrorAction SilentlyContinue | ForEach-Object { try { $$_ | ConvertFrom-Json } catch { $$null } } | Where-Object { $$_ }); \
      $$failure = @($$events | Where-Object { $$_.event -eq 'failure' -and $$_.updated -eq $$true } | Select-Object -Last 1)[0]; \
      if (-not $$failure) { $$failure = @($$events | Where-Object { $$_.event -eq 'failure' } | Select-Object -Last 1)[0] }; \
      if ($$failure) { \
        $$code = ([string]$$failure.code).Trim(); \
        $$phase = ([string]$$failure.phase).Trim(); \
        $$path = ([string]$$failure.failedPath).Trim(); \
        $$blocking = ''; \
        $$processes = @($$failure.blockingProcesses); \
        if ($$processes.Count -gt 0) { $$blocking = (@($$processes | ForEach-Object { if ($$_.pid) { [string]$$_.name + '(' + [string]$$_.pid + ')' } else { [string]$$_.name } }) -join ', ') }; \
        if (-not $$blocking) { $$blocking = ([string]$$failure.message).Trim() }; \
        if (-not $$blocking) { $$blocking = 'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' }; \
        $$parts = @('- Outer installer: previous uninstaller exited with code $R0', ('- Inner failure: ' + $$code + ' phase ' + $$phase)); \
        if ($$path) { $$parts += ('- File or folder: ' + $$path) }; \
        $$parts += ('- Blocking process: ' + $$blocking); \
        $$summary = $$parts -join [Environment]::NewLine; \
      } \
    }; \
    if (-not $$code) { $$code = '-----' }; \
    [Console]::Out.Write($$code + '|' + $$summary) \
  }"`
  Pop $CsbuWorkMateInnerFailureReadResult
  Pop $CsbuWorkMateInnerFailureReadResult
  StrCpy $CsbuWorkMateInnerRootCode $CsbuWorkMateInnerFailureReadResult 5
  ${If} $CsbuWorkMateInnerRootCode == "-----"
    StrCpy $CsbuWorkMateInnerRootCode ""
  ${EndIf}
  StrCpy $CsbuWorkMateInnerFailureSummary $CsbuWorkMateInnerFailureReadResult 4096 6
!macroend

!macro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR _PHASE
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$path = '$INSTDIR\${UNINSTALL_FILENAME}'; \
    $$item = Get-Item -LiteralPath $$path -ErrorAction SilentlyContinue; \
    $$version = if ($$item) { $$item.VersionInfo.ProductVersion } else { '' }; \
    $$length = if ($$item) { $$item.Length } else { '' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$CsbuWorkMateSessionId'; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstaller-repair'; phase = '${_PHASE}'; path = $$path; exists = [bool]$$item; productVersion = $$version; length = $$length }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $CsbuWorkMateRepairLogResult
!macroend

!macro CSBU_WORKMATE_REPAIR_INSTALLED_UNINSTALLER
  Var /GLOBAL CsbuWorkMateInstalledUninstaller
  Var /GLOBAL CsbuWorkMateBundledUninstaller
  Var /GLOBAL CsbuWorkMateRepairLogResult

  !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "before"
  StrCpy $CsbuWorkMateInstalledUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

  InitPluginsDir
  StrCpy $CsbuWorkMateBundledUninstaller "$PLUGINSDIR\CSBU-WorkMate-fixed-uninstaller.exe"
  SetOverwrite on
  File "/oname=$PLUGINSDIR\CSBU-WorkMate-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

  ${If} ${FileExists} "$CsbuWorkMateInstalledUninstaller"
    ClearErrors
    CopyFiles /SILENT "$CsbuWorkMateBundledUninstaller" "$CsbuWorkMateInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "copy-failed-retry"
      !insertmacro CSBU_WORKMATE_STOP_APP_PROCESSES
      Sleep 1000

      ClearErrors
      CopyFiles /SILENT "$CsbuWorkMateBundledUninstaller" "$CsbuWorkMateInstalledUninstaller"
      ${If} ${Errors}
        ${If} ${FileExists} "$CsbuWorkMateBundledUninstaller"
          !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "copy-failed-using-bundled"
          !insertmacro CSBU_WORKMATE_LOG_EVENT "event=uninstaller-repair phase=copy-failed-using-bundled"
        ${Else}
          !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair copy-failed-retry-bundled-missing" "${CSBU_WORKMATE_MSG_UNINSTALLER_COPY_LOCKED_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_COPY_LOCKED_ZH}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
        ${EndIf}
      ${Else}
        !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "after-copy-retry"
      ${EndIf}
    ${Else}
      !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    ClearErrors
    CopyFiles /SILENT "$CsbuWorkMateBundledUninstaller" "$CsbuWorkMateInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-failed" "${CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_FAILED_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_FAILED_ZH}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    ${IfNot} ${FileExists} "$CsbuWorkMateInstalledUninstaller"
      !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL ${CSBU_WORKMATE_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-missing-after-copy" "${CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_MISSING_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_MISSING_ZH}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    !insertmacro CSBU_WORKMATE_LOG_UNINSTALLER_REPAIR "rebuilt"
    !insertmacro CSBU_WORKMATE_LOG_EVENT "event=uninstaller-repair phase=rebuilt"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_HEAL_INSTALL_REGISTRY
  Var /GLOBAL CsbuWorkMateRegInstallLocation
  Var /GLOBAL CsbuWorkMateRegUninstallString
  Var /GLOBAL CsbuWorkMateRegInstallExe

  StrCpy $CsbuWorkMateRegistryInstallIsValid "0"

  ReadRegStr $CsbuWorkMateRegInstallLocation SHCTX "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $CsbuWorkMateRegUninstallString SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"

  ${If} $CsbuWorkMateRegInstallLocation == ""
    !insertmacro CSBU_WORKMATE_LOG_EVENT "event=registry-heal phase=missing-install-location uninstallString=$CsbuWorkMateRegUninstallString"
    !insertmacro CSBU_WORKMATE_CLEAR_INSTALL_REGISTRY "missing-install-location"
  ${Else}
    StrCpy $CsbuWorkMateRegInstallExe "$CsbuWorkMateRegInstallLocation\${CSBU_WORKMATE_APP_EXECUTABLE_FILENAME}"
    ${If} ${FileExists} "$CsbuWorkMateRegInstallExe"
      StrCpy $INSTDIR "$CsbuWorkMateRegInstallLocation"
      StrCpy $CsbuWorkMateRegistryInstallIsValid "1"
      !insertmacro CSBU_WORKMATE_LOG_EVENT "event=registry-heal phase=valid-install-location instDir=$INSTDIR uninstallString=$CsbuWorkMateRegUninstallString"
    ${Else}
      !insertmacro CSBU_WORKMATE_LOG_EVENT "event=registry-heal phase=stale-install-location installLocation=$CsbuWorkMateRegInstallLocation uninstallString=$CsbuWorkMateRegUninstallString"
      !insertmacro CSBU_WORKMATE_CLEAR_INSTALL_REGISTRY "stale-install-location"
    ${EndIf}
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_LOG_UNINSTALL_RESULT _ROOT_KEY _HAD_ERRORS
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$CsbuWorkMateSessionId'; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstall-result'; root = '${_ROOT_KEY}'; launchErrors = '${_HAD_ERRORS}'; exitCode = '$R0' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $CsbuWorkMateUninstallLogResult
!macroend

!macro CSBU_WORKMATE_HANDLE_UNINSTALL_RESULT _ROOT_KEY _LABEL_PREFIX
  ${If} ${Errors}
    StrCpy $CsbuWorkMateUninstallHadErrors "1"
  ${Else}
    StrCpy $CsbuWorkMateUninstallHadErrors "0"
  ${EndIf}

  !insertmacro CSBU_WORKMATE_LOG_UNINSTALL_RESULT "${_ROOT_KEY}" "$CsbuWorkMateUninstallHadErrors"

  ${If} $CsbuWorkMateUninstallHadErrors == "1"
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${EndIf}

  ${If} $R0 != 0
      DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
      !insertmacro CSBU_WORKMATE_READ_LAST_INNER_FAILURE
      ${If} $CsbuWorkMateLockerList != ""
        StrCpy $CsbuWorkMateInnerFailureSummary "- Failure: previous uninstaller failed with exit code $R0$\r$\n- File or folder: $INSTDIR$\r$\n- Blocking process: $CsbuWorkMateLockerList"
      ${EndIf}
      !insertmacro CSBU_WORKMATE_LOG_EVENT "event=old-uninstaller-failed action=report exitCode=$R0 lockers=$CsbuWorkMateLockerList uninstallerDetail=$CsbuWorkMateInnerFailureSummary"
      ${If} $CsbuWorkMateInnerRootCode != ""
        !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_ROOTED_BILINGUAL_DIAGNOSTICS "$CsbuWorkMateInnerRootCode" ${CSBU_WORKMATE_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$CsbuWorkMateLockerList uninstallerDetail=$CsbuWorkMateInnerFailureSummary" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_EN}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_ZH}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_EN}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_ZH}" "$CsbuWorkMateInnerFailureSummary" "$CsbuWorkMateInnerFailureSummary"
      ${Else}
        !insertmacro CSBU_WORKMATE_FAIL_REPORTABLE_BILINGUAL_DIAGNOSTICS ${CSBU_WORKMATE_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$CsbuWorkMateLockerList uninstallerDetail=$CsbuWorkMateInnerFailureSummary" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_EN}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_ZH}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_EN}" "${CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_ZH}" "$CsbuWorkMateInnerFailureSummary" "$CsbuWorkMateInnerFailureSummary"
      ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro CSBU_WORKMATE_HEAL_INSTALL_REGISTRY
  ${If} $CsbuWorkMateRegistryInstallIsValid == "1"
    !insertmacro CSBU_WORKMATE_REPAIR_INSTALLED_UNINSTALLER
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro CSBU_WORKMATE_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT" "shctx"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro CSBU_WORKMATE_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER" "hkcu"
!macroend

!endif
