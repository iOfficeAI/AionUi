/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SafetyActionType = 'publish' | 'send' | 'delete' | 'spend';

export type SafetyGateDetails = {
  platform?: 'instagram' | 'facebook' | string;
  targetAccount?: string;
  caption?: string;
  mediaPath?: string;
  url?: string;
  amount?: string;
  description?: string;
};

export type SafetyGateRequest = {
  id: string;
  actionType: SafetyActionType;
  title: string;
  details: SafetyGateDetails;
  autoApproveEnabled?: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
};

export type SafetyGateResponse = {
  requestId: string;
  approved: boolean;
  rememberChoice?: boolean;
};

export type SocialPostOptions = {
  platform: 'instagram' | 'facebook';
  caption: string;
  mediaPath: string;
  profileId?: string;
  apiCredentials?: {
    accessToken?: string;
    accountId?: string;
    pageId?: string;
  };
  autoApprove?: boolean;
};

export type SocialPostResult = {
  success: boolean;
  platform: string;
  mode: 'official_api' | 'browser_automation';
  postId?: string;
  url?: string;
  error?: string;
  durationMs: number;
};
