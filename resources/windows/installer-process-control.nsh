!ifndef AIONUI_INSTALLER_PROCESS_CONTROL_NSH
!define AIONUI_INSTALLER_PROCESS_CONTROL_NSH

!macro AIONUI_FIND_APP_PROCESS _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$instDir = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    $$ownedPrefix = $$instDir.TrimEnd('\') + '\'; \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    function Test-AionUiOwnedProcess($$proc) { \
      $$path = $$proc.ExecutablePath; \
      if (-not $$path) { $$path = $$proc.Path } \
      if (-not $$path) { return $$false } \
      try { $$full = [System.IO.Path]::GetFullPath($$path) } catch { return $$false } \
      return $$proc.ProcessId -ne $$installerPid -and $$full.StartsWith($$ownedPrefix, [System.StringComparison]::CurrentCultureIgnoreCase) \
    } \
    $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { Test-AionUiOwnedProcess $$_ }); \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=process-find instDir=' + $$instDir + ' ownedPrefix=' + $$ownedPrefix + ' installerPid=' + $$installerPid + ' hits=' + $$hits.Count + ' owned=' + ($$hits.Count -gt 0)); \
    if ($$hits.Count -gt 0) { $$hits | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,Path,CommandLine | ConvertTo-Json -Compress | Add-Content -LiteralPath $$log -Encoding UTF8; exit 0 } \
    exit 1 \
  }"`
  Pop ${_RETURN}
!macroend

!macro AIONUI_STOP_APP_PROCESSES
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$instDir = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    $$ownedPrefix = $$instDir.TrimEnd('\') + '\'; \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    function Test-AionUiOwnedProcess($$proc) { \
      $$path = $$proc.ExecutablePath; \
      if (-not $$path) { $$path = $$proc.Path } \
      if (-not $$path) { return $$false } \
      try { $$full = [System.IO.Path]::GetFullPath($$path) } catch { return $$false } \
      return $$proc.ProcessId -ne $$installerPid -and $$full.StartsWith($$ownedPrefix, [System.StringComparison]::CurrentCultureIgnoreCase) \
    } \
    $$all = @(Get-CimInstance -ClassName Win32_Process); \
    $$owned = @($$all | Where-Object { Test-AionUiOwnedProcess $$_ }); \
    $$ids = @($$owned | ForEach-Object { [int]$$_.ProcessId }); \
    $$frontier = @($$ids); \
    while ($$frontier.Count -gt 0) { \
      $$children = @($$all | Where-Object { $$frontier -contains [int]$$_.ParentProcessId -and [int]$$_.ProcessId -ne [int]$$installerPid } | Where-Object { Test-AionUiOwnedProcess $$_ }); \
      $$childIds = @($$children | ForEach-Object { [int]$$_.ProcessId }); \
      $$ids = @($$ids + $$childIds | Select-Object -Unique); \
      $$frontier = $$childIds; \
    } \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=process-stop ids=' + ($$ids -join ',') + ' result=start instDir=' + $$instDir); \
    foreach ($$id in ($$ids | Sort-Object -Descending)) { Stop-Process -Id $$id -Force -ErrorAction SilentlyContinue } \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=process-stop ids=' + ($$ids -join ',') + ' result=done instDir=' + $$instDir); \
    exit 0 \
  }"`
  Pop $AionUiStopResult
!macroend

!macro AIONUI_QUERY_LOCKERS _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
    $$instDir = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    $$lockerListPath = '$PLUGINSDIR\aionui-rm-lockers.txt'; \
    Set-Content -LiteralPath $$lockerListPath -Encoding UTF8 -Value ''; \
    try { \
      $$source = 'using System; using System.Text; using System.Runtime.InteropServices; namespace AionUi.RestartManager { public enum RM_APP_TYPE { RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000 } [StructLayout(LayoutKind.Sequential)] public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; } [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct RM_PROCESS_INFO { public RM_UNIQUE_PROCESS Process; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName; public RM_APP_TYPE ApplicationType; public uint AppStatus; public uint TSSessionId; [MarshalAs(UnmanagedType.Bool)] public bool bRestartable; } public static class Native { [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey); [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmRegisterResources(uint dwSessionHandle, UInt32 nFiles, string[] rgsFilenames, UInt32 nApplications, IntPtr rgApplications, UInt32 nServices, string[] rgsServiceNames); [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons); [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint pSessionHandle); } }'; \
      Add-Type -TypeDefinition $$source -ErrorAction Stop; \
      $$session = [uint32]0; $$key = New-Object System.Text.StringBuilder 64; \
      $$result = [AionUi.RestartManager.Native]::RmStartSession([ref]$$session, 0, $$key); \
      if ($$result -ne 0) { throw \"RmStartSession=$$result\" } \
      try { \
        $$resources = @($$instDir); \
        $$result = [AionUi.RestartManager.Native]::RmRegisterResources($$session, [uint32]$$resources.Count, [string[]]$$resources, 0, [IntPtr]::Zero, 0, $$null); \
        if ($$result -ne 0) { throw \"RmRegisterResources=$$result\" } \
        $$needed = [uint32]0; $$count = [uint32]0; $$reasons = [uint32]0; \
        $$result = [AionUi.RestartManager.Native]::RmGetList($$session, [ref]$$needed, [ref]$$count, $$null, [ref]$$reasons); \
        $$ERROR_MORE_DATA = 234; \
        if ($$result -ne 0 -and $$result -ne 234) { throw \"RmGetList=$$result\" } \
        $$lockers = @(); \
        if ($$result -eq $$ERROR_MORE_DATA -or $$needed -gt 0) { \
          $$count = $$needed; \
          $$apps = New-Object 'AionUi.RestartManager.RM_PROCESS_INFO[]' $$count; \
          $$result = [AionUi.RestartManager.Native]::RmGetList($$session, [ref]$$needed, [ref]$$count, $$apps, [ref]$$reasons); \
          if ($$result -ne 0) { throw \"RmGetList=$$result\" } \
          $$lockers = @($$apps | Select-Object -First $$count | Where-Object { $$_.Process.dwProcessId -gt 0 } | ForEach-Object { \
            $$name = $$_.strAppName; \
            if (-not $$name) { $$proc = Get-Process -Id $$_.Process.dwProcessId -ErrorAction SilentlyContinue; if ($$proc) { $$name = $$proc.ProcessName } } \
            if (-not $$name) { $$name = 'unknown' } \
            $$name + '(' + $$_.Process.dwProcessId + ')' \
          }); \
        } \
        Set-Content -LiteralPath $$lockerListPath -Encoding UTF8 -Value ($$lockers -join ', '); \
        Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-lockers instDir=' + $$instDir + ' count=' + $$needed + ' lockers=' + ($$lockers -join ',')); \
        if ($$lockers.Count -gt 0) { exit 0 } else { exit 1 } \
      } finally { [void][AionUi.RestartManager.Native]::RmEndSession($$session) } \
    } catch { \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-error instDir=' + $$instDir + ' error=' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop ${_RETURN}
!macroend

!macro AIONUI_WRITE_INSTALLER_LAST_FAILURE_MARKER
  Push $9
  ${If} $AionUiIsUpdated == "1"
    ${If} ${Silent}
      nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
        $$ErrorActionPreference = 'Stop'; \
        $$appDir = Join-Path $$env:APPDATA 'AionUi'; \
        $$marker = Join-Path $$appDir 'installer-last-failure.json'; \
        $$log = Join-Path $$env:TEMP '${AIONUI_PROCESS_CHECK_LOG}'; \
        try { \
          New-Item -ItemType Directory -Path $$appDir -Force | Out-Null; \
          $$payload = [ordered]@{ \
            schemaVersion = 1; \
            kind = 'app-cannot-be-closed'; \
            phase = 'customCheckAppRunning'; \
            silent = $$true; \
            updated = $$true; \
            retryCount = 3; \
            instDir = '$INSTDIR'; \
            logPath = $$log; \
            at = (Get-Date -Format o) \
          }; \
          $$json = $$payload | ConvertTo-Json -Compress -Depth 4; \
          [System.IO.File]::WriteAllText($$marker, $$json, (New-Object System.Text.UTF8Encoding $$false)); \
          Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] marker-write ok path=' + $$marker + ' json={\"schemaVersion\":1,\"kind\":\"app-cannot-be-closed\",\"phase\":\"customCheckAppRunning\",\"silent\":true,\"updated\":true,\"retryCount\":3}') \
        } catch { \
          Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] marker-write failed path=' + $$marker + ' error=' + $$_.Exception.Message) \
        } \
      }"`
      Pop $9
    ${EndIf}
  ${EndIf}
  Pop $9
!macroend

!macro customCheckAppRunning
  Var /GLOBAL AionUiCheckResult
  Var /GLOBAL AionUiCloseRetries
  Var /GLOBAL AionUiStopResult
  Var /GLOBAL AionUiLockerResult
  Var /GLOBAL AionUiLockerList
  Var /GLOBAL AionUiLockerListFile
  InitPluginsDir

  !insertmacro AIONUI_WAIT_FOR_UPDATED_APP_EXIT
  !insertmacro AIONUI_FIND_APP_PROCESS $AionUiCheckResult
  ${If} $AionUiCheckResult == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK aionui_do_stop_process
    !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
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
          !insertmacro AIONUI_WRITE_INSTALLER_LAST_FAILURE_MARKER
          !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
          Quit
        ${Else}
          !insertmacro AIONUI_STOP_APP_PROCESSES
          Goto aionui_wait_for_close
        ${EndIf}
      ${EndIf}
  ${EndIf}

  aionui_query_lockers:
    !insertmacro AIONUI_QUERY_LOCKERS $AionUiLockerResult
    ${If} $AionUiLockerResult == 0
      ${IfNot} ${Silent}
        StrCpy $AionUiLockerList ""
        ClearErrors
        SetDetailsPrint none
        FileOpen $AionUiLockerListFile "$PLUGINSDIR\aionui-rm-lockers.txt" r
        ${IfNot} ${Errors}
          FileRead $AionUiLockerListFile $AionUiLockerList
          FileClose $AionUiLockerListFile
        ${EndIf}
        SetDetailsPrint lastused
        ${If} $AionUiLockerList == ""
          StrCpy $AionUiLockerList "unknown process"
        ${EndIf}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "AionUi installation folder is in use.$\r$\n$\r$\nLocking processes: $AionUiLockerList$\r$\n$\r$\nClose these processes, then retry.$\r$\n$\r$\nLog: %TEMP%\${AIONUI_PROCESS_CHECK_LOG}" /SD IDCANCEL IDRETRY aionui_query_lockers
        Quit
      ${EndIf}
    ${EndIf}
!macroend

!endif
