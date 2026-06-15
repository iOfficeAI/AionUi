/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Telemetry consent store.
 *
 * Telemetry (Sentry crash reporting + startup log upload) is OPT-IN. The
 * default state is NOT consented, so a fresh install never sends crash reports,
 * device identifiers, or log bundles until the user explicitly opts in from the
 * privacy settings. This is the GDPR-safe default for shipped builds.
 *
 * The gate is read synchronously at process startup (before the backend or the
 * renderer config service is available), so consent is persisted in a tiny,
 * standalone JSON file in `userData` — the same convention used by the
 * anonymous analytics id. Every read fails CLOSED: any parse/IO error, missing
 * file, or malformed payload resolves to "not consented".
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const FILE_NAME = 'telemetry-consent.json';

/**
 * Bridge channel keys for the renderer privacy toggle. Defined here so the
 * main-process provider (index.ts) and the renderer settings page share one
 * source of truth without depending on the out-of-band typed bridge registry.
 */
export const TELEMETRY_CONSENT_GET_CHANNEL = 'command-eve.telemetry-consent-get';
export const TELEMETRY_CONSENT_SET_CHANNEL = 'command-eve.telemetry-consent-set';

/** Serializable payload returned to the renderer over the bridge. */
export type TelemetryConsentBridgeResult = {
  consent: boolean;
  updatedAt?: string;
};

/** Persisted consent payload. `consent === true` is the ONLY allowed value. */
export type TelemetryConsentState = {
  /** Whether the user has explicitly opted in to telemetry. Default false. */
  consent: boolean;
  /** ISO timestamp of the last explicit decision (best-effort, optional). */
  updatedAt?: string;
};

/** The fail-closed default: telemetry is OFF until the user opts in. */
export const DEFAULT_TELEMETRY_CONSENT: TelemetryConsentState = { consent: false };

type ReadFileSync = (filePath: string) => string;
type WriteFileSync = (filePath: string, data: string) => void;

/**
 * Pure parse: turn raw JSON file contents into a consent state, failing CLOSED.
 * Only an explicit boolean `true` enables telemetry; anything else is OFF.
 */
export function parseTelemetryConsent(raw: string | undefined | null): TelemetryConsentState {
  if (typeof raw !== 'string' || raw.length === 0) {
    return DEFAULT_TELEMETRY_CONSENT;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_TELEMETRY_CONSENT;
    }
    const consent = (parsed as { consent?: unknown }).consent === true;
    const updatedAtValue = (parsed as { updatedAt?: unknown }).updatedAt;
    const updatedAt = typeof updatedAtValue === 'string' ? updatedAtValue : undefined;
    return updatedAt ? { consent, updatedAt } : { consent };
  } catch {
    // Malformed file → fail closed.
    return DEFAULT_TELEMETRY_CONSENT;
  }
}

/**
 * Pure decision: telemetry is allowed only when the user has explicitly
 * consented. Kept as its own function so the gate logic is trivially testable
 * and impossible to accidentally invert.
 */
export function evaluateTelemetryAllowed(state: TelemetryConsentState | undefined | null): boolean {
  return state?.consent === true;
}

/**
 * Pure read: load consent from a file path via an injected reader, failing
 * CLOSED on any error. Used by both the Electron wrappers and the unit tests.
 */
export function readConsentFromFile(filePath: string, readFileSync: ReadFileSync): TelemetryConsentState {
  try {
    return parseTelemetryConsent(readFileSync(filePath));
  } catch {
    // Missing / unreadable file → not consented.
    return DEFAULT_TELEMETRY_CONSENT;
  }
}

/**
 * Pure write: persist consent to a file path via an injected writer. Returns
 * the normalized state that was written (only `true` enables telemetry).
 */
export function writeConsentToFile(
  filePath: string,
  consent: boolean,
  writeFileSync: WriteFileSync
): TelemetryConsentState {
  const state: TelemetryConsentState = { consent: consent === true, updatedAt: new Date().toISOString() };
  writeFileSync(filePath, JSON.stringify(state));
  return state;
}

function getConsentFilePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

/**
 * Read the persisted consent state (Electron-aware). Fails CLOSED: any error
 * resolves to the not-consented default.
 */
export function readConsent(): TelemetryConsentState {
  try {
    return readConsentFromFile(getConsentFilePath(), (p) => fs.readFileSync(p, 'utf8'));
  } catch {
    return DEFAULT_TELEMETRY_CONSENT;
  }
}

/**
 * Persist the user's explicit consent choice (Electron-aware). Best-effort: a
 * failed write is swallowed so the UI never crashes, but the in-memory return
 * value still reflects the requested choice.
 */
export function setConsent(consent: boolean): TelemetryConsentState {
  const normalized = consent === true;
  try {
    return writeConsentToFile(getConsentFilePath(), normalized, (p, data) =>
      fs.writeFileSync(p, data, { mode: 0o600 })
    );
  } catch {
    return { consent: normalized };
  }
}

/**
 * The single gate every Sentry / telemetry surface must consult. Returns true
 * only when the user has explicitly opted in. Fails CLOSED on any error.
 */
export function isTelemetryAllowed(): boolean {
  try {
    return evaluateTelemetryAllowed(readConsent());
  } catch {
    return false;
  }
}

/**
 * Human-readable disclosure shown in the privacy settings. Describes what is
 * collected, that it is OFF by default, and how to change it. Kept here (not in
 * i18n) so the gate module and the renderer share one source of truth without
 * touching the i18n typegen pipeline.
 */
export const TELEMETRY_DISCLOSURE = [
  'Telemetry is OFF by default. Nothing is sent unless you turn it on here.',
  'When enabled, Command EVE sends anonymous crash reports and a capped, gzipped slice of recent app logs to our error-tracking service (Sentry) to help diagnose failures, tagged with an anonymous random installation id, app version, OS and CPU architecture. No account details, file contents, prompts, API keys or personal data are collected.',
  'You can turn this off again at any time; turning it off stops all crash reporting and log uploads immediately.',
].join('\n\n');
