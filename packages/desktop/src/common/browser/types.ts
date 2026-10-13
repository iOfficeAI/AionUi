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
