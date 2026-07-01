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
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for ARM64 architecture.$\n$\n\
      Your system does not support ARM64. Please download the appropriate version for your architecture.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    !insertmacro AIONUI_FAIL ${AIONUI_E_ARCH_MISMATCH} "target=arm64 actual=non-arm64"
  ${EndIf}
FunctionEnd
