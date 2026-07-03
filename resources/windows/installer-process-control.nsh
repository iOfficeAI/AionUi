!ifndef AIONUI_INSTALLER_PROCESS_CONTROL_NSH
!define AIONUI_INSTALLER_PROCESS_CONTROL_NSH

Var /GLOBAL AionUiStopResult
Var /GLOBAL AionUiLockerResult
Var /GLOBAL AionUiLockerList
Var /GLOBAL AionUiLockerListFile

!macro AIONUI_FIND_APP_PROCESS _RETURN
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$AionUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
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
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$AionUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
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

!macro AIONUI_QUERY_LOCKERS _TARGET_PATH _RETURN
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$AionUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
    $$instDir = [System.IO.Path]::GetFullPath('$INSTDIR'); \
    $$targetPath = '${_TARGET_PATH}'; \
    $$lockerListPath = '$PLUGINSDIR\aionui-rm-lockers.txt'; \
    [System.IO.File]::WriteAllText($$lockerListPath, '', (New-Object System.Text.UTF8Encoding $$false)); \
    try { \
      $$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('dXNpbmcgU3lzdGVtOyB1c2luZyBTeXN0ZW0uVGV4dDsgdXNpbmcgU3lzdGVtLlJ1bnRpbWUuSW50ZXJvcFNlcnZpY2VzOyBuYW1lc3BhY2UgQWlvblVpLlJlc3RhcnRNYW5hZ2VyIHsgcHVibGljIGVudW0gUk1fQVBQX1RZUEUgeyBSbVVua25vd25BcHAgPSAwLCBSbU1haW5XaW5kb3cgPSAxLCBSbU90aGVyV2luZG93ID0gMiwgUm1TZXJ2aWNlID0gMywgUm1FeHBsb3JlciA9IDQsIFJtQ29uc29sZSA9IDUsIFJtQ3JpdGljYWwgPSAxMDAwIH0gW1N0cnVjdExheW91dChMYXlvdXRLaW5kLlNlcXVlbnRpYWwpXSBwdWJsaWMgc3RydWN0IFJNX1VOSVFVRV9QUk9DRVNTIHsgcHVibGljIGludCBkd1Byb2Nlc3NJZDsgcHVibGljIFN5c3RlbS5SdW50aW1lLkludGVyb3BTZXJ2aWNlcy5Db21UeXBlcy5GSUxFVElNRSBQcm9jZXNzU3RhcnRUaW1lOyB9IFtTdHJ1Y3RMYXlvdXQoTGF5b3V0S2luZC5TZXF1ZW50aWFsLCBDaGFyU2V0ID0gQ2hhclNldC5Vbmljb2RlKV0gcHVibGljIHN0cnVjdCBSTV9QUk9DRVNTX0lORk8geyBwdWJsaWMgUk1fVU5JUVVFX1BST0NFU1MgUHJvY2VzczsgW01hcnNoYWxBcyhVbm1hbmFnZWRUeXBlLkJ5VmFsVFN0ciwgU2l6ZUNvbnN0ID0gMjU2KV0gcHVibGljIHN0cmluZyBzdHJBcHBOYW1lOyBbTWFyc2hhbEFzKFVubWFuYWdlZFR5cGUuQnlWYWxUU3RyLCBTaXplQ29uc3QgPSA2NCldIHB1YmxpYyBzdHJpbmcgc3RyU2VydmljZVNob3J0TmFtZTsgcHVibGljIFJNX0FQUF9UWVBFIEFwcGxpY2F0aW9uVHlwZTsgcHVibGljIHVpbnQgQXBwU3RhdHVzOyBwdWJsaWMgdWludCBUU1Nlc3Npb25JZDsgW01hcnNoYWxBcyhVbm1hbmFnZWRUeXBlLkJvb2wpXSBwdWJsaWMgYm9vbCBiUmVzdGFydGFibGU7IH0gcHVibGljIHN0YXRpYyBjbGFzcyBOYXRpdmUgeyBbRGxsSW1wb3J0KCJyc3RydG1nci5kbGwiLCBDaGFyU2V0PUNoYXJTZXQuVW5pY29kZSldIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGludCBSbVN0YXJ0U2Vzc2lvbihvdXQgdWludCBwU2Vzc2lvbkhhbmRsZSwgaW50IGR3U2Vzc2lvbkZsYWdzLCBTdHJpbmdCdWlsZGVyIHN0clNlc3Npb25LZXkpOyBbRGxsSW1wb3J0KCJyc3RydG1nci5kbGwiLCBDaGFyU2V0PUNoYXJTZXQuVW5pY29kZSldIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGludCBSbVJlZ2lzdGVyUmVzb3VyY2VzKHVpbnQgZHdTZXNzaW9uSGFuZGxlLCBVSW50MzIgbkZpbGVzLCBzdHJpbmdbXSByZ3NGaWxlbmFtZXMsIFVJbnQzMiBuQXBwbGljYXRpb25zLCBJbnRQdHIgcmdBcHBsaWNhdGlvbnMsIFVJbnQzMiBuU2VydmljZXMsIHN0cmluZ1tdIHJnc1NlcnZpY2VOYW1lcyk7IFtEbGxJbXBvcnQoInJzdHJ0bWdyLmRsbCIpXSBwdWJsaWMgc3RhdGljIGV4dGVybiBpbnQgUm1HZXRMaXN0KHVpbnQgZHdTZXNzaW9uSGFuZGxlLCBvdXQgdWludCBwblByb2NJbmZvTmVlZGVkLCByZWYgdWludCBwblByb2NJbmZvLCBbSW4sIE91dF0gUk1fUFJPQ0VTU19JTkZPW10gcmdBZmZlY3RlZEFwcHMsIHJlZiB1aW50IGxwZHdSZWJvb3RSZWFzb25zKTsgW0RsbEltcG9ydCgicnN0cnRtZ3IuZGxsIildIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGludCBSbUVuZFNlc3Npb24odWludCBwU2Vzc2lvbkhhbmRsZSk7IH0gfQ==')); \
      Add-Type -TypeDefinition $$source -ErrorAction Stop; \
      $$session = [uint32]0; $$key = New-Object System.Text.StringBuilder 64; \
      $$result = [AionUi.RestartManager.Native]::RmStartSession([ref]$$session, 0, $$key); \
      if ($$result -ne 0) { throw \"RmStartSession=$$result\" } \
      try { \
        $$ERROR_MORE_DATA = 234; \
        $$ERROR_ACCESS_DENIED = 5; \
        $$resources = @(); \
        if ($$targetPath -and (Test-Path -LiteralPath $$targetPath -PathType Leaf)) { \
          $$resources = @([System.IO.Path]::GetFullPath($$targetPath)); \
        } elseif ($$targetPath -and (Test-Path -LiteralPath $$targetPath -PathType Container)) { \
          $$root = [System.IO.Path]::GetFullPath($$targetPath); \
          $$topLevel = @(Get-ChildItem -LiteralPath $$root -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $$_.FullName }); \
          $$knownRelative = @('${AIONUI_APP_EXECUTABLE_FILENAME}', '${UNINSTALL_FILENAME}', 'resources\app.asar', 'resources\app-update.yml', 'resources\bundled-aioncore\win32-x64\aioncore.exe'); \
          $$known = @($$knownRelative | ForEach-Object { Join-Path $$root $$_ } | Where-Object { Test-Path -LiteralPath $$_ -PathType Leaf }); \
          $$resources = @($$topLevel + $$known | Where-Object { $$_ -and $$_.Trim().Length -gt 0 } | Select-Object -Unique | Select-Object -First 512); \
        } \
        Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-query-start target=' + $$targetPath + ' instDir=' + $$instDir + ' resources=' + $$resources.Count); \
        if ($$resources.Count -eq 0) { Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-lockers target=' + $$targetPath + ' instDir=' + $$instDir + ' resources=0 count=0 lockers='); exit 1 } \
        for ($$i = 0; $$i -lt $$resources.Count; $$i += 256) { \
          $$end = [Math]::Min($$i + 255, $$resources.Count - 1); \
          $$chunk = [string[]]$$resources[$$i..$$end]; \
          $$result = [AionUi.RestartManager.Native]::RmRegisterResources($$session, [uint32]$$chunk.Count, $$chunk, 0, [IntPtr]::Zero, 0, $$null); \
          if ($$result -ne 0) { throw \"RmRegisterResources=$$result\" } \
        } \
        $$needed = [uint32]0; $$count = [uint32]0; $$reasons = [uint32]0; \
        for ($$attempt = 0; $$attempt -lt 6; $$attempt++) { \
          if ($$attempt -gt 0) { Start-Sleep -Milliseconds (50 * $$attempt) } \
          $$needed = [uint32]0; $$count = [uint32]0; $$reasons = [uint32]0; \
          $$result = [AionUi.RestartManager.Native]::RmGetList($$session, [ref]$$needed, [ref]$$count, $$null, [ref]$$reasons); \
          if ($$result -ne $$ERROR_ACCESS_DENIED) { break } \
        } \
        if ($$result -ne 0 -and $$result -ne 234) { throw \"RmGetList=$$result\" } \
        $$lockers = @(); \
        if ($$result -eq $$ERROR_MORE_DATA -or $$needed -gt 0) { \
          for ($$attempt = 0; $$attempt -lt 6; $$attempt++) { \
            if ($$attempt -gt 0) { Start-Sleep -Milliseconds (50 * $$attempt) } \
            $$count = $$needed; \
            $$apps = New-Object 'AionUi.RestartManager.RM_PROCESS_INFO[]' $$count; \
            $$result = [AionUi.RestartManager.Native]::RmGetList($$session, [ref]$$needed, [ref]$$count, $$apps, [ref]$$reasons); \
            if ($$result -ne $$ERROR_ACCESS_DENIED -and $$result -ne $$ERROR_MORE_DATA) { break } \
          } \
          if ($$result -ne 0) { throw \"RmGetList=$$result\" } \
          $$lockers = @($$apps | Select-Object -First $$count | Where-Object { $$_.Process.dwProcessId -gt 0 } | ForEach-Object { \
            $$name = $$_.strAppName; \
            if (-not $$name) { $$proc = Get-Process -Id $$_.Process.dwProcessId -ErrorAction SilentlyContinue; if ($$proc) { $$name = $$proc.ProcessName } } \
            if (-not $$name) { $$name = 'unknown' } \
            $$name + '(' + $$_.Process.dwProcessId + ')' \
          }); \
        } \
        [System.IO.File]::WriteAllText($$lockerListPath, ($$lockers -join ', '), (New-Object System.Text.UTF8Encoding $$false)); \
        Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-lockers target=' + $$targetPath + ' instDir=' + $$instDir + ' resources=' + $$resources.Count + ' count=' + $$needed + ' lockers=' + ($$lockers -join ',')); \
        if ($$lockers.Count -gt 0) { exit 0 } else { exit 1 } \
      } finally { [void][AionUi.RestartManager.Native]::RmEndSession($$session) } \
    } catch { \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=rm-error target=' + $$targetPath + ' instDir=' + $$instDir + ' error=' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop ${_RETURN}
!macroend

!macro AIONUI_PROMPT_FAILED_PATH_LOCKERS _FAILED_PATH _PHASE _RETRY_LABEL _CANCEL_LABEL _CONTINUE_LABEL
  !insertmacro AIONUI_QUERY_LOCKERS "${_FAILED_PATH}" $AionUiLockerResult
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
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "AionUi cannot continue because a file or folder in the install directory is still in use:$\r$\n${_FAILED_PATH}$\r$\n$\r$\nApplication using it:$\r$\n$AionUiLockerList$\r$\n$\r$\nClose the application listed above, then click Retry. If you are not sure what to close, click Cancel to send the installer log to the AionUi team.$\r$\n$\r$\nInstaller log:$\r$\n$AionUiSessionLogPath" /SD IDCANCEL IDRETRY ${_RETRY_LABEL} IDCANCEL ${_CANCEL_LABEL}
    ${EndIf}
  ${EndIf}
  Goto ${_CONTINUE_LABEL}
!macroend

!macro AIONUI_WRITE_INSTALLER_LAST_FAILURE_MARKER
  Push $9
  ${If} $AionUiIsUpdated == "1"
    ${If} ${Silent}
      nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
        $$ErrorActionPreference = 'Stop'; \
        $$appDir = Join-Path $$env:APPDATA 'AionUi'; \
        $$marker = Join-Path $$appDir 'installer-last-failure.json'; \
        $$log = '$AionUiSessionLogPath'; \
        if (-not $$log) { $$log = Join-Path $$env:TEMP '${AIONUI_FALLBACK_LOG}' }; \
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
  InitPluginsDir
  !insertmacro AIONUI_SESSION_BEGIN

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

!macroend

!endif
