; x64 architecture detection for NSIS installer
; Prevents installation on ARM64 or x86 systems

!include "x64.nsh"

; Check architecture when installer validates install directory
; This is called early in the installer lifecycle and won't conflict with electron-builder
Function .onVerifyInstDir
  ; Block installation on x86 (32-bit) systems first
  ; Must check BEFORE ARM64, since ARM64 with WOW64 may report RunningX64=true
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is 32-bit architecture. Please download the appropriate version for your architecture.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}

  ; Block installation on ARM64 systems
  ${If} ${IsNativeARM64}
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This AionUi installer is designed for x64 architecture.$\n$\n\
      Your system is ARM64 architecture. Please download the ARM64 version.$\n$\n\
      Download: https://github.com/iOfficeAI/AionUi/releases"
    Quit
  ${EndIf}
FunctionEnd
