; x64 architecture entry for the NSIS installer.

!include "x64.nsh"

!define AIONUI_TARGET_ARCH "x64"
!define AIONUI_RUNTIME_KEY "win32-x64"
!define AIONUI_EXTRACT_METHOD "7z"

!addincludedir "${PROJECT_DIR}\resources\windows"
!include "installer-common.nsh"

!macro customHeader
  !insertmacro AIONUI_INSTALLER_CUSTOM_HEADER
!macroend

!macro preInit
  !insertmacro AIONUI_INSTALLER_PREINIT
!macroend

!macro customFiles_x64
  !insertmacro AIONUI_LOG_EXTRACT_RESULT "7z"
!macroend

Function .onVerifyInstDir
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is 32-bit architecture. Please download the appropriate version for your architecture.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    !insertmacro AIONUI_FAIL ${AIONUI_E_ARCH_MISMATCH} "target=x64 actual=x86"
  ${EndIf}

  ${If} ${IsNativeARM64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is ARM64 architecture. Please download the ARM64 version.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    !insertmacro AIONUI_FAIL ${AIONUI_E_ARCH_MISMATCH} "target=x64 actual=arm64"
  ${EndIf}
FunctionEnd
