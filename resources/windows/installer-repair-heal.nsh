!ifndef AIONUI_INSTALLER_REPAIR_HEAL_NSH
!define AIONUI_INSTALLER_REPAIR_HEAL_NSH

!macro AIONUI_LOG_UNINSTALLER_REPAIR _PHASE
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$path = '$INSTDIR\${UNINSTALL_FILENAME}'; \
    $$item = Get-Item -LiteralPath $$path -ErrorAction SilentlyContinue; \
    $$version = if ($$item) { $$item.VersionInfo.ProductVersion } else { '' }; \
    $$length = if ($$item) { $$item.Length } else { '' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] uninstaller-repair phase=${_PHASE} instDir=$INSTDIR path=' + $$path + ' exists=' + [bool]$$item + ' version=' + $$version + ' length=' + $$length) \
  }"`
  Pop $AionUiRepairLogResult
!macroend

!macro AIONUI_REPAIR_INSTALLED_UNINSTALLER
  Var /GLOBAL AionUiInstalledUninstaller
  Var /GLOBAL AionUiBundledUninstaller
  Var /GLOBAL AionUiRepairLogResult

  !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "before"
  StrCpy $AionUiInstalledUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

  InitPluginsDir
  StrCpy $AionUiBundledUninstaller "$PLUGINSDIR\AionUi-fixed-uninstaller.exe"
  SetOverwrite on
  File "/oname=$PLUGINSDIR\AionUi-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

  ${If} ${FileExists} "$AionUiInstalledUninstaller"
    ClearErrors
    CopyFiles /SILENT "$AionUiBundledUninstaller" "$AionUiInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "copy-failed-retry"
      !insertmacro AIONUI_STOP_APP_PROCESSES
      Sleep 1000

      ClearErrors
      CopyFiles /SILENT "$AionUiBundledUninstaller" "$AionUiInstalledUninstaller"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "AionUi cannot update because the existing uninstaller is locked.$\r$\n$\r$\nPlease close AionUi completely and try again. If it still fails, restart Windows and run this installer again.$\r$\n$\r$\nIf the problem continues, uninstall the old AionUi from Windows Settings, then run this installer again."
        !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair copy-failed-retry" "AionUi could not overwrite the installed uninstaller because it is locked." "Close AionUi, restart Windows if needed, then run this installer again."
      ${Else}
        !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy-retry"
      ${EndIf}
    ${Else}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    ClearErrors
    CopyFiles /SILENT "$AionUiBundledUninstaller" "$AionUiInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-failed" "AionUi could not rebuild the missing installed uninstaller." "Close AionUi, restart Windows if needed, then run this installer again."
    ${EndIf}

    ${IfNot} ${FileExists} "$AionUiInstalledUninstaller"
      !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-missing-after-copy" "AionUi rebuilt the uninstaller, but the rebuilt file is still missing." "Close AionUi, restart Windows if needed, then run this installer again."
    ${EndIf}

    !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "rebuilt"
    !insertmacro AIONUI_LOG_EVENT "event=uninstaller-repair phase=rebuilt"
  ${EndIf}
!macroend

!macro AIONUI_HEAL_INSTALL_REGISTRY
  Var /GLOBAL AionUiRegInstallLocation
  Var /GLOBAL AionUiRegUninstallString
  Var /GLOBAL AionUiRegInstallExe
  Var /GLOBAL AionUiRegistryInstallIsValid

  StrCpy $AionUiRegistryInstallIsValid "0"

  ReadRegStr $AionUiRegInstallLocation SHCTX "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $AionUiRegUninstallString SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"

  ${If} $AionUiRegInstallLocation == ""
    !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=missing-install-location uninstallString=$AionUiRegUninstallString"
    !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "missing-install-location"
  ${Else}
    StrCpy $AionUiRegInstallExe "$AionUiRegInstallLocation\${AIONUI_APP_EXECUTABLE_FILENAME}"
    ${If} ${FileExists} "$AionUiRegInstallExe"
      StrCpy $INSTDIR "$AionUiRegInstallLocation"
      StrCpy $AionUiRegistryInstallIsValid "1"
      !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=valid-install-location instDir=$INSTDIR uninstallString=$AionUiRegUninstallString"
    ${Else}
      !insertmacro AIONUI_LOG_EVENT "event=registry-heal phase=stale-install-location installLocation=$AionUiRegInstallLocation uninstallString=$AionUiRegUninstallString"
      !insertmacro AIONUI_CLEAR_INSTALL_REGISTRY "stale-install-location"
    ${EndIf}
  ${EndIf}
!macroend

!macro AIONUI_LOG_UNINSTALL_RESULT _ROOT_KEY _HAD_ERRORS
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] uninstall-result root=${_ROOT_KEY} launchErrors=${_HAD_ERRORS} exitCode=$R0 instDir=$INSTDIR') \
  }"`
  Pop $AionUiUninstallLogResult
!macroend

!macro AIONUI_HANDLE_UNINSTALL_RESULT _ROOT_KEY
  ${If} ${Errors}
    StrCpy $AionUiUninstallHadErrors "1"
  ${Else}
    StrCpy $AionUiUninstallHadErrors "0"
  ${EndIf}

  !insertmacro AIONUI_LOG_UNINSTALL_RESULT "${_ROOT_KEY}" "$AionUiUninstallHadErrors"

  ${If} $AionUiUninstallHadErrors == "1"
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${EndIf}

  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    !insertmacro AIONUI_FAIL_REPORTABLE ${AIONUI_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0" "The previous AionUi uninstaller returned an error." "Restart Windows and run this installer again. If it still fails, remove AionUi from Windows Settings first."
  ${EndIf}
!macroend

!macro customInit
  !insertmacro AIONUI_HEAL_INSTALL_REGISTRY
  ${If} $AionUiRegistryInstallIsValid == "1"
    !insertmacro AIONUI_REPAIR_INSTALLED_UNINSTALLER
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER"
!macroend

!endif
