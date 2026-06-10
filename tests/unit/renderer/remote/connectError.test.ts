/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import enUsSettings from '@/renderer/services/i18n/locales/en-US/settings.json';
import {
  CONNECT_ERROR_CODES,
  connectErrorI18nKey,
  parseConnectErrorCode,
  stripConnectErrorCode,
  type ConnectErrorCode,
} from '@/renderer/utils/remote/connectError';

describe('connectError util', () => {
  describe('parseConnectErrorCode', () => {
    it.each<string>(CONNECT_ERROR_CODES as readonly string[])('parses marker for %s', (code) => {
      expect(parseConnectErrorCode(`[code:${code}] something broke`)).toBe(code);
    });

    it('returns undefined for an unknown marker code', () => {
      expect(parseConnectErrorCode('[code:not_a_real_code] boom')).toBeUndefined();
    });

    it('strips marker for full-shape payload and returns code', () => {
      expect(parseConnectErrorCode('[code:auth_failure] bad token')).toBe('auth_failure');
    });

    it('tolerates leading whitespace before the marker', () => {
      expect(parseConnectErrorCode('   [code:timeout] waited too long')).toBe('timeout');
    });

    it('does not parse markers that are not at the start', () => {
      // Marker is mid-string — not the documented "at the START" placement.
      // Use a code with no text-heuristic overlap so we genuinely test the
      // "marker at start" contract, not the heuristic.
      expect(parseConnectErrorCode('Some context [code:unreachable] then more')).toBeUndefined();
    });

    it('falls back to dns_failure heuristic when text contains "dns"', () => {
      expect(parseConnectErrorCode('DNS_PROBE_FINISHED_NXDOMAIN')).toBe('dns_failure');
      expect(parseConnectErrorCode('dns lookup failed for host')).toBe('dns_failure');
    });

    it('falls back to tls_failure heuristic for certificate/tls/ssl', () => {
      expect(parseConnectErrorCode('self signed certificate in certificate chain')).toBe('tls_failure');
      expect(parseConnectErrorCode('TLS handshake failed')).toBe('tls_failure');
      expect(parseConnectErrorCode('SSL routines:ssl3_read_bytes')).toBe('tls_failure');
    });

    it('falls back to auth_failure heuristic for 401/403/unauthorized/forbidden', () => {
      expect(parseConnectErrorCode('HTTP 401 Unauthorized')).toBe('auth_failure');
      expect(parseConnectErrorCode('Response code: 403')).toBe('auth_failure');
      expect(parseConnectErrorCode('Request failed: Unauthorized')).toBe('auth_failure');
      expect(parseConnectErrorCode('Access forbidden by policy')).toBe('auth_failure');
    });

    it('falls back to connection_refused heuristic for "connection refused"', () => {
      expect(parseConnectErrorCode('Connection refused by server')).toBe('connection_refused');
      expect(parseConnectErrorCode('connect: connection refused')).toBe('connection_refused');
    });

    it('falls back to timeout heuristic for "timed out" / "timeout"', () => {
      expect(parseConnectErrorCode('The request timed out after 30000ms')).toBe('timeout');
      expect(parseConnectErrorCode('Connection timeout while waiting')).toBe('timeout');
    });

    it('returns undefined for unrecognized text', () => {
      expect(parseConnectErrorCode('something completely unrelated happened')).toBeUndefined();
    });

    it('returns undefined for non-string input', () => {
      expect(parseConnectErrorCode(undefined)).toBeUndefined();
    });
  });

  describe('stripConnectErrorCode', () => {
    it('removes a recognized leading marker and preserves the rest', () => {
      expect(stripConnectErrorCode('[code:auth_failure] bad token')).toBe(' bad token');
    });

    it('removes a recognized marker even with leading whitespace', () => {
      expect(stripConnectErrorCode('  [code:timeout] waited too long')).toBe(' waited too long');
    });

    it('does not strip an unknown marker (preserves raw detail)', () => {
      const input = '[code:future_code] details here';
      expect(stripConnectErrorCode(input)).toBe(input);
    });

    it('does not strip a marker that is not at the start', () => {
      const input = 'Some context [code:dns_failure] then more';
      expect(stripConnectErrorCode(input)).toBe(input);
    });

    it('returns the input unchanged when there is no marker', () => {
      expect(stripConnectErrorCode('plain error')).toBe('plain error');
    });

    it('returns the input unchanged for an empty string', () => {
      expect(stripConnectErrorCode('')).toBe('');
    });
  });

  describe('connectErrorI18nKey', () => {
    it('returns the settings.connectError.<code> key for each known code', () => {
      const codes: ConnectErrorCode[] = [
        'dns_failure',
        'tls_failure',
        'auth_failure',
        'not_opencode',
        'connection_refused',
        'timeout',
        'server_error',
        'workspace_not_on_server',
        'unreachable',
      ];
      for (const code of codes) {
        expect(connectErrorI18nKey(code)).toBe(`settings.connectError.${code}`);
      }
    });
  });

  describe('en-US locale coverage', () => {
    it('has a connectError object in the en-US settings locale', () => {
      const connectError = (enUsSettings as { connectError?: Record<string, string> }).connectError;
      expect(connectError).toBeDefined();
      expect(typeof connectError).toBe('object');
    });

    it('has every ConnectErrorCode under settings.connectError in the en-US locale', () => {
      const connectError = (enUsSettings as { connectError?: Record<string, string> }).connectError ?? {};
      for (const code of CONNECT_ERROR_CODES) {
        const value = connectError[code];
        expect(value, `missing en-US key: settings.connectError.${code}`).toBeTypeOf('string');
        expect(value.length, `empty en-US value for settings.connectError.${code}`).toBeGreaterThan(0);
      }
    });
  });
});
