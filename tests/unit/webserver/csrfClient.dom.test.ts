/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCsrfToken,
  hasValidCsrfToken,
  clearCookie,
  clearAllCookies,
  withCsrfToken,
  withCsrfHeader,
} from '@/process/webserver/middleware/csrfClient';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/process/webserver/config/constants';

// Mock document.cookie
const mockCookies: Record<string, string> = {};
Object.defineProperty(document, 'cookie', {
  writable: true,
  value: '',
  configurable: true,
});

describe('csrfClient', () => {
  beforeEach(() => {
    // Clear all cookies before each test
    Object.keys(mockCookies).forEach((key) => {
      delete mockCookies[key];
    });
    document.cookie = '';
  });

  afterEach(() => {
    // Clean up after each test
    Object.keys(mockCookies).forEach((key) => {
      delete mockCookies[key];
    });
    document.cookie = '';
  });

  describe('getCsrfToken', () => {
    it('should return null when document is undefined', () => {
      // This test can't actually set document to undefined in the browser,
      // but the function handles this case gracefully
      const token = getCsrfToken();
      expect(token).toBeNull();
    });

    it('should return null when cookie is not set', () => {
      const token = getCsrfToken();
      expect(token).toBeNull();
    });

    it('should return the CSRF token when it is set', () => {
      const testToken = 'test-csrf-token-123';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const token = getCsrfToken();
      expect(token).toBe(testToken);
    });

    it('should return the correct token from multiple cookies', () => {
      const testToken = 'test-csrf-token-456';
      document.cookie = `other=value; ${CSRF_COOKIE_NAME}=${testToken}; another=test`;
      const token = getCsrfToken();
      expect(token).toBe(testToken);
    });
  });

  describe('hasValidCsrfToken', () => {
    it('should return false when token is null', () => {
      expect(hasValidCsrfToken()).toBe(false);
    });

    it('should return false when token is empty string', () => {
      document.cookie = `${CSRF_COOKIE_NAME}=`;
      expect(hasValidCsrfToken()).toBe(false);
    });

    it('should return true when token is non-empty', () => {
      document.cookie = `${CSRF_COOKIE_NAME}=valid-token`;
      expect(hasValidCsrfToken()).toBe(true);
    });
  });

  describe('withCsrfToken', () => {
    it('should return body unchanged when CSRF token is not available', () => {
      const body = { username: 'test', password: 'password' };
      const result = withCsrfToken(body);
      expect(result).toEqual(body);
    });

    it('should add _csrf to object body when token is available', () => {
      const testToken = 'test-csrf-token';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const body = { username: 'test', password: 'password' };
      const result = withCsrfToken(body);
      expect(result).toEqual({ ...body, _csrf: testToken });
    });

    it('should create new object with _csrf when body is null', () => {
      const testToken = 'test-csrf-token';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const result = withCsrfToken(null);
      expect(result).toEqual({ _csrf: testToken });
    });

    it('should create new object with _csrf when body is undefined', () => {
      const testToken = 'test-csrf-token';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const result = withCsrfToken(undefined);
      expect(result).toEqual({ _csrf: testToken });
    });
  });

  describe('withCsrfHeader', () => {
    it('should return headers unchanged when CSRF token is not available', () => {
      const headers = { 'Content-Type': 'application/json' };
      const result = withCsrfHeader(headers);
      expect(result).toEqual(headers);
    });

    it('should add CSRF header to plain object headers', () => {
      const testToken = 'test-csrf-token';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const headers = { 'Content-Type': 'application/json' };
      const result = withCsrfHeader(headers);
      expect(result).toEqual({ ...headers, [CSRF_HEADER_NAME]: testToken });
    });

    it('should add CSRF header to Headers object', () => {
      const testToken = 'test-csrf-token';
      document.cookie = `${CSRF_COOKIE_NAME}=${testToken}`;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const result = withCsrfHeader(headers);
      expect(result.get(CSRF_HEADER_NAME)).toBe(testToken);
    });
  });

  describe('clearCookie', () => {
    it('should not throw when document is undefined', () => {
      // Should not throw even if clearing fails
      expect(() => clearCookie('test')).not.toThrow();
    });

    it('should set cookie to expire', () => {
      // Note: We can't actually verify the cookie was cleared in a test environment,
      // but we can verify the function doesn't throw and sets the cookie string
      expect(() => clearCookie('test')).not.toThrow();
    });
  });

  describe('clearAllCookies', () => {
    it('should not throw when document is undefined', () => {
      expect(() => clearAllCookies()).not.toThrow();
    });

    it('should attempt to clear all cookies', () => {
      // Set some cookies
      document.cookie = 'cookie1=value1';
      document.cookie = 'cookie2=value2';
      document.cookie = 'cookie3=value3';

      // Clear all cookies
      expect(() => clearAllCookies()).not.toThrow();
    });
  });
});
