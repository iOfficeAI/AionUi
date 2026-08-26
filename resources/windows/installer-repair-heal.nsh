!ifndef AIONUI_INSTALLER_REPAIR_HEAL_NSH
!define AIONUI_INSTALLER_REPAIR_HEAL_NSH

Var /GLOBAL AIbangRegistryInstallIsValid
Var /GLOBAL AIbangInnerFailureSummary
Var /GLOBAL AIbangInnerRootCode
Var /GLOBAL AIbangInnerFailureReadResult

!macro AIONUI_READ_LAST_INNER_FAILURE
  InitPluginsDir
  StrCpy $AIbangInnerRootCode ""
  StrCpy $AIbangInnerFailureSummary "No specific locking process was identified. Close AIbang, terminals, editors, and file managers opened in the install folder."
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$logPath = '$AIbangSessionLogPath'; \
    $$summary = 'No specific locking process was identified. Close AIbang, terminals, editors, and file managers opened in the install folder.'; \
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
  Pop $AIbangInnerFailureReadResult
  Pop $AIbangInnerFailureReadResult
  StrCpy $AIbangInnerRootCode $AIbangInnerFailureReadResult 5
  ${If} $AIbangInnerRootCode == "-----"
    StrCpy $AIbangInnerRootCode ""
  ${EndIf}
  StrCpy $AIbangInnerFailureSummary $AIbangInnerFailureReadResult 4096 6
!macroend

!macro AIONUI_LOG_UNINSTALLER_REPAIR _PHASE
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$AIbangSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
    $$path = '$INSTDIR\${UNINSTALL_FILENAME}'; \
    $$item = Get-Item -LiteralPath $$path -ErrorAction SilentlyContinue; \
    $$version = if ($$item) { $$item.VersionInfo.ProductVersion } else { '' }; \
    $$length = if ($$item) { $$item.Length } else { '' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$AIbangSessionId'; version = '${VERSION}'; arch = '${AIONUI_TARGET_ARCH}'; updated = ('$AIbangIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstaller-repair'; phase = '${_PHASE}'; path = $$path; exists = [bool]$$item; productVersion = $$version; length = $$length }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $AIbangRepairLogResult
!macroend

!macro AIONUI_REPAIR_INSTALLED_UNINSTALLER
  Var /GLOBAL AIbangInstalledUninstaller
  Var /GLOBAL AIbangBundledUninstaller
  Var /GLOBAL AIbangRepairLogResult

  !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "before"
  StrCpy $AIbangInstalledUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

  InitPluginsDir
  StrCpy $AIbangBundledUninstaller "$PLUGINSDIR\AIbang-fixed-uninstaller.exe"
  SetOverwrite on
  File "/oname=$PLUGINSDIR\AIbang-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

  ${If} ${FileExists} "$AIbangInstalledUninstaller"
    ClearErrors
    CopyFiles /SILENT "$AIbangBundledUninstaller" "$AIbangInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "copy-failed-retry"
      !insertmacro AIONUI_STOP_APP_PROCESSES
      Sleep 1000

      ClearErrors
      CopyFiles /SILENT "$AIbangBundledUninstaller" "$AIbangInstalledUninstaller"
      ${If} ${Errors}
        ${If} ${FileExists} "$AIbangBundledUninstaller"
          !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "copy-failed-using-bundled"
          !insertmacro AIONUI_LOG_EVENT "event=uninstaller-repair phase=copy-failed-using-bundled"
        ${Else}
          !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair copy-failed-retry-bundled-missing" "${AIONUI_MSG_UNINSTALLER_COPY_LOCKED_EN}" "${AIONUI_MSG_UNINSTALLER_COPY_LOCKED_ZH}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
        ${EndIf}
      ${Else}
        !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy-retry"
      ${EndIf}
    ${Else}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    ClearErrors
    CopyFiles /SILENT "$AIbangBundledUninstaller" "$AIbangInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-failed" "${AIONUI_MSG_UNINSTALLER_REBUILD_FAILED_EN}" "${AIONUI_MSG_UNINSTALLER_REBUILD_FAILED_ZH}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    ${IfNot} ${FileExists} "$AIbangInstalledUninstaller"
      !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-missing-after-copy" "${AIONUI_MSG_UNINSTALLER_REBUILD_MISSING_EN}" "${AIONUI_MSG_UNINSTALLER_REBUILD_MISSING_ZH}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "rebuilt"
    !insertmacro AIONUI_LOG_EVENT "event=uninstaller-repair phase=rebuilt"
  ${EndIf}
!macroend

!macro AIONUI_HEAL_INSTALL_REGISTRY
  Var /GLOBAL AIbangRegInstallLocation
  Var /GLOBAL AIbangRegUninstallString
  Var /GLOBAL AIbangRegInstallExe

  StrCpy $AIbangRegistryInstallIsValid "0"

  ReadRegStr $AIbangRegInstallLocation SHCTX "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $AIbangRegUninstallString SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"

  ${If} $AIbangRegInstallLocation == ""
    !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=missing-install-location uninstallString=$AIbangRegUninstallString"
    !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "missing-install-location"
  ${Else}
    StrCpy $AIbangRegInstallExe "$AIbangRegInstallLocation\${AIONUI_APP_EXECUTABLE_FILENAME}"
    ${If} ${FileExists} "$AIbangRegInstallExe"
      StrCpy $INSTDIR "$AIbangRegInstallLocation"
      StrCpy $AIbangRegistryInstallIsValid "1"
      !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=valid-install-location instDir=$INSTDIR uninstallString=$AIbangRegUninstallString"
    ${Else}
      !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=stale-install-location installLocation=$AIbangRegInstallLocation uninstallString=$AIbangRegUninstallString"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "stale-install-location"
    ${EndIf}
  ${EndIf}
!macroend

!macro AIONUI_LOG_UNINSTALL_RESULT _ROOT_KEY _HAD_ERRORS
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$AIbangSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$AIbangSessionId'; version = '${VERSION}'; arch = '${AIONUI_TARGET_ARCH}'; updated = ('$AIbangIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstall-result'; root = '${_ROOT_KEY}'; launchErrors = '${_HAD_ERRORS}'; exitCode = '$R0' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $AIbangUninstallLogResult
!macroend

!macro AIONUI_HANDLE_UNINSTALL_RESULT _ROOT_KEY _LABEL_PREFIX
  ${If} ${Errors}
    StrCpy $AIbangUninstallHadErrors "1"
  ${Else}
    StrCpy $AIbangUninstallHadErrors "0"
  ${EndIf}

  !insertmacro AIONUI_LOG_UNINSTALL_RESULT "${_ROOT_KEY}" "$AIbangUninstallHadErrors"

  ${If} $AIbangUninstallHadErrors == "1"
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${EndIf}

  ${If} $R0 != 0
      DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
      !insertmacro AIONUI_READ_LAST_INNER_FAILURE
      ${If} $AIbangLockerList != ""
        StrCpy $AIbangInnerFailureSummary "- Failure: previous uninstaller failed with exit code $R0$\r$\n- File or folder: $INSTDIR$\r$\n- Blocking process: $AIbangLockerList"
      ${EndIf}
      !insertmacro AIONUI_LOG_EVENT "event=old-uninstaller-failed action=report exitCode=$R0 lockers=$AIbangLockerList uninstallerDetail=$AIbangInnerFailureSummary"
      ${If} $AIbangInnerRootCode != ""
        !insertmacro AIONUI_FAIL_REPORTABLE_ROOTED_BILINGUAL_DIAGNOSTICS "$AIbangInnerRootCode" ${AIONUI_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$AIbangLockerList uninstallerDetail=$AIbangInnerFailureSummary" "${AIONUI_MSG_OLD_UNINSTALL_FAILED_EN}" "${AIONUI_MSG_OLD_UNINSTALL_FAILED_ZH}" "${AIONUI_MSG_OLD_UNINSTALL_ACTION_EN}" "${AIONUI_MSG_OLD_UNINSTALL_ACTION_ZH}" "$AIbangInnerFailureSummary" "$AIbangInnerFailureSummary"
      ${Else}
        !insertmacro AIONUI_FAIL_REPORTABLE_BILINGUAL_DIAGNOSTICS ${AIONUI_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$AIbangLockerList uninstallerDetail=$AIbangInnerFailureSummary" "${AIONUI_MSG_OLD_UNINSTALL_FAILED_EN}" "${AIONUI_MSG_OLD_UNINSTALL_FAILED_ZH}" "${AIONUI_MSG_OLD_UNINSTALL_ACTION_EN}" "${AIONUI_MSG_OLD_UNINSTALL_ACTION_ZH}" "$AIbangInnerFailureSummary" "$AIbangInnerFailureSummary"
      ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro AIONUI_HEAL_INSTALL_REGISTRY
  ${If} $AIbangRegistryInstallIsValid == "1"
    !insertmacro AIONUI_REPAIR_INSTALLED_UNINSTALLER
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT" "shctx"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER" "hkcu"
!macroend

!endif
