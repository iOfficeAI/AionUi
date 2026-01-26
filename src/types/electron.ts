// WebUI 状态接口 / WebUI status interface
export interface WebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

// WebUI 重置密码结果 / WebUI reset password result
export interface WebUIResetPasswordResult {
  success: boolean;
  newPassword?: string;
  msg?: string;
}

// WebUI 获取状态结果 / WebUI get status result
export interface WebUIGetStatusResult {
  success: boolean;
  data?: WebUIStatus;
  msg?: string;
}

// WebUI 修改密码结果 / WebUI change password result
export interface WebUIChangePasswordResult {
  success: boolean;
  msg?: string;
}

export interface ElectronBridgeAPI {
  emit: (name: string, data: unknown) => Promise<unknown> | void;
  on: (callback: (event: { value: string }) => void) => void;
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile?: (file: File) => string;
  // 直接 IPC 调用（绕过 bridge 库）/ Direct IPC calls (bypass bridge library)
  webuiResetPassword?: () => Promise<WebUIResetPasswordResult>;
  webuiGetStatus?: () => Promise<WebUIGetStatusResult>;
  // 修改密码（不需要当前密码）/ Change password (no current password required)
  webuiChangePassword?: (newPassword: string) => Promise<WebUIChangePasswordResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
  }
}

export {};
