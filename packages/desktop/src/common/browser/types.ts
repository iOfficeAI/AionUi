/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type BrowserBackendType = 'embedded' | 'external-chrome';

export type ExternalChromeConfig = {
  chromePath?: string;
  port: number;
  userDataDir: string;
};

export type BrowserProfile = {
  id: string;
  name: string;
  backend: BrowserBackendType;
  partition: string;
  externalChrome?: ExternalChromeConfig;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CreateProfileInput = {
  name: string;
  backend?: BrowserBackendType;
  externalChrome?: Partial<ExternalChromeConfig>;
};

export type UpdateProfileInput = {
  id: string;
  name?: string;
  backend?: BrowserBackendType;
  externalChrome?: Partial<ExternalChromeConfig>;
};

export type ClearProfileDataResult = {
  success: boolean;
  profileId: string;
  error?: string;
};

export type ExternalChromeStatus = {
  running: boolean;
  port: number;
  wsEndpoint?: string;
  browserVersion?: string;
  error?: string;
};

// ==========================================
// Automation Engine Actions & Resilient Locators
// ==========================================

export type ResilientLocator = {
  role?: string;
  name?: string;
  label?: string;
  text?: string;
  placeholder?: string;
  testId?: string;
  css?: string;
  xpath?: string;
};

export type LocatorTarget = string | ResilientLocator;

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'pressKey'
  | 'select'
  | 'uploadFile'
  | 'scroll'
  | 'waitFor'
  | 'getText'
  | 'getSnapshot'
  | 'screenshot'
  | 'evaluate'
  | 'manageTabs'
  | 'handleDialog'
  | 'download';

export type NavigateOptions = {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
};

export type ClickOptions = {
  locator: LocatorTarget;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  timeoutMs?: number;
  delayMs?: number;
};

export type TypeOptions = {
  locator: LocatorTarget;
  text: string;
  clearFirst?: boolean;
  delayMs?: number;
  timeoutMs?: number;
};

export type PressKeyOptions = {
  key: string;
  delayMs?: number;
};

export type SelectOptions = {
  locator: LocatorTarget;
  values: string | string[];
  timeoutMs?: number;
};

export type UploadFileOptions = {
  locator: LocatorTarget;
  filePaths: string[];
  timeoutMs?: number;
};

export type ScrollOptions = {
  x?: number;
  y?: number;
  smooth?: boolean;
};

export type WaitForOptions = {
  target?: LocatorTarget;
  state?: 'attached' | 'visible' | 'hidden' | 'networkidle';
  text?: string;
  timeoutMs?: number;
};

export type GetTextOptions = {
  locator: LocatorTarget;
  timeoutMs?: number;
};

export type SnapshotOptions = {
  includeAccessibility?: boolean;
  maxDepth?: number;
};

export type ScreenshotOptions = {
  fullPage?: boolean;
  format?: 'png' | 'jpeg';
  quality?: number;
};

export type EvaluateOptions = {
  script: string;
  args?: unknown[];
};

export type ManageTabsOptions = {
  action: 'list' | 'switch' | 'new' | 'close';
  tabId?: string;
};

export type HandleDialogOptions = {
  action: 'accept' | 'dismiss';
  promptText?: string;
};

export type DownloadOptions = {
  profileId?: string;
  workspace?: string;
  targetDir?: string;
  expectedFilename?: string;
  url?: string;
  timeoutMs?: number;
};

export type DownloadRecord = {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  mimeType: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: number;
  completedTime?: number;
  error?: string;
};

export type BrowserActionParams = {
  navigate?: NavigateOptions;
  click?: ClickOptions;
  type?: TypeOptions;
  pressKey?: PressKeyOptions;
  select?: SelectOptions;
  uploadFile?: UploadFileOptions;
  scroll?: ScrollOptions;
  waitFor?: WaitForOptions;
  getText?: GetTextOptions;
  getSnapshot?: SnapshotOptions;
  screenshot?: ScreenshotOptions;
  evaluate?: EvaluateOptions;
  manageTabs?: ManageTabsOptions;
  handleDialog?: HandleDialogOptions;
  download?: DownloadOptions;
};

export type BrowserActionRequest = {
  action: BrowserActionType;
  params: BrowserActionParams;
  profileId?: string;
  retries?: number;
  timeoutMs?: number;
};

export type ActionResult<T = unknown> = {
  success: boolean;
  action: BrowserActionType;
  data?: T;
  error?: string;
  failureScreenshot?: string;
  durationMs: number;
};

export type AccessibilitySnapshotNode = {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  focused?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  children?: AccessibilitySnapshotNode[];
};

export type BrowserTabInfo = {
  id: string;
  url: string;
  title: string;
  active: boolean;
};
