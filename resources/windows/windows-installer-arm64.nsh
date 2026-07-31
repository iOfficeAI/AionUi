; ARM64 architecture entry for the NSIS installer.

!include "x64.nsh"

!define CSBU_WORKMATE_TARGET_ARCH "arm64"
!define CSBU_WORKMATE_RUNTIME_KEY "win32-arm64"
!define CSBU_WORKMATE_EXTRACT_METHOD "zip"

!addincludedir "${PROJECT_DIR}\resources\windows"
!include "installer-common.nsh"

!macro customHeader
  !insertmacro CSBU_WORKMATE_INSTALLER_CUSTOM_HEADER
!macroend

!macro preInit
  !insertmacro CSBU_WORKMATE_INSTALLER_PREINIT
!macroend

!macro customFiles_arm64
  !insertmacro CSBU_WORKMATE_LOG_EXTRACT_RESULT "zip"
!macroend

; Architecture guard. Inserted from CSBU_WORKMATE_INSTALLER_PREINIT (preInit) so it runs before any
; registry mutation, replacing the old .onVerifyInstDir placement which fired after customInit
; had already healed/cleared/repaired an existing install's registry. (Sentry ELECTRON-3BX)
!macro CSBU_WORKMATE_ASSERT_TARGET_ARCH
  Var /GLOBAL CsbuWorkMateActualArch
  ${IfNot} ${IsNativeARM64}
    !insertmacro CSBU_WORKMATE_DETECT_NATIVE_ARCH $CsbuWorkMateActualArch
    !insertmacro CSBU_WORKMATE_FAIL_UX \
      "${CSBU_WORKMATE_E_ARCH_MISMATCH}" \
      "target=arm64 actual=$CsbuWorkMateActualArch" \
      "${CSBU_WORKMATE_MSG_ARCH_MISMATCH_ZH}" \
      "${CSBU_WORKMATE_MSG_ARCH_MISMATCH_EN}" \
      "${CSBU_WORKMATE_MSG_ARCH_MISMATCH_ACTION_ZH}" \
      "${CSBU_WORKMATE_MSG_ARCH_MISMATCH_ACTION_EN}" \
      "target=arm64 actual=$CsbuWorkMateActualArch" \
      "target=arm64 actual=$CsbuWorkMateActualArch"
  ${EndIf}
!macroend
