/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type LarkQrLoginSession = {
  expiresIn: number;
  loginUrl: string;
  qrcodeId: string;
};

export type LarkAuthUser = {
  avatar?: string;
  email?: string;
  id: string;
  phone?: string;
  realname: string;
  username: string;
};

export type LarkQrLoginStatus = 'pending' | 'expired' | 'authenticated';

export type LarkQrLoginPollResult = {
  status: LarkQrLoginStatus;
  user?: LarkAuthUser;
};

export type LarkAuthStatus = {
  authenticated: boolean;
  user?: LarkAuthUser;
};

export type LarkAuthErrorCode = 'invalidResponse' | 'networkError' | 'serverError';

export type LarkAuthResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      code: LarkAuthErrorCode;
    };
