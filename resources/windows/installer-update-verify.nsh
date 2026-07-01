!ifndef AIONUI_INSTALLER_UPDATE_VERIFY_NSH
!define AIONUI_INSTALLER_UPDATE_VERIFY_NSH

!ifndef BUILD_UNINSTALLER
  Var /GLOBAL AionUiUninstallHadErrors
  Var /GLOBAL AionUiUninstallLogResult
  Var /GLOBAL AionUiVerifyResourceResult
  Var /GLOBAL AionUiUpdatedAppExitWaitResult
  Var /GLOBAL AionUiActiveMarkerExecResult
  Var /GLOBAL AionUiActiveMarkerResult
!endif

!define AIONUI_ACTIVE_INSTALLER_MARKER "aionui-installer-active.marker"

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
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    Remove-Item -LiteralPath (Join-Path $$env:TEMP '${AIONUI_ACTIVE_INSTALLER_MARKER}') -Force \
  }"`
  Pop $AionUiActiveMarkerResult
!macroend

!macro AIONUI_OVERRIDE_SINGLE_INSTANCE
  !macroundef ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !macro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
    System::Call 'kernel32::CreateMutexW(p 0, i 0, w "AionUiInstaller-${APP_ID}") p .r8 ?e'
    Pop $R0
    ${If} $R0 == 183
      !insertmacro AIONUI_SLOG "event=installer-reentry action=abort"
      MessageBox MB_OK|MB_ICONEXCLAMATION "An AionUi installer is already running. Close the existing installer before starting another one." /SD IDOK
      !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
      Abort
    ${EndIf}
  !macroend
!macroend

!macro AIONUI_INSTALLER_CUSTOM_HEADER
  !insertmacro AIONUI_SESSION_HEADER
  !insertmacro AIONUI_OVERRIDE_SINGLE_INSTANCE
!macroend

!macro AIONUI_INSTALLER_PREINIT
  !insertmacro AIONUI_SESSION_BEGIN
  !insertmacro AIONUI_RECORD_ACTIVE_INSTALLER_MARKER
  !insertmacro AIONUI_WRITE_ACTIVE_INSTALLER_MARKER
!macroend

!macro AIONUI_VERIFY_REQUIRED_FILE _PATH _LABEL
  ${IfNot} ${FileExists} "${_PATH}"
    !insertmacro AIONUI_LOG_EVENT "verify-required-file missing label=${_LABEL} path=${_PATH}"
    !insertmacro AIONUI_FAIL_UX \
      "${AIONUI_E_CORE_APP_FILES_INCOMPLETE}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "AionUi installation is incomplete. Missing required file: ${_LABEL}" \
      "AionUi installation is incomplete. Missing required file: ${_LABEL}" \
      "Please reinstall AionUi or download a newer installer." \
      "Please reinstall AionUi or download a newer installer."
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
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\verify-bundled-aioncore-install.ps1" -InstallDir "$INSTDIR" -RuntimeKey "${_RUNTIME_KEY}" -LogPath "$TEMP\${AIONUI_PROCESS_CHECK_LOG}"`
  Pop $AionUiVerifyResourceResult

  ${If} $AionUiVerifyResourceResult != 0
    !insertmacro AIONUI_SLOG "event=session-end result=fail code=${AIONUI_E_BUNDLED_AIONCORE_INCOMPLETE} detail=bundled-aioncore-incomplete runtime=${_RUNTIME_KEY}"
    !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
    Abort `Bundled AionCore resources are incomplete after installation.`
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
