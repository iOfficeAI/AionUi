/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the telemetry consent store. Telemetry is OPT-IN: the default
 * is NOT consented, the Sentry gate returns false until the user opts in, and
 * setConsent persists across reads. Electron's `app` is mocked so the
 * filesystem-backed wrappers run under the `node` Vitest project, pointed at a
 * fresh temp `userData` dir per test.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable userData dir so each test gets an isolated, empty consent store.
const userDataDir = vi.hoisted(() => ({ value: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir.value;
      return os.tmpdir();
    },
  },
}));

import {
  DEFAULT_TELEMETRY_CONSENT,
  TELEMETRY_DISCLOSURE,
  evaluateTelemetryAllowed,
  isTelemetryAllowed,
  parseTelemetryConsent,
  readConsent,
  readConsentFromFile,
  setConsent,
  writeConsentToFile,
} from '@/process/commandEve/telemetryConsentCore';

const roots: string[] = [];

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-telemetry-consent-'));
  roots.push(root);
  userDataDir.value = root;
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  userDataDir.value = '';
});

const consentFile = () => path.join(userDataDir.value, 'telemetry-consent.json');

describe('default state', () => {
  it('default consent is NOT granted (telemetry OFF)', () => {
    expect(DEFAULT_TELEMETRY_CONSENT.consent).toBe(false);
  });

  it('readConsent returns the not-consented default on a fresh install (no file)', () => {
    expect(readConsent().consent).toBe(false);
  });

  it('isTelemetryAllowed is false by default (fresh install)', () => {
    expect(isTelemetryAllowed()).toBe(false);
  });
});

describe('parseTelemetryConsent (fail closed)', () => {
  it('returns OFF for empty / missing input', () => {
    expect(parseTelemetryConsent(undefined).consent).toBe(false);
    expect(parseTelemetryConsent(null).consent).toBe(false);
    expect(parseTelemetryConsent('').consent).toBe(false);
  });

  it('returns OFF for malformed JSON', () => {
    expect(parseTelemetryConsent('{not json').consent).toBe(false);
  });

  it('returns OFF when consent is missing or not the boolean true', () => {
    expect(parseTelemetryConsent('{}').consent).toBe(false);
    expect(parseTelemetryConsent('{"consent":"true"}').consent).toBe(false);
    expect(parseTelemetryConsent('{"consent":1}').consent).toBe(false);
    expect(parseTelemetryConsent('{"consent":false}').consent).toBe(false);
    expect(parseTelemetryConsent('null').consent).toBe(false);
  });

  it('returns ON only for an explicit boolean true', () => {
    expect(parseTelemetryConsent('{"consent":true}').consent).toBe(true);
  });

  it('preserves a string updatedAt and drops a non-string one', () => {
    expect(parseTelemetryConsent('{"consent":true,"updatedAt":"2026-06-15T00:00:00.000Z"}').updatedAt).toBe(
      '2026-06-15T00:00:00.000Z'
    );
    expect(parseTelemetryConsent('{"consent":true,"updatedAt":123}').updatedAt).toBeUndefined();
  });
});

describe('evaluateTelemetryAllowed', () => {
  it('returns false unless consent is exactly true', () => {
    expect(evaluateTelemetryAllowed(undefined)).toBe(false);
    expect(evaluateTelemetryAllowed(null)).toBe(false);
    expect(evaluateTelemetryAllowed({ consent: false })).toBe(false);
    expect(evaluateTelemetryAllowed({ consent: true })).toBe(true);
  });
});

describe('readConsentFromFile (pure, injected IO)', () => {
  it('fails closed when the reader throws (missing file)', () => {
    const state = readConsentFromFile('/does/not/exist.json', () => {
      throw new Error('ENOENT');
    });
    expect(state.consent).toBe(false);
  });

  it('reads a consented file', () => {
    const state = readConsentFromFile('/x.json', () => '{"consent":true}');
    expect(state.consent).toBe(true);
  });
});

describe('writeConsentToFile (pure, injected IO)', () => {
  it('writes a normalized true payload with a timestamp', () => {
    let written = '';
    const state = writeConsentToFile('/x.json', true, (_p, data) => {
      written = data;
    });
    expect(state.consent).toBe(true);
    expect(JSON.parse(written).consent).toBe(true);
    expect(typeof JSON.parse(written).updatedAt).toBe('string');
  });

  it('coerces any truthy non-true value to false', () => {
    let written = '';
    // @ts-expect-error — deliberately passing a non-boolean to prove coercion.
    const state = writeConsentToFile('/x.json', 'yes', (_p, data) => {
      written = data;
    });
    expect(state.consent).toBe(false);
    expect(JSON.parse(written).consent).toBe(false);
  });
});

describe('setConsent persistence (filesystem round-trip)', () => {
  it('setConsent(true) persists and is visible to a fresh readConsent / isTelemetryAllowed', () => {
    expect(isTelemetryAllowed()).toBe(false);

    setConsent(true);

    expect(fs.existsSync(consentFile())).toBe(true);
    expect(readConsent().consent).toBe(true);
    expect(isTelemetryAllowed()).toBe(true);
  });

  it('setConsent(false) persists the opt-out and gating returns false again', () => {
    setConsent(true);
    expect(isTelemetryAllowed()).toBe(true);

    setConsent(false);

    expect(readConsent().consent).toBe(false);
    expect(isTelemetryAllowed()).toBe(false);
  });

  it('writes the consent file with owner-only permissions (0600)', () => {
    setConsent(true);
    const mode = fs.statSync(consentFile()).mode & 0o777;
    // Windows ignores POSIX modes; only assert on platforms that honor them.
    if (process.platform !== 'win32') {
      expect(mode).toBe(0o600);
    }
  });
});

describe('disclosure string', () => {
  it('states telemetry is off by default and how to change it', () => {
    expect(TELEMETRY_DISCLOSURE).toMatch(/off by default/i);
    expect(TELEMETRY_DISCLOSURE.toLowerCase()).toContain('crash');
    expect(TELEMETRY_DISCLOSURE).toMatch(/turn (this|it) off/i);
  });
});
