!ifndef AIONUI_INSTALLER_ERRORS_SENTRY_NSH
!define AIONUI_INSTALLER_ERRORS_SENTRY_NSH

!include "${PROJECT_DIR}\resources\windows\support\_sentry-dsn.generated.nsh"

!define AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED "E1001"
!define AIONUI_E_OLD_UNINSTALL_FAILED "E1002"
!define AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED "E1003"
!define AIONUI_E_EXTRACT_FAILED "E1010"
!define AIONUI_E_DISK_INSUFFICIENT "E1020"
!define AIONUI_E_BUNDLED_AIONCORE_INCOMPLETE "E1030"
!define AIONUI_E_CORE_APP_FILES_INCOMPLETE "E1031"
!define AIONUI_E_ARCH_MISMATCH "E1040"
!define AIONUI_E_INVALID_INSTALL_PATH "E1090"

!macro AIONUI_FAIL _CODE _DETAIL
  !insertmacro AIONUI_SLOG "event=session-end result=fail code=${_CODE} detail=${_DETAIL}"
  !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
  SetErrorLevel 2
  Quit
!macroend

!macro AIONUI_FAIL_UX _CODE _DETAIL _MSG_ZH _MSG_EN _ACTION_ZH _ACTION_EN
  !insertmacro AIONUI_SLOG "event=session-end result=fail code=${_CODE} detail=${_DETAIL}"
  MessageBox MB_YESNO|MB_ICONSTOP \
    "AionUi installation failed (${_CODE})$\r$\n$\r$\n\
    ${_MSG_EN}$\r$\n${_MSG_ZH}$\r$\n$\r$\n\
    Suggested action:$\r$\n${_ACTION_EN}$\r$\n${_ACTION_ZH}$\r$\n$\r$\n\
    Installer log: %TEMP%\${AIONUI_SESSION_LOG}$\r$\n$\r$\n\
    Send this installer failure report to the AionUi team? The report includes error code ${_CODE} and installer-session.log." \
    /SD IDNO IDYES +1 IDNO +2
  !insertmacro AIONUI_REPORT_TO_SENTRY "${_CODE}" "${_DETAIL}"
  !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
  SetErrorLevel 2
  Quit
!macroend

!macro AIONUI_FAIL_REPORTABLE _CODE _DETAIL _MSG_EN _ACTION_EN
  !insertmacro AIONUI_FAIL_UX ${_CODE} "${_DETAIL}" "" "${_MSG_EN}" "" "${_ACTION_EN}"
!macroend

!macro AIONUI_REPORT_TO_SENTRY _CODE _DETAIL
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$dsn = '${AIONUI_SENTRY_DSN}'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_SESSION_LOG}'; \
    if (-not $$dsn) { Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=report-skipped reason=empty-dsn code=${_CODE}'); exit 0 }; \
    try { \
      $$uri = [Uri]$$dsn; \
      $$projectId = $$uri.AbsolutePath.Trim('/'); \
      $$endpoint = $$uri.Scheme + '://' + $$uri.Host + '/api/' + $$projectId + '/envelope/'; \
      $$logText = if (Test-Path -LiteralPath $$log) { Get-Content -LiteralPath $$log -Raw } else { '' }; \
      $$eventId = [guid]::NewGuid().ToString('N'); \
      $$event = @{ message = 'installer-failure ${_CODE}'; level = 'error'; platform = 'other'; release = '${VERSION}'; tags = @{ code = '${_CODE}'; detail = '${_DETAIL}'; phase = 'installer'; arch = '${AIONUI_TARGET_ARCH}' } } | ConvertTo-Json -Compress -Depth 4; \
      $$header = @{ event_id = $$eventId; dsn = $$dsn } | ConvertTo-Json -Compress; \
      $$eventHeader = @{ type = 'event'; length = [Text.Encoding]::UTF8.GetByteCount($$event); content_type = 'application/json' } | ConvertTo-Json -Compress; \
      $$attachmentHeader = @{ type = 'attachment'; length = [Text.Encoding]::UTF8.GetByteCount($$logText); filename = 'installer-session.log' } | ConvertTo-Json -Compress; \
      $$body = $$header + \"`n\" + $$eventHeader + \"`n\" + $$event + \"`n\" + $$attachmentHeader + \"`n\" + $$logText; \
      Invoke-RestMethod -Uri $$endpoint -Method Post -ContentType 'application/x-sentry-envelope' -Body $$body -TimeoutSec 10 | Out-Null; \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=report-sent code=${_CODE} eventId=' + $$eventId) \
    } catch { \
      Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] event=report-failed code=${_CODE} error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message) \
    } \
  }"`
  Pop $9
  Pop $9
!macroend

!endif
