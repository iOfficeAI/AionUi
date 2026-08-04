!ifndef CSBU_WORKMATE_INSTALLER_UPDATE_VERIFY_NSH
!define CSBU_WORKMATE_INSTALLER_UPDATE_VERIFY_NSH

Var /GLOBAL CsbuWorkMateUninstallHadErrors
Var /GLOBAL CsbuWorkMateUninstallLogResult
Var /GLOBAL CsbuWorkMateVerifyResourceResult
Var /GLOBAL CsbuWorkMateUpdatedAppExitWaitResult
Var /GLOBAL CsbuWorkMateActiveMarkerExecResult
Var /GLOBAL CsbuWorkMateActiveMarkerResult

!define CSBU_WORKMATE_ACTIVE_INSTALLER_MARKER "csbu-workmate-installer-active.marker"

!macro CSBU_WORKMATE_BRING_UPDATED_INSTALLER_TO_FRONT
  ${If} ${isUpdated}
    BringToFront
    !insertmacro CSBU_WORKMATE_SLOG "event=updated-installer-foreground action=bring-to-front"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_WAIT_FOR_UPDATED_APP_EXIT
  ${If} ${isUpdated}
    !insertmacro CSBU_WORKMATE_SLOG "event=updated-app-exit-wait phase=start"
    StrCpy $CsbuWorkMateUpdatedAppExitWaitResult "0"

    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      $$deadline = (Get-Date).AddSeconds(10); \
      $$target = [System.IO.Path]::GetFullPath((Join-Path '$INSTDIR' '${CSBU_WORKMATE_APP_EXECUTABLE_FILENAME}')); \
      do { \
        $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { \
          $$path = $$_.ExecutablePath; \
          if (-not $$path) { $$path = $$_.Path } \
          $$_.Name -ieq '${CSBU_WORKMATE_APP_EXECUTABLE_FILENAME}' -and $$path -and \
          [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
        }); \
        if ($$hits.Count -eq 0) { exit 0 }; \
        Start-Sleep -Milliseconds 500; \
      } while ((Get-Date) -lt $$deadline); \
      exit 1 \
    }"`
    Pop $CsbuWorkMateUpdatedAppExitWaitResult

    ${If} $CsbuWorkMateUpdatedAppExitWaitResult != 0
      !insertmacro CSBU_WORKMATE_SLOG "event=updated-app-exit-wait phase=timeout action=stop"
      !insertmacro CSBU_WORKMATE_STOP_APP_PROCESSES
    ${EndIf}

    !insertmacro CSBU_WORKMATE_SLOG "event=updated-app-exit-wait phase=done result=$CsbuWorkMateUpdatedAppExitWaitResult"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_RECORD_ACTIVE_INSTALLER_MARKER
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${CSBU_WORKMATE_ACTIVE_INSTALLER_MARKER}'; \
    if (-not (Test-Path -LiteralPath $$marker)) { Write-Output 'missing'; exit 0 }; \
    $$item = Get-Item -LiteralPath $$marker; \
    if ($$item.LastWriteTime -lt (Get-Date).AddHours(-2)) { Write-Output 'stale'; exit 0 }; \
    Write-Output 'active' \
  }"`
  Pop $CsbuWorkMateActiveMarkerExecResult
  Pop $CsbuWorkMateActiveMarkerResult
  ${If} $CsbuWorkMateActiveMarkerResult == "active"
    !insertmacro CSBU_WORKMATE_SLOG "event=installer-active-marker state=active"
  ${ElseIf} $CsbuWorkMateActiveMarkerResult == "stale"
    !insertmacro CSBU_WORKMATE_SLOG "event=installer-active-marker state=stale"
  ${Else}
    !insertmacro CSBU_WORKMATE_SLOG "event=installer-active-marker state=missing"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_WRITE_ACTIVE_INSTALLER_MARKER
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${CSBU_WORKMATE_ACTIVE_INSTALLER_MARKER}'; \
    Set-Content -LiteralPath $$marker -Encoding UTF8 -Value ('pid=' + $$PID + ';session=$CsbuWorkMateSessionId;started=' + (Get-Date -Format o)) \
  }"`
  Pop $CsbuWorkMateActiveMarkerResult
!macroend

!macro CSBU_WORKMATE_CLEAR_ACTIVE_INSTALLER_MARKER
  !ifndef BUILD_UNINSTALLER
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      Remove-Item -LiteralPath (Join-Path $$env:TEMP '${CSBU_WORKMATE_ACTIVE_INSTALLER_MARKER}') -Force \
    }"`
    Pop $CsbuWorkMateActiveMarkerResult
  !endif
!macroend

!macro CSBU_WORKMATE_OVERRIDE_SINGLE_INSTANCE
!macroend

!macro CSBU_WORKMATE_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
  !pragma warning disable 6030
  LangString appCannotBeClosed 1033 "${CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${CSBU_WORKMATE_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_EN}"
  LangString appCannotBeClosed 2052 "${CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${CSBU_WORKMATE_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_EN}"
  !pragma warning default 6030
!macroend

!macro CSBU_WORKMATE_INSTALLER_CUSTOM_HEADER
  !insertmacro CSBU_WORKMATE_OVERRIDE_SINGLE_INSTANCE
  !insertmacro CSBU_WORKMATE_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
  !insertmacro CSBU_WORKMATE_DEFINE_INSTALLER_LIFECYCLE_CALLBACKS
!macroend

!macro CSBU_WORKMATE_RELEASE_INSTALL_DIR_OUTDIR
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  StrCpy $CsbuWorkMateCurrentOutDir "$PLUGINSDIR"
!macroend

; Resolve the machine's real native architecture (arm64 / x64 / x86) for diagnostics.
; Backed by IsWow64Process2 (via x64.nsh), so it reports the true hardware arch even when
; the installer runs under x86/x64 emulation. Replaces the old hardcoded "non-arm64" detail.
!macro CSBU_WORKMATE_DETECT_NATIVE_ARCH _OUT
  ${If} ${IsNativeARM64}
    StrCpy ${_OUT} "arm64"
  ${ElseIf} ${RunningX64}
    StrCpy ${_OUT} "x64"
  ${Else}
    StrCpy ${_OUT} "x86"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_INSTALLER_PREINIT
  !ifdef BUILD_UNINSTALLER
    StrCpy $CsbuWorkMateSessionId ""
    StrCpy $CsbuWorkMateIsUpdated "0"
    StrCpy $CsbuWorkMateSessionLogResult ""
    StrCpy $CsbuWorkMateSessionLogPath "$TEMP\${CSBU_WORKMATE_FALLBACK_LOG}"
    StrCpy $CsbuWorkMateUninstallHadErrors "0"
    StrCpy $CsbuWorkMateUninstallLogResult ""
    StrCpy $CsbuWorkMateVerifyResourceResult ""
    StrCpy $CsbuWorkMateUpdatedAppExitWaitResult ""
    StrCpy $CsbuWorkMateActiveMarkerExecResult ""
    StrCpy $CsbuWorkMateActiveMarkerResult ""
    StrCpy $CsbuWorkMateStopResult ""
    StrCpy $CsbuWorkMateLockerListZh ""
    StrCpy $CsbuWorkMateLockerListEn ""
  !else
    !insertmacro CSBU_WORKMATE_RELEASE_INSTALL_DIR_OUTDIR
    !insertmacro CSBU_WORKMATE_SESSION_BEGIN
    !insertmacro CSBU_WORKMATE_SLOG "event=installer-outdir-release outDir=$CsbuWorkMateCurrentOutDir instDir=$INSTDIR"
    ; Guard target/machine architecture as early as possible: this runs before customInit's
    ; registry heal/clear/repair, so a wrong-arch installer aborts without mutating an existing
    ; correct-arch install's registry or uninstaller state. (Sentry ELECTRON-3BX / code E1040)
    !insertmacro CSBU_WORKMATE_ASSERT_TARGET_ARCH
    !insertmacro CSBU_WORKMATE_BRING_UPDATED_INSTALLER_TO_FRONT
    !insertmacro CSBU_WORKMATE_RECORD_ACTIVE_INSTALLER_MARKER
    !insertmacro CSBU_WORKMATE_WRITE_ACTIVE_INSTALLER_MARKER
  !endif
!macroend

!macro CSBU_WORKMATE_VERIFY_REQUIRED_FILE _PATH _LABEL
  ${IfNot} ${FileExists} "${_PATH}"
    !insertmacro CSBU_WORKMATE_LOG_EVENT "verify-required-file missing label=${_LABEL} path=${_PATH}"
    !insertmacro CSBU_WORKMATE_FAIL_UX \
      "${CSBU_WORKMATE_E_CORE_APP_FILES_INCOMPLETE}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "${CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ZH} ${_LABEL}" \
      "${CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_EN} ${_LABEL}" \
      "${CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ACTION_ZH}" \
      "${CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ACTION_EN}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}"
  ${Else}
    !insertmacro CSBU_WORKMATE_LOG_EVENT "verify-required-file ok label=${_LABEL} path=${_PATH}"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_VERIFY_CORE_APP_FILES
  !insertmacro CSBU_WORKMATE_LOG_EVENT "verify-install start instDir=$INSTDIR"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\CSBU WorkMate.exe" "CSBU WorkMate.exe"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\ffmpeg.dll" "ffmpeg.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\libEGL.dll" "libEGL.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\libGLESv2.dll" "libGLESv2.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\d3dcompiler_47.dll" "d3dcompiler_47.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\dxcompiler.dll" "dxcompiler.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\dxil.dll" "dxil.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\vk_swiftshader.dll" "vk_swiftshader.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\vulkan-1.dll" "vulkan-1.dll"
  !insertmacro CSBU_WORKMATE_VERIFY_REQUIRED_FILE "$INSTDIR\resources\app.asar" "resources\app.asar"
!macroend

!macro CSBU_WORKMATE_VERIFY_BUNDLED_AIONCORE_RESOURCES _RUNTIME_KEY
  InitPluginsDir
  File "/oname=$PLUGINSDIR\verify-bundled-aioncore-install.ps1" "${PROJECT_DIR}\resources\windows\support\verify-bundled-aioncore-install.ps1"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\verify-bundled-aioncore-install.ps1" -InstallDir "$INSTDIR" -RuntimeKey "${_RUNTIME_KEY}" -LogPath "$CsbuWorkMateSessionLogPath"`
  Pop $CsbuWorkMateVerifyResourceResult

  ${If} $CsbuWorkMateVerifyResourceResult != 0
    !insertmacro CSBU_WORKMATE_FAIL_UX \
      "${CSBU_WORKMATE_E_BUNDLED_AIONCORE_INCOMPLETE}" \
      "event=session-end result=fail code=${CSBU_WORKMATE_E_BUNDLED_AIONCORE_INCOMPLETE} detail=bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$CsbuWorkMateVerifyResourceResult" \
      "${CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ZH}" \
      "${CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_EN}" \
      "${CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_ZH}" \
      "${CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_EN}" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$CsbuWorkMateVerifyResourceResult instDir=$INSTDIR" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$CsbuWorkMateVerifyResourceResult instDir=$INSTDIR"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro CSBU_WORKMATE_VERIFY_CORE_APP_FILES
  !insertmacro CSBU_WORKMATE_VERIFY_BUNDLED_AIONCORE_RESOURCES "${CSBU_WORKMATE_RUNTIME_KEY}"
  !insertmacro CSBU_WORKMATE_LOG_EVENT "verify-install ok instDir=$INSTDIR"
  !insertmacro CSBU_WORKMATE_FINALIZE_REGISTRY_FREE_INSTALL
  !insertmacro CSBU_WORKMATE_CLEAR_ACTIVE_INSTALLER_MARKER
  !insertmacro CSBU_WORKMATE_SESSION_SUCCESS
!macroend

!endif
