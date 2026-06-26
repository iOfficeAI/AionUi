; x64 architecture detection for NSIS installer
; Prevents installation on ARM64 or x86 systems

!include "x64.nsh"

!ifndef AIONUI_APP_PROCESS_CHECK_DEFINED
!define AIONUI_APP_PROCESS_CHECK_DEFINED
!define AIONUI_APP_EXECUTABLE_FILENAME "AionUi.exe"
!define AIONUI_PROCESS_CHECK_LOG "aionui-installer-process-check.log"

!ifndef BUILD_UNINSTALLER
  Var /GLOBAL AionUiUninstallHadErrors
  Var /GLOBAL AionUiUninstallLogResult
  Var /GLOBAL AionUiVerifyResourceResult
!endif

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

  ${If} ${FileExists} "$AionUiInstalledUninstaller"
    InitPluginsDir
    StrCpy $AionUiBundledUninstaller "$PLUGINSDIR\AionUi-fixed-uninstaller.exe"
    SetOverwrite on
    File "/oname=$PLUGINSDIR\AionUi-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

    ClearErrors
    CopyFiles /SILENT "$AionUiBundledUninstaller" "$AionUiInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "copy-failed"
      MessageBox MB_OK|MB_ICONEXCLAMATION "AionUi cannot update because the existing uninstaller is locked.$\r$\n$\r$\nPlease close AionUi completely and try again. If it still fails, restart Windows and run this installer again.$\r$\n$\r$\nIf the problem continues, uninstall the old AionUi from Windows Settings, then run this installer again."
      SetErrorLevel 2
      Quit
    ${Else}
      !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    !insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "missing"
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

!macro AIONUI_LOG_EVENT _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] ${_MESSAGE}') \
  }"`
  Pop $9
  Pop $9
!macroend

!macro AIONUI_LOG_ATOMIC_REMOVE_FAILURE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$failed = '$R0'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$PLUGINSDIR\old-install'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] remove-atomic-failed kind=' + $$kind + ' pathLength=' + $$failed.Length + ' tempCandidateLength=' + $$tempCandidate.Length + ' path=' + $$failed + ' tempCandidate=' + $$tempCandidate) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro AIONUI_REMOVE_INSTALL_DIR
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'Stop'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$path = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    try { \
      if (Test-Path -LiteralPath $$path) { \
        $$deletePath = if ($$path.StartsWith('\\')) { '\\?\UNC\' + $$path.TrimStart('\') } else { '\\?\' + $$path }; \
        [System.IO.Directory]::Delete($$deletePath, $$true); \
      } \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] remove-longpath result=0 instDir=' + $$path); \
      exit 0 \
    } catch { \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] remove-longpath result=1 instDir=' + $$path + ' error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop $AionUiRemoveDirResult
!macroend

!macro AIONUI_FIND_APP_PROCESS _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$instDir = '$INSTDIR'; \
    $$target = [System.IO.Path]::GetFullPath((Join-Path $$instDir '${AIONUI_APP_EXECUTABLE_FILENAME}')); \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { \
      $$path = $$_.ExecutablePath; \
      $$cmd = $$_.CommandLine; \
      if (-not $$path) { $$path = $$_.Path } \
      $$_.ProcessId -ne $$installerPid -and \
      $$_.Name -ieq '${AIONUI_APP_EXECUTABLE_FILENAME}' -and \
      $$path -and \
      $$cmd -notmatch '--type=' -and \
      [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
    }); \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] find instDir=' + $$instDir + ' target=' + $$target + ' installerPid=' + $$installerPid + ' hits=' + $$hits.Count); \
    if ($$hits.Count -gt 0) { $$hits | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress | Add-Content -LiteralPath $$log -Encoding UTF8; exit 0 } \
    exit 1 \
  }"`
  Pop ${_RETURN}
!macroend

!macro AIONUI_STOP_APP_PROCESSES
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$instDir = '$INSTDIR'; \
    $$target = [System.IO.Path]::GetFullPath((Join-Path $$instDir '${AIONUI_APP_EXECUTABLE_FILENAME}')); \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    $$all = @(Get-CimInstance -ClassName Win32_Process); \
    $$main = @($$all | Where-Object { \
      $$path = $$_.ExecutablePath; \
      $$cmd = $$_.CommandLine; \
      if (-not $$path) { $$path = $$_.Path } \
      $$_.ProcessId -ne $$installerPid -and \
      $$_.Name -ieq '${AIONUI_APP_EXECUTABLE_FILENAME}' -and \
      $$path -and \
      $$cmd -notmatch '--type=' -and \
      [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
    }); \
    $$ids = @($$main | ForEach-Object { [int]$$_.ProcessId }); \
    $$frontier = @($$ids); \
    while ($$frontier.Count -gt 0) { \
      $$children = @($$all | Where-Object { $$frontier -contains [int]$$_.ParentProcessId -and [int]$$_.ProcessId -ne [int]$$installerPid }); \
      $$childIds = @($$children | ForEach-Object { [int]$$_.ProcessId }); \
      $$ids = @($$ids + $$childIds | Select-Object -Unique); \
      $$frontier = $$childIds; \
    } \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] stop target=' + $$target + ' installerPid=' + $$installerPid + ' ids=' + ($$ids -join ',')); \
    foreach ($$id in ($$ids | Sort-Object -Descending)) { Stop-Process -Id $$id -Force -ErrorAction SilentlyContinue } \
    exit 0 \
  }"`
  Pop $AionUiStopResult
!macroend

!macro customCheckAppRunning
  Var /GLOBAL AionUiCheckResult
  Var /GLOBAL AionUiCloseRetries
  Var /GLOBAL AionUiStopResult

  !insertmacro AIONUI_FIND_APP_PROCESS $AionUiCheckResult
  ${If} $AionUiCheckResult == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK aionui_do_stop_process
    Quit

    aionui_do_stop_process:
      DetailPrint "$(appClosing)"
      !insertmacro AIONUI_STOP_APP_PROCESSES
      StrCpy $AionUiCloseRetries 0

    aionui_wait_for_close:
      Sleep 1000
      !insertmacro AIONUI_FIND_APP_PROCESS $AionUiCheckResult
      ${If} $AionUiCheckResult == 0
        IntOp $AionUiCloseRetries $AionUiCloseRetries + 1
        ${If} $AionUiCloseRetries > 10
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY aionui_wait_for_close
          Quit
        ${Else}
          !insertmacro AIONUI_STOP_APP_PROCESSES
          Goto aionui_wait_for_close
        ${EndIf}
      ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro AIONUI_REPAIR_INSTALLED_UNINSTALLER
!macroend

!macro AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES _RUNTIME_KEY
  InitPluginsDir
  File "/oname=$PLUGINSDIR\verify-bundled-aioncore-install.ps1" "${PROJECT_DIR}\resources\verify-bundled-aioncore-install.ps1"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\verify-bundled-aioncore-install.ps1" -InstallDir "$INSTDIR" -RuntimeKey "${_RUNTIME_KEY}" -LogPath "$TEMP\${AIONUI_PROCESS_CHECK_LOG}"`
  Pop $AionUiVerifyResourceResult

  ${If} $AionUiVerifyResourceResult != 0
    Abort `Bundled AionCore resources are incomplete after installation.`
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "win32-x64"
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
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro AIONUI_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER"
!macroend

!macro customUnInit
  !insertmacro AIONUI_LOG_EVENT "uninit instDir=$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro AIONUI_LOG_EVENT "uninstall-section start instDir=$INSTDIR"
!macroend

!macro customRemoveFiles
  !insertmacro AIONUI_LOG_EVENT "remove-start instDir=$INSTDIR"
  StrCpy $R1 ""
  Var /GLOBAL AionUiRemoveDirResult

  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R0
    !insertmacro AIONUI_LOG_EVENT "remove-atomic result=$R0"

    ${if} $R0 != 0
      DetailPrint "Atomic update cleanup failed; restoring previous installation before recursive cleanup: $R0"
      !insertmacro AIONUI_LOG_ATOMIC_REMOVE_FAILURE
      StrCpy $R1 $R0

      Push ""
      Call un.restoreFiles
      Pop $R0
      !insertmacro AIONUI_LOG_EVENT "remove-restore result=$R0"
    ${endif}
  ${endif}

  SetOutPath $TEMP
  !insertmacro AIONUI_REMOVE_INSTALL_DIR
  ${if} $AionUiRemoveDirResult != 0
    ${if} $R1 != ""
      DetailPrint `Can't safely remove previous installation after atomic cleanup failed. First failed path: $R1`
    ${else}
      DetailPrint `Can't safely remove previous installation: $INSTDIR`
    ${endif}
    SetErrorLevel 2
    Quit
  ${else}
    !insertmacro AIONUI_LOG_EVENT "remove-final errors=0 instDir=$INSTDIR"
  ${endif}
!macroend
!endif

; Check architecture when installer validates install directory
; This is called early in the installer lifecycle and won't conflict with electron-builder
Function .onVerifyInstDir
  ; Block installation on x86 (32-bit) systems first
  ; Must check BEFORE ARM64, since ARM64 with WOW64 may report RunningX64=true
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is 32-bit architecture. Please download the appropriate version for your architecture.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}

  ; Block installation on ARM64 systems
  ${If} ${IsNativeARM64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is ARM64 architecture. Please download the ARM64 version.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}
FunctionEnd
