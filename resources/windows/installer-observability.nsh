!ifndef AIONUI_INSTALLER_OBSERVABILITY_NSH
!define AIONUI_INSTALLER_OBSERVABILITY_NSH

!define AIONUI_APP_EXECUTABLE_FILENAME "AionUi.exe"
!define AIONUI_PROCESS_CHECK_LOG "aionui-installer-process-check.log"
!define AIONUI_SESSION_LOG "aionui-installer-session.log"

Var /GLOBAL AionUiSessionId
Var /GLOBAL AionUiIsUpdated
Var /GLOBAL AionUiSessionLogResult

!macro AIONUI_SESSION_HEADER
  !insertmacro AIONUI_SLOG "event=header arch=${AIONUI_TARGET_ARCH} updated=$AionUiIsUpdated instDir=$INSTDIR version=${VERSION} detail=customHeader"
!macroend

!macro AIONUI_SLOG _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${AIONUI_SESSION_LOG}'; \
    $$session = '$AionUiSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] session=' + $$session + ' arch=${AIONUI_TARGET_ARCH} updated=$AionUiIsUpdated instDir=$INSTDIR version=${VERSION} ${_MESSAGE}') \
  }"`
  Pop $9
  Pop $9
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

!macro AIONUI_SESSION_BEGIN
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "[guid]::NewGuid().ToString('N').Substring(0,12)"`
  Pop $AionUiSessionLogResult
  Pop $AionUiSessionId
  StrCpy $AionUiSessionId $AionUiSessionId 12

  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "--updated" $R8
  StrCpy $AionUiIsUpdated "0"
  ${IfNot} ${Errors}
    StrCpy $AionUiIsUpdated "1"
  ${EndIf}

  !insertmacro AIONUI_SLOG "event=session-begin detail=preInit"
!macroend

!macro AIONUI_LOG_EXTRACT_RESULT _METHOD
  ${IfNot} ${FileExists} "$INSTDIR\AionUi.exe"
    !insertmacro AIONUI_FAIL ${AIONUI_E_EXTRACT_FAILED} "event=extract result=fail method=${_METHOD} missing=AionUi.exe"
  ${Else}
    !insertmacro AIONUI_SLOG "event=extract result=ok method=${_METHOD} detail=customFiles_${AIONUI_TARGET_ARCH}"
  ${EndIf}
!macroend

!macro AIONUI_SESSION_SUCCESS
  !insertmacro AIONUI_SLOG "event=session-end result=success detail=customInstall"
!macroend

!endif
