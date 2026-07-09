; ARM64 architecture entry for the NSIS installer.

!include "x64.nsh"

!define AIONUI_TARGET_ARCH "arm64"
!define AIONUI_RUNTIME_KEY "win32-arm64"
!define AIONUI_EXTRACT_METHOD "zip"

!addincludedir "${PROJECT_DIR}\resources\windows"
!include "installer-common.nsh"

!macro customHeader
  !insertmacro AIONUI_INSTALLER_CUSTOM_HEADER
!macroend

!macro preInit
  !insertmacro AIONUI_INSTALLER_PREINIT
!macroend

!macro customFiles_arm64
  !insertmacro AIONUI_LOG_EXTRACT_RESULT "zip"
!macroend

Function .onVerifyInstDir
  ${IfNot} ${IsNativeARM64}
    !insertmacro AIONUI_FAIL_UX \
      "${AIONUI_E_ARCH_MISMATCH}" \
      "target=arm64 actual=non-arm64" \
      "${AIONUI_MSG_ARCH_MISMATCH_ZH}" \
      "${AIONUI_MSG_ARCH_MISMATCH_EN}" \
      "${AIONUI_MSG_ARCH_MISMATCH_ACTION_ZH}" \
      "${AIONUI_MSG_ARCH_MISMATCH_ACTION_EN}" \
      "target=arm64 actual=non-arm64" \
      "target=arm64 actual=non-arm64"
  ${EndIf}
FunctionEnd
