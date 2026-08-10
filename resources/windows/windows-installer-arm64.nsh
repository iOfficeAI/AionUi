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

; Architecture guard. Inserted from AIONUI_INSTALLER_PREINIT (preInit) so it runs before any
; registry mutation, replacing the old .onVerifyInstDir placement which fired after customInit
; had already healed/cleared/repaired an existing install's registry. (Sentry ELECTRON-3BX)
!macro AIONUI_ASSERT_TARGET_ARCH
  Var /GLOBAL AionUiActualArch
  ${IfNot} ${IsNativeARM64}
    !insertmacro AIONUI_DETECT_NATIVE_ARCH $AionUiActualArch
    !insertmacro AIONUI_FAIL_UX \
      "${AIONUI_E_ARCH_MISMATCH}" \
      "target=arm64 actual=$AionUiActualArch" \
      "${AIONUI_MSG_ARCH_MISMATCH_ZH}" \
      "${AIONUI_MSG_ARCH_MISMATCH_EN}" \
      "${AIONUI_MSG_ARCH_MISMATCH_ACTION_ZH}" \
      "${AIONUI_MSG_ARCH_MISMATCH_ACTION_EN}" \
      "target=arm64 actual=$AionUiActualArch" \
      "target=arm64 actual=$AionUiActualArch"
  ${EndIf}
!macroend
