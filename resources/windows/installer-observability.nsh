!ifndef CSBU_WORKMATE_INSTALLER_OBSERVABILITY_NSH
!define CSBU_WORKMATE_INSTALLER_OBSERVABILITY_NSH

!define CSBU_WORKMATE_APP_EXECUTABLE_FILENAME "CSBU WorkMate.exe"
!define CSBU_WORKMATE_FALLBACK_LOG "csbu-workmate-installer-${VERSION}-fallback-log.jsonl"

!pragma warning disable 6001
Var /GLOBAL CsbuWorkMateSessionId
Var /GLOBAL CsbuWorkMateIsUpdated
Var /GLOBAL CsbuWorkMateSessionLogResult
Var /GLOBAL CsbuWorkMateSessionLogPath

!macro CSBU_WORKMATE_SESSION_HEADER
  !insertmacro CSBU_WORKMATE_SLOG "event=header arch=${CSBU_WORKMATE_TARGET_ARCH} updated=$CsbuWorkMateIsUpdated instDir=$INSTDIR version=${VERSION} log=$CsbuWorkMateSessionLogPath detail=customHeader"
!macroend

!macro CSBU_WORKMATE_SLOG _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$session = '$CsbuWorkMateSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$message = '${_MESSAGE}'; \
    $$event = 'log'; \
    if ($$message -match '(^|\s)event=([^\s]+)') { $$event = $$Matches[2] } else { $$first = @($$message -split '\s+', 2)[0]; if ($$first -and $$first -notmatch '=') { $$event = $$first } }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = $$event; message = $$message }; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro CSBU_WORKMATE_LOG_EVENT _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$session = '$CsbuWorkMateSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$message = '${_MESSAGE}'; \
    $$event = 'log'; \
    if ($$message -match '(^|\s)event=([^\s]+)') { $$event = $$Matches[2] } else { $$first = @($$message -split '\s+', 2)[0]; if ($$first -and $$first -notmatch '=') { $$event = $$first } }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = $$event; message = $$message }; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro CSBU_WORKMATE_LOG_JSON_EVENT _EVENT _JSON_FIELDS
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$CsbuWorkMateSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${CSBU_WORKMATE_FALLBACK_LOG}' }; \
    $$session = '$CsbuWorkMateSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${CSBU_WORKMATE_TARGET_ARCH}'; updated = ('$CsbuWorkMateIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = '${_EVENT}' }; \
    ${_JSON_FIELDS}; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro CSBU_WORKMATE_SESSION_BEGIN
  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "--installer-log=" $R8
  ${IfNot} ${Errors}
    StrCpy $CsbuWorkMateSessionLogPath $R8
  ${EndIf}
  ClearErrors
  ${GetOptions} $R9 "--installer-session=" $R8
  ${IfNot} ${Errors}
    StrCpy $CsbuWorkMateSessionId $R8
  ${EndIf}

  ${If} $CsbuWorkMateSessionLogPath == ""
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$id = '$CsbuWorkMateSessionId'; if (-not $$id) { $$id = [guid]::NewGuid().ToString('N').Substring(0,12) }; $$stamp = Get-Date -Format 'yyyyMMdd'; $$name = 'csbu-workmate-installer-${VERSION}-' + $$stamp + '-log.jsonl'; $$log = Join-Path $$env:TEMP $$name; [Console]::Out.Write($$id + '|' + $$log)"`
    Pop $CsbuWorkMateSessionLogResult
    Pop $CsbuWorkMateSessionLogResult
    StrCpy $CsbuWorkMateSessionId $CsbuWorkMateSessionLogResult 12
    StrCpy $CsbuWorkMateSessionLogPath $CsbuWorkMateSessionLogResult 1024 13
  ${ElseIf} $CsbuWorkMateSessionId == ""
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "[Console]::Out.Write([guid]::NewGuid().ToString('N').Substring(0,12))"`
    Pop $CsbuWorkMateSessionLogResult
    Pop $CsbuWorkMateSessionLogResult
    StrCpy $CsbuWorkMateSessionId $CsbuWorkMateSessionLogResult
  ${EndIf}

  ClearErrors
  ${GetOptions} $R9 "--updated" $R8
  StrCpy $CsbuWorkMateIsUpdated "0"
  ${IfNot} ${Errors}
    StrCpy $CsbuWorkMateIsUpdated "1"
  ${EndIf}

  !insertmacro CSBU_WORKMATE_SLOG "event=session-begin detail=preInit"
!macroend

!macro CSBU_WORKMATE_LOG_EXTRACT_RESULT _METHOD
  ${IfNot} ${FileExists} "$INSTDIR\CSBU WorkMate.exe"
    !insertmacro CSBU_WORKMATE_FAIL_UX \
      "${CSBU_WORKMATE_E_EXTRACT_FAILED}" \
      "event=extract result=fail method=${_METHOD} missing=CSBU WorkMate.exe" \
      "${CSBU_WORKMATE_MSG_EXTRACT_FAILED_ZH}" \
      "${CSBU_WORKMATE_MSG_EXTRACT_FAILED_EN}" \
      "${CSBU_WORKMATE_MSG_EXTRACT_FAILED_ACTION_ZH}" \
      "${CSBU_WORKMATE_MSG_EXTRACT_FAILED_ACTION_EN}" \
      "extract result=fail method=${_METHOD} missing=CSBU WorkMate.exe instDir=$INSTDIR" \
      "extract result=fail method=${_METHOD} missing=CSBU WorkMate.exe instDir=$INSTDIR"
  ${Else}
    !insertmacro CSBU_WORKMATE_SLOG "event=extract result=ok method=${_METHOD} detail=customFiles_${CSBU_WORKMATE_TARGET_ARCH}"
  ${EndIf}
!macroend

!macro CSBU_WORKMATE_SESSION_SUCCESS
  !insertmacro CSBU_WORKMATE_SLOG "event=session-end result=success detail=customInstall"
!macroend

!endif
