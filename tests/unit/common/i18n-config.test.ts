/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SUPPORTED_LANGUAGES } from '@/common/config/i18n';

describe('i18n config', () => {
  it('should include uk-UA in supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toContain('uk-UA');
  });

  it('should have zh-CN as the first language in this project', () => {
    expect(SUPPORTED_LANGUAGES[0]).toBe('zh-CN');
  });
});
