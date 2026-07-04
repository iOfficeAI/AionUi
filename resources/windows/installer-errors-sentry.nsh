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
  Push $9
  ${If} ${Silent}
    StrCpy $9 "auto"
  ${Else}
    StrCpy $9 "yes"
    MessageBox MB_YESNO|MB_ICONSTOP \
      "AionUi installation failed (${_CODE})$\r$\n$\r$\n\
      ${_MSG_EN}$\r$\n${_MSG_ZH}$\r$\n$\r$\n\
      Suggested action:$\r$\n${_ACTION_EN}$\r$\n${_ACTION_ZH}$\r$\n$\r$\n\
      Installer log: $AionUiSessionLogPath$\r$\n$\r$\n\
      Send this installer failure report to the AionUi team? The report includes error code ${_CODE} and the current installer log." \
      /SD IDNO IDNO +2
    Goto +2
    StrCpy $9 "no"
  ${EndIf}
  ${If} $9 == "no"
    !insertmacro AIONUI_SLOG "event=report-skipped reason=user-declined code=${_CODE}"
  ${ElseIf} $9 == "auto"
    !insertmacro AIONUI_SLOG "event=report-auto reason=silent code=${_CODE}"
    !insertmacro AIONUI_REPORT_TO_SENTRY_NOUI "${_CODE}" "${_DETAIL}"
  ${Else}
    !insertmacro AIONUI_REPORT_TO_SENTRY "${_CODE}" "${_DETAIL}"
  ${EndIf}
  Pop $9
  !insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
  SetErrorLevel 2
  Quit
!macroend

!macro AIONUI_FAIL_REPORTABLE _CODE _DETAIL _MSG_EN _ACTION_EN
  !insertmacro AIONUI_FAIL_UX ${_CODE} "${_DETAIL}" "" "${_MSG_EN}" "" "${_ACTION_EN}"
!macroend

!macro AIONUI_FAIL_REPORTABLE_ROOTED _ROOT_CODE _WRAPPER_CODE _DETAIL _MSG_EN _ACTION_EN
  !insertmacro AIONUI_FAIL_UX "${_ROOT_CODE}" "wrapperCode=${_WRAPPER_CODE} ${_DETAIL}" "" "${_MSG_EN}" "" "${_ACTION_EN}"
!macroend

!macro AIONUI_REPORT_TO_SENTRY _CODE _DETAIL
  !insertmacro AIONUI_REPORT_TO_SENTRY_IMPL "${_CODE}" "${_DETAIL}" ""
!macroend

!macro AIONUI_REPORT_TO_SENTRY_NOUI _CODE _DETAIL
  !insertmacro AIONUI_REPORT_TO_SENTRY_IMPL "${_CODE}" "${_DETAIL}" "-NoUi"
!macroend

!macro AIONUI_REPORT_TO_SENTRY_IMPL _CODE _DETAIL _NO_UI
  Push $9
  InitPluginsDir
  File /oname=$PLUGINSDIR\aionui-report-installer-failure.ps1 "${PROJECT_DIR}\resources\windows\support\report-installer-failure.ps1"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\aionui-report-installer-failure.ps1" -Dsn "${AIONUI_SENTRY_DSN}" -LogPath "$AionUiSessionLogPath" -Code "${_CODE}" -Detail "${_DETAIL}" -Release "${VERSION}" -Arch "${AIONUI_TARGET_ARCH}" -Session "$AionUiSessionId" -Updated "$AionUiIsUpdated" ${_NO_UI}`
  Pop $9
  Pop $9
!macroend

!endif
