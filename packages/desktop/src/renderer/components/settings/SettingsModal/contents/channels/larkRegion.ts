/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lark Open Platform region. Feishu (China, open.feishu.cn) and Lark
 * (international, open.larksuite.com) share the same API surface; only the
 * host differs. The backend (aioncore) selects the host from this value.
 */
export type LarkRegion = 'feishu' | 'lark';

/** Default region for new/existing setups (backward-compatible: Feishu). */
export const DEFAULT_LARK_REGION: LarkRegion = 'feishu';

/** Per-region developer-console docs URL and display label. */
export const LARK_REGION_META: Record<LarkRegion, { docsUrl: string; label: string }> = {
  feishu: {
    docsUrl: 'https://open.feishu.cn/document/develop-an-echo-bot/introduction',
    label: 'Feishu',
  },
  lark: {
    docsUrl: 'https://open.larksuite.com/document/develop-an-echo-bot/introduction',
    label: 'Lark',
  },
};

interface LarkTestCredentials {
  appId: string;
  appSecret: string;
}

interface LarkEnableCredentials extends LarkTestCredentials {
  encryptKey?: string;
  verificationToken?: string;
}

/** Build the `extra_config` payload for the test-connection call. */
export const buildLarkTestExtraConfig = (region: LarkRegion, creds: LarkTestCredentials) => ({
  app_id: creds.appId.trim(),
  app_secret: creds.appSecret.trim(),
  domain: region,
});

/** Build the `config` payload for the enable-plugin call. */
export const buildLarkEnableConfig = (region: LarkRegion, creds: LarkEnableCredentials) => ({
  credentials: {
    app_id: creds.appId.trim(),
    app_secret: creds.appSecret.trim(),
    encrypt_key: creds.encryptKey?.trim() || undefined,
    verification_token: creds.verificationToken?.trim() || undefined,
    domain: region,
  },
});
