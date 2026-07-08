!ifndef AIONUI_INSTALLER_UPDATE_VERIFY_NSH
!define AIONUI_INSTALLER_UPDATE_VERIFY_NSH

Var /GLOBAL AionUiUninstallHadErrors
Var /GLOBAL AionUiUninstallLogResult
Var /GLOBAL AionUiVerifyResourceResult
Var /GLOBAL AionUiUpdatedAppExitWaitResult
Var /GLOBAL AionUiActiveMarkerExecResult
Var /GLOBAL AionUiActiveMarkerResult

!define AIONUI_ACTIVE_INSTALLER_MARKER "aionui-installer-active.marker"

!macro AIONUI_BRING_UPDATED_INSTALLER_TO_FRONT
  ${If} ${isUpdated}
    BringToFront
    !insertmacro AIONUI_SLOG "event=updated-installer-foreground action=bring-to-front"
  ${EndIf}
!macroend

!macro AIONUI_WAIT_FOR_UPDATED_APP_EXIT
  ${If} ${isUpdated}
    !insertmacro AIONUI_SLOG "event=updated-app-exit-wait phase=start"
    StrCpy $AionUiUpdatedAppExitWaitResult "0"

    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      $$deadline = (Get-Date).AddSeconds(10); \
      $$target = [System.IO.Path]::GetFullPath((Join-Path '$INSTDIR' '${AIONUI_APP_EXECUTABLE_FILENAME}')); \
      do { \
        $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { \
          $$path = $$_.ExecutablePath; \
          if (-not $$path) { $$path = $$_.Path } \
          $$_.Name -ieq '${AIONUI_APP_EXECUTABLE_FILENAME}' -and $$path -and \
          [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
        }); \
        if ($$hits.Count -eq 0) { exit 0 }; \
        Start-Sleep -Milliseconds 500; \
      } while ((Get-Date) -lt $$deadline); \
      exit 1 \
    }"`
    Pop $AionUiUpdatedAppExitWaitResult

    ${If} $AionUiUpdatedAppExitWaitResult != 0
      !insertmacro AIONUI_SLOG "event=updated-app-exit-wait phase=timeout action=stop"
      !insertmacro AIONUI_STOP_APP_PROCESSES
    ${EndIf}

    !insertmacro AIONUI_SLOG "event=updated-app-exit-wait phase=done result=$AionUiUpdatedAppExitWaitResult"
  ${EndIf}
!macroend

!macro AIONUI_RECORD_ACTIVE_INSTALLER_MARKER
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${AIONUI_ACTIVE_INSTALLER_MARKER}'; \
    if (-not (Test-Path -LiteralPath $$marker)) { Write-Output 'missing'; exit 0 }; \
    $$item = Get-Item -LiteralPath $$marker; \
    if ($$item.LastWriteTime -lt (Get-Date).AddHours(-2)) { Write-Output 'stale'; exit 0 }; \
    Write-Output 'active' \
  }"`
  Pop $AionUiActiveMarkerExecResult
  Pop $AionUiActiveMarkerResult
  ${If} $AionUiActiveMarkerResult == "active"
    !insertmacro AIONUI_SLOG "event=installer-active-marker state=active"
  ${ElseIf} $AionUiActiveMarkerResult == "stale"
    !insertmacro AIONUI_SLOG "event=installer-active-marker state=stale"
  ${Else}
    !insertmacro AIONUI_SLOG "event=installer-active-marker state=missing"
  ${EndIf}
!macroend

!macro AIONUI_WRITE_ACTIVE_INSTALLER_MARKER
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${AIONUI_ACTIVE_INSTALLER_MARKER}'; \
    Set-Content -LiteralPath $$marker -Encoding UTF8 -Value ('pid=' + $$PID + ';session=$AionUiSessionId;started=' + (Get-Date -Format o)) \
  }"`
  Pop $AionUiActiveMarkerResult
!macroend

!macro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
  !ifndef BUILD_UNINSTALLER
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      Remove-Item -LiteralPath (Join-Path $$env:TEMP '${AIONUI_ACTIVE_INSTALLER_MARKER}') -Force \
    }"`
    Pop $AionUiActiveMarkerResult
  !endif
!macroend

!macro AIONUI_OVERRIDE_SINGLE_INSTANCE
!macroend

!macro AIONUI_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
  !pragma warning disable 6030
  LangString appCannotBeClosed 1033 "${AIONUI_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${AIONUI_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${AIONUI_MSG_APP_CANNOT_BE_CLOSED_EN}"
  LangString appCannotBeClosed 2052 "${AIONUI_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${AIONUI_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${AIONUI_MSG_APP_CANNOT_BE_CLOSED_EN}"
  !pragma warning default 6030
!macroend

!macro AIONUI_INSTALLER_CUSTOM_HEADER
  !insertmacro AIONUI_OVERRIDE_SINGLE_INSTANCE
  !insertmacro AIONUI_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
!macroend

!macro AIONUI_RELEASE_INSTALL_DIR_OUTDIR
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  StrCpy $AionUiCurrentOutDir "$PLUGINSDIR"
!macroend

!macro AIONUI_INSTALLER_PREINIT
  !ifdef BUILD_UNINSTALLER
    StrCpy $AionUiSessionId ""
    StrCpy $AionUiIsUpdated "0"
    StrCpy $AionUiSessionLogResult ""
    StrCpy $AionUiSessionLogPath "$TEMP\${AIONUI_FALLBACK_LOG}"
    StrCpy $AionUiUninstallHadErrors "0"
    StrCpy $AionUiUninstallLogResult ""
    StrCpy $AionUiVerifyResourceResult ""
    StrCpy $AionUiUpdatedAppExitWaitResult ""
    StrCpy $AionUiActiveMarkerExecResult ""
    StrCpy $AionUiActiveMarkerResult ""
    StrCpy $AionUiStopResult ""
    StrCpy $AionUiLockerListZh ""
    StrCpy $AionUiLockerListEn ""
  !else
    !insertmacro AIONUI_RELEASE_INSTALL_DIR_OUTDIR
    !insertmacro AIONUI_SESSION_BEGIN
    !insertmacro AIONUI_SLOG "event=installer-outdir-release outDir=$AionUiCurrentOutDir instDir=$INSTDIR"
    !insertmacro AIONUI_BRING_UPDATED_INSTALLER_TO_FRONT
    !insertmacro AIONUI_RECORD_ACTIVE_INSTALLER_MARKER
    !insertmacro AIONUI_WRITE_ACTIVE_INSTALLER_MARKER
  !endif
!macroend

!macro AIONUI_VERIFY_REQUIRED_FILE _PATH _LABEL
  ${IfNot} ${FileExists} "${_PATH}"
    !insertmacro AIONUI_LOG_EVENT "verify-required-file missing label=${_LABEL} path=${_PATH}"
    !insertmacro AIONUI_FAIL_UX \
      "${AIONUI_E_CORE_APP_FILES_INCOMPLETE}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "${AIONUI_MSG_VERIFY_REQUIRED_FILE_ZH} ${_LABEL}" \
      "${AIONUI_MSG_VERIFY_REQUIRED_FILE_EN} ${_LABEL}" \
      "${AIONUI_MSG_VERIFY_REQUIRED_FILE_ACTION_ZH}" \
      "${AIONUI_MSG_VERIFY_REQUIRED_FILE_ACTION_EN}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}"
  ${Else}
    !insertmacro AIONUI_LOG_EVENT "verify-required-file ok label=${_LABEL} path=${_PATH}"
  ${EndIf}
!macroend

!macro AIONUI_VERIFY_CORE_APP_FILES
  !insertmacro AIONUI_LOG_EVENT "verify-install start instDir=$INSTDIR"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\AionUi.exe" "AionUi.exe"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\ffmpeg.dll" "ffmpeg.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\libEGL.dll" "libEGL.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\libGLESv2.dll" "libGLESv2.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\d3dcompiler_47.dll" "d3dcompiler_47.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\dxcompiler.dll" "dxcompiler.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\dxil.dll" "dxil.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\vk_swiftshader.dll" "vk_swiftshader.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\vulkan-1.dll" "vulkan-1.dll"
  !insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\resources\app.asar" "resources\app.asar"
!macroend

!macro AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES _RUNTIME_KEY
  InitPluginsDir
  File "/oname=$PLUGINSDIR\verify-bundled-aioncore-install.ps1" "${PROJECT_DIR}\resources\windows\support\verify-bundled-aioncore-install.ps1"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\verify-bundled-aioncore-install.ps1" -InstallDir "$INSTDIR" -RuntimeKey "${_RUNTIME_KEY}" -LogPath "$AionUiSessionLogPath"`
  Pop $AionUiVerifyResourceResult

  ${If} $AionUiVerifyResourceResult != 0
    !insertmacro AIONUI_FAIL_UX \
      "${AIONUI_E_BUNDLED_AIONCORE_INCOMPLETE}" \
      "event=session-end result=fail code=${AIONUI_E_BUNDLED_AIONCORE_INCOMPLETE} detail=bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$AionUiVerifyResourceResult" \
      "${AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ZH}" \
      "${AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_EN}" \
      "${AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_ZH}" \
      "${AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_EN}" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$AionUiVerifyResourceResult instDir=$INSTDIR" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$AionUiVerifyResourceResult instDir=$INSTDIR"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro AIONUI_VERIFY_CORE_APP_FILES
  !insertmacro AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "${AIONUI_RUNTIME_KEY}"
  !insertmacro AIONUI_LOG_EVENT "verify-install ok instDir=$INSTDIR"
  !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
  !insertmacro AIONUI_SESSION_SUCCESS
!macroend

!endif
