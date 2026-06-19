/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE inference-router — Phase 1 (SHADOW / pure observability).
 *
 * This module observes inference routing and records what a future enforcing
 * router *would* recommend, WITHOUT changing any actual routing decision. Every
 * receipt is marked `enforced: false`. Phase 1 must:
 *   - NOT change which client/model/provider is actually used,
 *   - NOT loosen the existing egress boundary,
 *   - NOT send any new data anywhere.
 * It only classifies, computes a recommended lane, and records a hash-only
 * receipt that mirrors CommandEveEgressBoundaryReceipt.
 *
 * Data-sensitivity classification REUSES detectCommandEveSensitiveEgress from
 * the egress boundary core (the single source of truth for S0-S3 detection) and
 * does NOT duplicate any of those rules.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { getPlatformServices } from '@/common/platform';
import {
  detectCommandEveSensitiveEgress,
  type CommandEveEgressFinding,
  type CommandEveEgressProvider,
  type CommandEveEgressProviderKind,
} from '@/common/api/egressBoundaryCore';

/**
 * Data-sensitivity tier, derived purely from egress-boundary findings.
 *   S0 = no sensitive content detected
 *   S1 = email addresses present
 *   S2 = German PII (address / phone) present
 *   S3 = secrets / credentials present
 * The highest tier among the findings wins.
 */
export type CommandEveDataSensitivity = 'S0' | 'S1' | 'S2' | 'S3';

/** Coarse task class for routing heuristics (shadow only). */
export type CommandEveRouteTaskClass = 'image_generation' | 'chat' | 'embedding' | 'tool' | 'unknown';

/** Coarse budget class for routing heuristics (shadow only). */
export type CommandEveRouteBudgetClass = 'free_local' | 'standard' | 'premium' | 'unknown';

/** Logical inference lane the router can recommend. */
export type CommandEveRouteLane = 'local' | 'cloud' | 'unknown';

export type CommandEveRouteSensitivityResult = {
  sensitivity: CommandEveDataSensitivity;
  findings: CommandEveEgressFinding[];
  finding_count: number;
};

export type CommandEveRouteDecisionInput = {
  text: string;
  /** The provider the caller is ACTUALLY about to use. Never altered in Phase 1. */
  provider: CommandEveEgressProvider;
  taskClass?: CommandEveRouteTaskClass;
  budgetClass?: CommandEveRouteBudgetClass;
  /** Pre-computed classification, when the caller already ran it. */
  sensitivity?: CommandEveDataSensitivity;
};

export type CommandEveRouteDecision = {
  /** ALWAYS false in Phase 1. The decision is observational only. */
  enforced: false;
  /** The lane actually in effect (derived from the caller's real provider). */
  actual_lane: CommandEveRouteLane;
  /** The lane the router would recommend if it were enforcing. */
  recommended_lane: CommandEveRouteLane;
  /** True when recommended_lane differs from actual_lane (shadow disagreement). */
  would_reroute: boolean;
  sensitivity: CommandEveDataSensitivity;
  task_class: CommandEveRouteTaskClass;
  budget_class: CommandEveRouteBudgetClass;
  reason: string;
};

export type CommandEveRouteReceipt = {
  version: 'command-eve-route-policy-receipt/v0';
  observed_at: string;
  /** Phase-1 invariant surfaced in the receipt itself. */
  enforced: false;
  provider: CommandEveEgressProvider;
  sensitivity: CommandEveDataSensitivity;
  finding_count: number;
  findings: CommandEveEgressFinding[];
  actual_lane: CommandEveRouteLane;
  recommended_lane: CommandEveRouteLane;
  would_reroute: boolean;
  task_class: CommandEveRouteTaskClass;
  budget_class: CommandEveRouteBudgetClass;
  input_sha256: string;
  raw_text_stored: false;
  reason: string;
};

export type CommandEveRouteReceiptInput = {
  text: string;
  provider: CommandEveEgressProvider;
  taskClass?: CommandEveRouteTaskClass;
  budgetClass?: CommandEveRouteBudgetClass;
  now?: Date;
};

const LOCAL_HOST_PATTERNS = ['127.0.0.1', 'localhost', '[::1]', '::1', '0.0.0.0'];

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Classify data sensitivity (S0-S3) by REUSING the egress boundary detector.
 * The highest-severity finding kind present determines the tier.
 */
export function classifyDataSensitivity(text: string): CommandEveRouteSensitivityResult {
  const findings = detectCommandEveSensitiveEgress(text || '');
  const kinds = new Set(findings.map((finding) => finding.kind));
  let sensitivity: CommandEveDataSensitivity = 'S0';
  if (kinds.has('secret') || kinds.has('financial') || kinds.has('health')) {
    sensitivity = 'S3';
  } else if (kinds.has('german_pii') || kinds.has('intl_pii')) {
    sensitivity = 'S2';
  } else if (kinds.has('email')) {
    sensitivity = 'S1';
  }
  return {
    sensitivity,
    findings,
    finding_count: findings.reduce((sum, finding) => sum + finding.count, 0),
  };
}

/**
 * Map a provider to its actual lane. This is a route-policy concern (not an
 * egress-boundary concern), so it lives here. It uses the provider's declared
 * kind when present, falling back to a local-host base-URL heuristic.
 */
export function laneForProvider(provider: CommandEveEgressProvider): CommandEveRouteLane {
  const kind: CommandEveEgressProviderKind = provider.kind || 'unknown';
  if (kind === 'local') return 'local';
  if (kind === 'cloud') return 'cloud';
  const baseUrl = (provider.baseUrl || '').toLowerCase();
  if (baseUrl) {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      if (LOCAL_HOST_PATTERNS.includes(host)) return 'local';
      return 'cloud';
    } catch {
      if (LOCAL_HOST_PATTERNS.some((pattern) => baseUrl.includes(pattern))) return 'local';
    }
  }
  return 'unknown';
}

/**
 * SHADOW route decision. Computes a recommended lane + task/budget class but
 * NEVER enforces it (enforced: false). The actual lane is read from the caller's
 * real provider and is returned untouched — this function does not change which
 * client/model/provider is used.
 *
 * Recommendation heuristic (observation only):
 *   - S2/S3 (German PII / secrets) → recommend `local` to keep sensitive data
 *     off cloud egress (this only RECORDS the recommendation; the egress
 *     boundary remains the actual enforcement layer and is not loosened here).
 *   - otherwise → recommend whatever lane the caller is actually using.
 */
export function decideRoute(input: CommandEveRouteDecisionInput): CommandEveRouteDecision {
  const sensitivity = input.sensitivity ?? classifyDataSensitivity(input.text).sensitivity;
  const taskClass: CommandEveRouteTaskClass = input.taskClass ?? 'unknown';
  const budgetClass: CommandEveRouteBudgetClass = input.budgetClass ?? 'unknown';
  const actualLane = laneForProvider(input.provider);

  const prefersLocal = sensitivity === 'S2' || sensitivity === 'S3';
  const recommendedLane: CommandEveRouteLane = prefersLocal ? 'local' : actualLane;
  const wouldReroute = recommendedLane !== actualLane;

  const reason = prefersLocal
    ? `shadow-prefers-local-for-${sensitivity}`
    : `shadow-honors-actual-lane-${actualLane}`;

  return {
    enforced: false,
    actual_lane: actualLane,
    recommended_lane: recommendedLane,
    would_reroute: wouldReroute,
    sensitivity,
    task_class: taskClass,
    budget_class: budgetClass,
    reason,
  };
}

/**
 * Build a hash-only route receipt mirroring CommandEveEgressBoundaryReceipt.
 * No raw prompt text is ever stored (raw_text_stored: false); only the SHA-256
 * of the input. The receipt always records enforced: false.
 */
export function buildRouteReceipt(input: CommandEveRouteReceiptInput): CommandEveRouteReceipt {
  const text = input.text || '';
  const classification = classifyDataSensitivity(text);
  const decision = decideRoute({
    text,
    provider: input.provider,
    taskClass: input.taskClass,
    budgetClass: input.budgetClass,
    sensitivity: classification.sensitivity,
  });

  return {
    version: 'command-eve-route-policy-receipt/v0',
    observed_at: (input.now || new Date()).toISOString(),
    enforced: false,
    provider: input.provider,
    sensitivity: classification.sensitivity,
    finding_count: classification.finding_count,
    findings: classification.findings,
    actual_lane: decision.actual_lane,
    recommended_lane: decision.recommended_lane,
    would_reroute: decision.would_reroute,
    task_class: decision.task_class,
    budget_class: decision.budget_class,
    input_sha256: sha256Hex(text),
    raw_text_stored: false,
    reason: decision.reason,
  };
}

/**
 * Atomically persist a route receipt with 0o600 permissions, mirroring
 * writeCommandEveEgressBoundaryReceipt. No-op when receiptPath is empty.
 */
export function writeCommandEveRouteReceipt(receiptPath: string, receipt: CommandEveRouteReceipt): void {
  if (!receiptPath) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tempFile = `${receiptPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, receiptPath);
}

/** Directory (under <userData>) where route receipts are persisted. */
export const COMMAND_EVE_ROUTE_RECEIPT_DIR = path.join('command-eve-runtime', 'route-receipts');

/**
 * Resolve a fresh, collision-resistant route-receipt path under
 * <userData>/command-eve-runtime/route-receipts/. Pure path math — does not
 * touch the filesystem.
 */
export function resolveRouteReceiptPath(userDataDir: string, label = 'route'): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '-') || 'route';
  const fileName = `${safeLabel}-${Date.now()}-${process.pid}.json`;
  return path.join(userDataDir, COMMAND_EVE_ROUTE_RECEIPT_DIR, fileName);
}

/** Minimal provider shape the shadow observer needs (subset of TProviderWithModel). */
export type CommandEveRouteProviderLike = {
  platform?: string;
  name?: string;
  use_model?: string;
  base_url?: string;
};

/**
 * Map a caller provider (e.g. TProviderWithModel) to the egress provider shape.
 * Pure: derives kind (local/cloud/unknown) from base_url / platform without
 * touching or mutating the original provider.
 */
export function toRouteProvider(provider: CommandEveRouteProviderLike): CommandEveEgressProvider {
  const baseUrl = provider.base_url || undefined;
  const probe: CommandEveEgressProvider = {
    kind: 'unknown',
    name: provider.name || provider.platform,
    model: provider.use_model,
    baseUrl,
  };
  const lane = laneForProvider(probe);
  const kind: CommandEveEgressProviderKind = lane === 'local' ? 'local' : lane === 'cloud' ? 'cloud' : 'unknown';
  return { ...probe, kind };
}

export type CommandEveRouteShadowOptions = {
  text: string;
  provider: CommandEveRouteProviderLike;
  taskClass?: CommandEveRouteTaskClass;
  budgetClass?: CommandEveRouteBudgetClass;
  label?: string;
  /** Override userData dir (tests). Defaults to platform services data dir. */
  userDataDir?: string;
  now?: Date;
};

export type CommandEveRouteShadowResult = {
  receipt: CommandEveRouteReceipt;
  receiptPath: string | null;
};

/**
 * SHADOW observe-and-record entry point for injection at real routing call
 * sites. It builds and (best-effort) persists a route receipt, then returns it.
 *
 * INVARIANT: this function is pure observation. It NEVER mutates the provider,
 * NEVER changes which client/model/provider is used, and NEVER throws — any
 * persistence or platform error is swallowed so it cannot affect the caller's
 * real routing. Callers must use the receipt for telemetry only.
 */
export function observeRouteShadow(options: CommandEveRouteShadowOptions): CommandEveRouteShadowResult {
  const provider = toRouteProvider(options.provider);
  const receipt = buildRouteReceipt({
    text: options.text,
    provider,
    taskClass: options.taskClass,
    budgetClass: options.budgetClass,
    now: options.now,
  });

  let receiptPath: string | null = null;
  try {
    const userDataDir = options.userDataDir ?? getPlatformServices().paths.getDataDir();
    if (userDataDir) {
      receiptPath = resolveRouteReceiptPath(userDataDir, options.label || 'route');
      writeCommandEveRouteReceipt(receiptPath, receipt);
    }
  } catch (error) {
    receiptPath = null;
    console.warn('[Command EVE] Failed to persist route shadow receipt:', error);
  }

  return { receipt, receiptPath };
}
