!ifndef AIONUI_INSTALLER_MESSAGES_NSH
!define AIONUI_INSTALLER_MESSAGES_NSH

!define AIONUI_MSG_INSTALL_FAILED_ZH "AionUi 安装失败"
!define AIONUI_MSG_INSTALL_FAILED_EN "AionUi installation failed"

!define AIONUI_MSG_SUGGESTED_ACTION_ZH "建议操作"
!define AIONUI_MSG_SUGGESTED_ACTION_EN "Suggested action"

!define AIONUI_MSG_DIAGNOSTICS_ZH "诊断信息"
!define AIONUI_MSG_DIAGNOSTICS_EN "Diagnostics"

!define AIONUI_MSG_INSTALLER_LOG_ZH "安装日志"
!define AIONUI_MSG_INSTALLER_LOG_EN "Installer log"
!define AIONUI_MSG_BLOCK_SEPARATOR "----------------------------------------"

!define AIONUI_MSG_SEND_REPORT_ZH "是否将此安装失败报告发送给 AionUi 团队？报告会包含错误码和当前安装日志。"
!define AIONUI_MSG_SEND_REPORT_EN "Send this installer failure report to the AionUi team? The report includes the error code and the current installer log."

!define AIONUI_MSG_GENERIC_FAILURE_ZH "安装器无法继续。请查看诊断信息、安装日志路径，或将失败报告发送给 AionUi 团队。"
!define AIONUI_MSG_GENERIC_ACTION_ZH "请关闭上面列出的程序后重新运行安装器。如果没有列出具体程序，请重启 Windows 后再次运行安装器。"

!define AIONUI_MSG_VERIFY_REQUIRED_FILE_EN "AionUi installation is incomplete. Missing required file:"
!define AIONUI_MSG_VERIFY_REQUIRED_FILE_ZH "AionUi 安装不完整，缺少必需文件："
!define AIONUI_MSG_VERIFY_REQUIRED_FILE_ACTION_EN "Please reinstall AionUi or download a newer installer."
!define AIONUI_MSG_VERIFY_REQUIRED_FILE_ACTION_ZH "请重新安装 AionUi，或下载更新版本的安装器。"

!define AIONUI_MSG_EXTRACT_FAILED_EN "AionUi could not extract the application files correctly."
!define AIONUI_MSG_EXTRACT_FAILED_ZH "AionUi 无法正确解压应用文件。"
!define AIONUI_MSG_EXTRACT_FAILED_ACTION_EN "Download a fresh installer and run it again. If it still fails, send the installer report to the AionUi team."
!define AIONUI_MSG_EXTRACT_FAILED_ACTION_ZH "请重新下载安装器后再次运行。如果仍然失败，请将安装失败报告发送给 AionUi 团队。"

!define AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_EN "AionUi installed, but the bundled AionCore resources are incomplete."
!define AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ZH "AionUi 已安装部分文件，但内置 AionCore 资源不完整。"
!define AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_EN "Download a fresh installer and run it again. If it still fails, send the installer report to the AionUi team."
!define AIONUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_ZH "请重新下载安装器后再次运行。如果仍然失败，请将安装失败报告发送给 AionUi 团队。"

!define AIONUI_MSG_ARCH_MISMATCH_EN "Installation package architecture mismatch."
!define AIONUI_MSG_ARCH_MISMATCH_ZH "安装包架构不匹配。"
!define AIONUI_MSG_ARCH_MISMATCH_ACTION_EN "Download the AionUi installer that matches this Windows architecture, then run it again."
!define AIONUI_MSG_ARCH_MISMATCH_ACTION_ZH "请下载与当前 Windows 架构匹配的 AionUi 安装器，然后再次运行。"

!define AIONUI_MSG_UNINSTALLER_COPY_LOCKED_EN "AionUi could not overwrite the installed uninstaller because it is locked."
!define AIONUI_MSG_UNINSTALLER_COPY_LOCKED_ZH "AionUi 无法覆盖已安装的卸载器，因为该文件被占用。"
!define AIONUI_MSG_UNINSTALLER_REBUILD_FAILED_EN "AionUi could not rebuild the missing installed uninstaller."
!define AIONUI_MSG_UNINSTALLER_REBUILD_FAILED_ZH "AionUi 无法重建缺失的已安装卸载器。"
!define AIONUI_MSG_UNINSTALLER_REBUILD_MISSING_EN "AionUi rebuilt the uninstaller, but the rebuilt file is still missing."
!define AIONUI_MSG_UNINSTALLER_REBUILD_MISSING_ZH "AionUi 已尝试重建卸载器，但重建后的文件仍然缺失。"
!define AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_EN "Close AionUi, restart Windows if needed, then run this installer again."
!define AIONUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH "请关闭 AionUi，必要时重启 Windows，然后再次运行此安装器。"

!define AIONUI_MSG_OLD_UNINSTALL_FAILED_EN "The previous AionUi uninstaller returned an error."
!define AIONUI_MSG_OLD_UNINSTALL_FAILED_ZH "之前的 AionUi 卸载器返回错误。"
!define AIONUI_MSG_OLD_UNINSTALL_ACTION_EN "Close the program listed above, then run this installer again. If no program is listed, restart Windows and run this installer again."
!define AIONUI_MSG_OLD_UNINSTALL_ACTION_ZH "请关闭上面列出的程序后重新运行安装器。如果没有列出具体程序，请重启 Windows 后再次运行安装器。"

!define AIONUI_MSG_REPLACE_LOCKED_EN "AionUi could not safely replace the previous installation because files are still open."
!define AIONUI_MSG_REPLACE_LOCKED_ZH "AionUi 无法安全替换之前的安装，因为仍有文件处于打开状态。"
!define AIONUI_MSG_PREVIOUS_FILE_OPEN_EN "AionUi cannot continue because a file in the previous installation is still open."
!define AIONUI_MSG_PREVIOUS_FILE_OPEN_ZH "AionUi 无法继续，因为之前安装目录中的某个文件仍处于打开状态。"
!define AIONUI_MSG_REMOVE_PREVIOUS_DIR_EN "AionUi could not remove the previous installation directory."
!define AIONUI_MSG_REMOVE_PREVIOUS_DIR_ZH "AionUi 无法删除之前的安装目录。"
!define AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_EN "Close the application using the file shown in the previous message, then run this installer again. If you are not sure what to close, restart Windows and run this installer again."
!define AIONUI_MSG_CLOSE_SHOWN_FILE_ACTION_ZH "请关闭上一条提示中占用文件的应用，然后再次运行安装器。如果不确定要关闭哪个程序，请重启 Windows 后再次运行安装器。"
!define AIONUI_MSG_CLOSE_INSTALL_DIR_ACTION_EN "Close AionUi and any file browsers in the install directory, then run this installer again."
!define AIONUI_MSG_CLOSE_INSTALL_DIR_ACTION_ZH "请关闭 AionUi 以及任何打开安装目录的文件管理器，然后再次运行安装器。"

!define AIONUI_MSG_APP_CANNOT_BE_CLOSED_EN "AionUi could not finish closing or removing the previous version.$\r$\n$\r$\nClose AionUi and any program that may be using files in the install folder, then click Retry.$\r$\n$\r$\nIf Retry keeps returning here, click Cancel. The installer will show the failed path, any program reported by Windows Restart Manager, and the installer log."
!define AIONUI_MSG_APP_CANNOT_BE_CLOSED_ZH "AionUi 无法完成关闭或移除旧版本。$\r$\n$\r$\n请关闭 AionUi 以及任何可能正在使用安装目录中文件的程序，然后点击重试。$\r$\n$\r$\n如果重试后仍然回到这里，请点击取消。安装器会显示失败路径、Windows Restart Manager 报告的占用程序以及安装日志。"

!define AIONUI_MSG_LOCKER_UNKNOWN_EN "Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder."
!define AIONUI_MSG_LOCKER_UNKNOWN_ZH "Windows 未识别出具体占用进程。请关闭打开安装目录的终端、编辑器和文件管理器。"
!define AIONUI_MSG_UNKNOWN_PROCESS_EN "unknown process"
!define AIONUI_MSG_UNKNOWN_PROCESS_ZH "未知进程"

!define AIONUI_MSG_FILE_OR_FOLDER_IN_USE_EN "AionUi cannot continue because a file or folder in the install directory is still in use:"
!define AIONUI_MSG_FILE_OR_FOLDER_IN_USE_ZH "AionUi 无法继续，因为安装目录中的文件或文件夹仍被占用："
!define AIONUI_MSG_APPLICATION_USING_IT_EN "Application using it:"
!define AIONUI_MSG_APPLICATION_USING_IT_ZH "正在使用它的应用："
!define AIONUI_MSG_CLOSE_LISTED_RETRY_EN "Close the application listed above, then click Retry. If you are not sure what to close, click Cancel to send the installer log to the AionUi team."
!define AIONUI_MSG_CLOSE_LISTED_RETRY_ZH "请关闭上面列出的应用，然后点击重试。如果不确定要关闭哪个程序，请点击取消，将安装日志发送给 AionUi 团队。"

!define AIONUI_MSG_CLOSE_OR_REMOVE_PREVIOUS_EN "AionUi could not finish closing or removing the previous version."
!define AIONUI_MSG_CLOSE_OR_REMOVE_PREVIOUS_ZH "AionUi 无法完成关闭或移除旧版本。"
!define AIONUI_MSG_MAY_USE_INSTALL_DIR_EN "Another program may still be using files in:"
!define AIONUI_MSG_MAY_USE_INSTALL_DIR_ZH "另一个程序可能仍在使用此目录中的文件："
!define AIONUI_MSG_RETRY_AFTER_CLOSING_DIR_EN "Click Retry after closing AionUi and any program using that folder. Click Cancel to show the diagnostics and installer log."
!define AIONUI_MSG_RETRY_AFTER_CLOSING_DIR_ZH "请关闭 AionUi 以及任何使用该文件夹的程序后点击重试。点击取消会显示诊断信息和安装日志。"

!endif
