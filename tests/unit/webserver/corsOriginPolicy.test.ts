/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isCorsOriginAllowed } from '../../../src/process/webserver/setup';

describe('webserver CORS origin policy', () => {
  it('allows requests without an Origin header for same-origin and curl clients', () => {
    const allowedOrigins = new Set(['http://127.0.0.1:25808']);

    expect(isCorsOriginAllowed(undefined, allowedOrigins)).toBe(true);
  });

  it('allows configured localhost origins', () => {
    const allowedOrigins = new Set(['http://127.0.0.1:25808']);

    expect(isCorsOriginAllowed('http://127.0.0.1:25808', allowedOrigins)).toBe(true);
  });

  it('rejects opaque null origins', () => {
    const allowedOrigins = new Set(['http://127.0.0.1:25808']);

    expect(isCorsOriginAllowed('null', allowedOrigins)).toBe(false);
  });

  it('rejects origins outside the configured allowlist', () => {
    const allowedOrigins = new Set(['http://127.0.0.1:25808']);

    expect(isCorsOriginAllowed('http://192.168.1.10:25808', allowedOrigins)).toBe(false);
  });
});
