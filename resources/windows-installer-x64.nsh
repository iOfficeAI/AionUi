; x64 architecture detection for NSIS installer
; Prevents installation on ARM64 systems

!include "x64.nsh"

; Check architecture when installer validates install directory
; This is called early in the installer lifecycle and won't conflict with electron-builder
Function .onVerifyInstDir
  ; Check if system is native ARM64
  ${If} ${IsNativeARM64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is ARM64 architecture. Please download the ARM64 version.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}
FunctionEnd
