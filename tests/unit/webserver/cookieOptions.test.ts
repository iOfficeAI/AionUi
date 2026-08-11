/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCookieOptions, SERVER_CONFIG } from '@process/webserver/config/constants';

const ENV_KEYS = ['AIONUI_HTTPS', 'HTTPS', 'NODE_ENV', 'SERVER_BASE_URL'] as const;

function buildRequest(overrides: Partial<Request>): Request {
  return overrides as Request;
}

describe('getCookieOptions', () => {
  const originalEnv: Record<string, string | undefined> = {};
  const originalRemoteConfig = { ...SERVER_CONFIG._currentConfig };

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    SERVER_CONFIG._currentConfig.allowRemote = false;
    SERVER_CONFIG._currentConfig.host = '127.0.0.1';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    SERVER_CONFIG._currentConfig.allowRemote = originalRemoteConfig.allowRemote;
    SERVER_CONFIG._currentConfig.host = originalRemoteConfig.host;
  });

  it('defaults to strict HTTP cookie for local non-remote server', () => {
    expect(getCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
    });
  });

  it('uses lax when remote mode is enabled over plain HTTP', () => {
    SERVER_CONFIG._currentConfig.allowRemote = true;

    expect(getCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
  });

  it('issues Secure + SameSite=None when AIONUI_HTTPS=true', () => {
    process.env.AIONUI_HTTPS = 'true';

    expect(getCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('issues Secure + SameSite=None when SERVER_BASE_URL is https (nginx TLS terminator)', () => {
    process.env.SERVER_BASE_URL = 'https://aion.example.com';

    expect(getCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('honours req.secure for deployments that enable Express trust proxy', () => {
    const req = buildRequest({ secure: true });

    expect(getCookieOptions(req)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('ignores spoofable X-Forwarded-Proto header without trust proxy', () => {
    const req = buildRequest({
      secure: false,
      get: ((header: string) => (header.toLowerCase() === 'x-forwarded-proto' ? 'https' : undefined)) as Request['get'],
    });

    expect(getCookieOptions(req)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
    });
  });
});
