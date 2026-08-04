!ifndef CSBU_WORKMATE_INSTALLER_MESSAGES_NSH
!define CSBU_WORKMATE_INSTALLER_MESSAGES_NSH

!define CSBU_WORKMATE_MSG_INSTALL_FAILED_ZH "CSBU WorkMate 安装失败"
!define CSBU_WORKMATE_MSG_INSTALL_FAILED_EN "CSBU WorkMate installation failed"

!define CSBU_WORKMATE_MSG_SUGGESTED_ACTION_ZH "建议操作"
!define CSBU_WORKMATE_MSG_SUGGESTED_ACTION_EN "Suggested action"

!define CSBU_WORKMATE_MSG_DIAGNOSTICS_ZH "诊断信息"
!define CSBU_WORKMATE_MSG_DIAGNOSTICS_EN "Diagnostics"

!define CSBU_WORKMATE_MSG_INSTALLER_LOG_ZH "安装日志"
!define CSBU_WORKMATE_MSG_INSTALLER_LOG_EN "Installer log"
!define CSBU_WORKMATE_MSG_BLOCK_SEPARATOR "----------------------------------------"

!define CSBU_WORKMATE_MSG_SEND_REPORT_ZH "是否将此安装失败报告发送给 CSBU WorkMate 团队？报告会包含错误码和当前安装日志。"
!define CSBU_WORKMATE_MSG_SEND_REPORT_EN "Send this installer failure report to the CSBU WorkMate team? The report includes the error code and the current installer log."

!define CSBU_WORKMATE_MSG_GENERIC_FAILURE_ZH "安装器无法继续。请查看诊断信息、安装日志路径，或将失败报告发送给 CSBU WorkMate 团队。"
!define CSBU_WORKMATE_MSG_GENERIC_ACTION_ZH "请关闭上面列出的程序后重新运行安装器。如果没有列出具体程序，请重启 Windows 后再次运行安装器。"

!define CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_EN "CSBU WorkMate installation is incomplete. Missing required file:"
!define CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ZH "CSBU WorkMate 安装不完整，缺少必需文件："
!define CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ACTION_EN "Please reinstall CSBU WorkMate or download a newer installer."
!define CSBU_WORKMATE_MSG_VERIFY_REQUIRED_FILE_ACTION_ZH "请重新安装 CSBU WorkMate，或下载更新版本的安装器。"

!define CSBU_WORKMATE_MSG_EXTRACT_FAILED_EN "CSBU WorkMate could not extract the application files correctly."
!define CSBU_WORKMATE_MSG_EXTRACT_FAILED_ZH "CSBU WorkMate 无法正确解压应用文件。"
!define CSBU_WORKMATE_MSG_EXTRACT_FAILED_ACTION_EN "Download a fresh installer and run it again. If it still fails, send the installer report to the CSBU WorkMate team."
!define CSBU_WORKMATE_MSG_EXTRACT_FAILED_ACTION_ZH "请重新下载安装器后再次运行。如果仍然失败，请将安装失败报告发送给 CSBU WorkMate 团队。"

!define CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_EN "CSBU WorkMate installed, but the bundled backend resources are incomplete."
!define CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ZH "CSBU WorkMate 已安装部分文件，但内置后端资源不完整。"
!define CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_EN "Download a fresh installer and run it again. If it still fails, send the installer report to the CSBU WorkMate team."
!define CSBU_WORKMATE_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_ZH "请重新下载安装器后再次运行。如果仍然失败，请将安装失败报告发送给 CSBU WorkMate 团队。"

!define CSBU_WORKMATE_MSG_ARCH_MISMATCH_EN "Installation package architecture mismatch."
!define CSBU_WORKMATE_MSG_ARCH_MISMATCH_ZH "安装包架构不匹配。"
!define CSBU_WORKMATE_MSG_ARCH_MISMATCH_ACTION_EN "Download the CSBU WorkMate installer that matches this Windows architecture, then run it again."
!define CSBU_WORKMATE_MSG_ARCH_MISMATCH_ACTION_ZH "请下载与当前 Windows 架构匹配的 CSBU WorkMate 安装器，然后再次运行。"

!define CSBU_WORKMATE_MSG_UNINSTALLER_COPY_LOCKED_EN "CSBU WorkMate could not overwrite the installed uninstaller because it is locked."
!define CSBU_WORKMATE_MSG_UNINSTALLER_COPY_LOCKED_ZH "CSBU WorkMate 无法覆盖已安装的卸载器，因为该文件被占用。"
!define CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_FAILED_EN "CSBU WorkMate could not rebuild the missing installed uninstaller."
!define CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_FAILED_ZH "CSBU WorkMate 无法重建缺失的已安装卸载器。"
!define CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_MISSING_EN "CSBU WorkMate rebuilt the uninstaller, but the rebuilt file is still missing."
!define CSBU_WORKMATE_MSG_UNINSTALLER_REBUILD_MISSING_ZH "CSBU WorkMate 已尝试重建卸载器，但重建后的文件仍然缺失。"
!define CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_EN "Close CSBU WorkMate, restart Windows if needed, then run this installer again."
!define CSBU_WORKMATE_MSG_UNINSTALLER_REPAIR_ACTION_ZH "请关闭 CSBU WorkMate，必要时重启 Windows，然后再次运行此安装器。"

!define CSBU_WORKMATE_MSG_INSTALL_STATE_WRITE_FAILED_EN "CSBU WorkMate could not save the local installation state required for future updates."
!define CSBU_WORKMATE_MSG_INSTALL_STATE_WRITE_FAILED_ZH "CSBU WorkMate 无法保存后续更新所需的本地安装状态。"
!define CSBU_WORKMATE_MSG_INSTALL_STATE_WRITE_ACTION_EN "Check that Local AppData is writable, then run the installer again."
!define CSBU_WORKMATE_MSG_INSTALL_STATE_WRITE_ACTION_ZH "请确认本地应用数据目录可写，然后重新运行安装器。"

!define CSBU_WORKMATE_MSG_LEGACY_MACHINE_INSTALL_EN "An older all-users installation of CSBU WorkMate was found. This release supports current-user installation only."
!define CSBU_WORKMATE_MSG_LEGACY_MACHINE_INSTALL_ZH "检测到旧的全用户 CSBU WorkMate 安装。本版本仅支持当前用户安装。"
!define CSBU_WORKMATE_MSG_LEGACY_MACHINE_INSTALL_ACTION_EN "Uninstall the older all-users version first, then run this installer again."
!define CSBU_WORKMATE_MSG_LEGACY_MACHINE_INSTALL_ACTION_ZH "请先卸载旧的全用户版本，然后重新运行此安装器。"

!define CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_EN "The previous CSBU WorkMate uninstaller returned an error."
!define CSBU_WORKMATE_MSG_OLD_UNINSTALL_FAILED_ZH "之前的 CSBU WorkMate 卸载器返回错误。"
!define CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_EN "Close the program listed above, then run this installer again. If no program is listed, restart Windows and run this installer again."
!define CSBU_WORKMATE_MSG_OLD_UNINSTALL_ACTION_ZH "请关闭上面列出的程序后重新运行安装器。如果没有列出具体程序，请重启 Windows 后再次运行安装器。"

!define CSBU_WORKMATE_MSG_REPLACE_LOCKED_EN "CSBU WorkMate could not safely replace the previous installation because files are still open."
!define CSBU_WORKMATE_MSG_REPLACE_LOCKED_ZH "CSBU WorkMate 无法安全替换之前的安装，因为仍有文件处于打开状态。"
!define CSBU_WORKMATE_MSG_PREVIOUS_FILE_OPEN_EN "CSBU WorkMate cannot continue because a file in the previous installation is still open."
!define CSBU_WORKMATE_MSG_PREVIOUS_FILE_OPEN_ZH "CSBU WorkMate 无法继续，因为之前安装目录中的某个文件仍处于打开状态。"
!define CSBU_WORKMATE_MSG_REMOVE_PREVIOUS_DIR_EN "CSBU WorkMate could not remove the previous installation directory."
!define CSBU_WORKMATE_MSG_REMOVE_PREVIOUS_DIR_ZH "CSBU WorkMate 无法删除之前的安装目录。"
!define CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_EN "Close the application using the file shown in the previous message, then run this installer again. If you are not sure what to close, restart Windows and run this installer again."
!define CSBU_WORKMATE_MSG_CLOSE_SHOWN_FILE_ACTION_ZH "请关闭上一条提示中占用文件的应用，然后再次运行安装器。如果不确定要关闭哪个程序，请重启 Windows 后再次运行安装器。"
!define CSBU_WORKMATE_MSG_CLOSE_INSTALL_DIR_ACTION_EN "Close CSBU WorkMate and any file browsers in the install directory, then run this installer again."
!define CSBU_WORKMATE_MSG_CLOSE_INSTALL_DIR_ACTION_ZH "请关闭 CSBU WorkMate 以及任何打开安装目录的文件管理器，然后再次运行安装器。"

!define CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_EN "CSBU WorkMate could not finish closing or removing the previous version.$\r$\n$\r$\nClose CSBU WorkMate and any program that may be using files in the install folder, then click Retry.$\r$\n$\r$\nIf Retry keeps returning here, click Cancel. The installer will show the failed path, any program reported by Windows Restart Manager, and the installer log."
!define CSBU_WORKMATE_MSG_APP_CANNOT_BE_CLOSED_ZH "CSBU WorkMate 无法完成关闭或移除旧版本。$\r$\n$\r$\n请关闭 CSBU WorkMate 以及任何可能正在使用安装目录中文件的程序，然后点击重试。$\r$\n$\r$\n如果重试后仍然回到这里，请点击取消。安装器会显示失败路径、Windows Restart Manager 报告的占用程序以及安装日志。"

!define CSBU_WORKMATE_MSG_LOCKER_UNKNOWN_EN "Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder."
!define CSBU_WORKMATE_MSG_LOCKER_UNKNOWN_ZH "Windows 未识别出具体占用进程。请关闭打开安装目录的终端、编辑器和文件管理器。"
!define CSBU_WORKMATE_MSG_UNKNOWN_PROCESS_EN "unknown process"
!define CSBU_WORKMATE_MSG_UNKNOWN_PROCESS_ZH "未知进程"

!define CSBU_WORKMATE_MSG_FILE_OR_FOLDER_IN_USE_EN "CSBU WorkMate cannot continue because a file or folder in the install directory is still in use:"
!define CSBU_WORKMATE_MSG_FILE_OR_FOLDER_IN_USE_ZH "CSBU WorkMate 无法继续，因为安装目录中的文件或文件夹仍被占用："
!define CSBU_WORKMATE_MSG_APPLICATION_USING_IT_EN "Application using it:"
!define CSBU_WORKMATE_MSG_APPLICATION_USING_IT_ZH "正在使用它的应用："
!define CSBU_WORKMATE_MSG_CLOSE_LISTED_RETRY_EN "Close the application listed above, then click Retry. If you are not sure what to close, click Cancel to send the installer log to the CSBU WorkMate team."
!define CSBU_WORKMATE_MSG_CLOSE_LISTED_RETRY_ZH "请关闭上面列出的应用，然后点击重试。如果不确定要关闭哪个程序，请点击取消，将安装日志发送给 CSBU WorkMate 团队。"

!define CSBU_WORKMATE_MSG_CLOSE_OR_REMOVE_PREVIOUS_EN "CSBU WorkMate could not finish closing or removing the previous version."
!define CSBU_WORKMATE_MSG_CLOSE_OR_REMOVE_PREVIOUS_ZH "CSBU WorkMate 无法完成关闭或移除旧版本。"
!define CSBU_WORKMATE_MSG_MAY_USE_INSTALL_DIR_EN "Another program may still be using files in:"
!define CSBU_WORKMATE_MSG_MAY_USE_INSTALL_DIR_ZH "另一个程序可能仍在使用此目录中的文件："
!define CSBU_WORKMATE_MSG_RETRY_AFTER_CLOSING_DIR_EN "Click Retry after closing CSBU WorkMate and any program using that folder. Click Cancel to show the diagnostics and installer log."
!define CSBU_WORKMATE_MSG_RETRY_AFTER_CLOSING_DIR_ZH "请关闭 CSBU WorkMate 以及任何使用该文件夹的程序后点击重试。点击取消会显示诊断信息和安装日志。"

!endif
