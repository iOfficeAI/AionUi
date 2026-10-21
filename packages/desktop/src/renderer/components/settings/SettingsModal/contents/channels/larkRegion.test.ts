/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_LARK_REGION, LARK_REGION_META, buildLarkEnableConfig, buildLarkTestExtraConfig } from './larkRegion';

describe('larkRegion', () => {
  it('defaults region to feishu (backward-compat)', () => {
    expect(DEFAULT_LARK_REGION).toBe('feishu');
  });

  it('buildLarkTestExtraConfig carries domain and trims credentials (lark)', () => {
    expect(buildLarkTestExtraConfig('lark', { appId: ' cli_a ', appSecret: ' s ' })).toEqual({
      app_id: 'cli_a',
      app_secret: 's',
      domain: 'lark',
    });
  });

  it('buildLarkTestExtraConfig carries domain (feishu)', () => {
    expect(buildLarkTestExtraConfig('feishu', { appId: 'cli_a', appSecret: 's' }).domain).toBe('feishu');
  });

  it('buildLarkEnableConfig puts domain in credentials and keeps optional fields', () => {
    const cfg = buildLarkEnableConfig('lark', {
      appId: 'cli_a',
      appSecret: 's',
      encryptKey: 'ek',
      verificationToken: 'vt',
    });
    expect(cfg.credentials).toEqual({
      app_id: 'cli_a',
      app_secret: 's',
      encrypt_key: 'ek',
      verification_token: 'vt',
      domain: 'lark',
    });
  });

  it('buildLarkEnableConfig omits blank optional fields as undefined', () => {
    const cfg = buildLarkEnableConfig('feishu', {
      appId: 'cli_a',
      appSecret: 's',
      encryptKey: '',
      verificationToken: '   ',
    });
    expect(cfg.credentials.encrypt_key).toBeUndefined();
    expect(cfg.credentials.verification_token).toBeUndefined();
    expect(cfg.credentials.domain).toBe('feishu');
  });

  it('LARK_REGION_META maps docs URLs and labels per region', () => {
    expect(LARK_REGION_META.feishu.docsUrl).toContain('open.feishu.cn');
    expect(LARK_REGION_META.feishu.label).toBe('Feishu');
    expect(LARK_REGION_META.lark.docsUrl).toContain('open.larksuite.com');
    expect(LARK_REGION_META.lark.label).toBe('Lark');
  });
});
