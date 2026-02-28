; ARM64 architecture detection for NSIS installer
; Prevents installation on non-ARM64 systems

!include "x64.nsh"

; Check architecture when installer validates install directory
; This is called early in the installer lifecycle and won't conflict with electron-builder
Function .onVerifyInstDir
  ; Check if system is native ARM64
  ${IfNot} ${IsNativeARM64}
    ; System is not ARM64, likely x64 architecture
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for ARM64 architecture.$\n$\n\
      Your system is x64 architecture. Please download the x64 version.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}
FunctionEnd
