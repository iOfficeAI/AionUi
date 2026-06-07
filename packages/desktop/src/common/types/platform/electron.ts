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

export interface ElectronBridgeAPI {
  emit: <Name extends AdapterEventName>(
    name: Name,
    data: AdapterEventMap[Name]
  ) => Promise<AdapterEventResponseMap[Name]>;
  on: (callback: AdapterMessageCallback) => void;
  // Get absolute path for dragged file/directory.
  getPathForFile?: (file: File) => string;
  // Feedback log collection.
  collectFeedbackLogs?: () => Promise<{ filename: string; data: number[] } | null>;
  // Feedback screenshot capture.
  requestFeedbackScreenshotToken?: () => Promise<string | null>;
  captureFeedbackScreenshot?: (token: string) => Promise<{ filename: string; data: number[] } | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
  }
}
import type {
  AdapterEventMap,
  AdapterEventName,
  AdapterEventResponseMap,
  AdapterMessageCallback,
} from '@/common/adapter/events';
