/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  commandEveOllamaContextModelRef,
  loadCommandEveRuntimeBootstrapManifest,
  resolveCommandEveRuntimeBootstrapManifestPath,
  resolveCommandEveRuntimeBootstrapPaths,
  selectRuntimeBootstrapTier,
  validateRuntimeBootstrapManifest,
  type RuntimeBootstrapManifest,
  type RuntimeBootstrapReceipt,
  type RuntimeBootstrapStage,
  type RuntimeBootstrapTier,
} from './runtimeBootstrapCore';

export const COMMAND_EVE_LOCAL_RUNTIME_STATUS_BRIDGE_VERSION = 'command-eve-local-runtime-status/v0';

export type CommandEveLocalRuntimeStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveLocalRuntimeTierStatus = 'selected' | 'available' | 'opt_in' | 'pro';

/**
 * How a blocked local stage is fixed — drives the S4 RemediationCard on the
 * read-only /runtime page. Mirrors the S0 onboarding-status canon so both
 * surfaces key off the same reason-code → kind decision:
 *   - `external-link`  → download Ollama (the download step-screen card).
 *   - `pull-progress`  → the model is not (fully) fetched; show the live pull
 *                        poll + explainer (reuses the warm-up poll).
 *   - `cloud-redirect` → this Mac can't run local (RAM/disk); stay on cloud.
 *   - `reinstall`      → our-bug class (Python/Hermes); reinstall, never brew.
 */
export type CommandEveLocalRuntimeRemediationKind =
  | 'external-link'
  | 'pull-progress'
  | 'cloud-redirect'
  | 'reinstall';

export type CommandEveLocalRuntimeBlockedStage = {
  /** The bootstrap stage that blocked (e.g. `ollama`, `model`, `python`). */
  stage_id: RuntimeBootstrapStage['id'];
  /** The stage status that surfaced the block. */
  stage_status: 'blocked' | 'failed';
  /** The machine reason code carried on the blocking stage (e.g. OLLAMA_MISSING). */
  reason_code: string;
  /** How the renderer should remediate it. */
  remediation_kind: CommandEveLocalRuntimeRemediationKind;
  /** Optional raw stage detail (already operator-safe; never a shell command). */
  detail?: string;
};

/**
 * Reason-code → remediation-kind for the read-only /runtime RemediationCard.
 * Kept in lockstep with onboardingStatusCore's LOCAL_BLOCK_REMEDIATION: the
 * difference is only the kind VOCAB the /runtime page renders against
 * (`pull-progress` is the page's name for the html-screen pull poll).
 */
const LOCAL_RUNTIME_REMEDIATION_KIND: Record<string, CommandEveLocalRuntimeRemediationKind> = {
  OLLAMA_MISSING: 'external-link',
  OLLAMA_NOT_RUNNING: 'external-link',
  MODEL_NOT_FETCHED: 'pull-progress',
  MODEL_PULL_FAILED: 'pull-progress',
  BLOCKED_RAM: 'cloud-redirect',
  BLOCKED_DISK: 'cloud-redirect',
  PYTHON_UNSUPPORTED: 'reinstall',
  PYTHON_MISSING: 'reinstall',
  PYTHON_VENV_FAILED: 'reinstall',
  HERMES_MISSING: 'reinstall',
  HERMES_VERSION_MISMATCH: 'reinstall',
  HERMES_INSTALL_FAILED: 'reinstall',
};

function remediationKindForCode(code: string): CommandEveLocalRuntimeRemediationKind {
  // Unknown block code: surface as the our-bug "reinstall" class rather than
  // inventing a brew command or pretending it is fine.
  return LOCAL_RUNTIME_REMEDIATION_KIND[code] || 'reinstall';
}

function buildBlockedStage(
  receipt?: RuntimeBootstrapReceipt
): CommandEveLocalRuntimeBlockedStage | undefined {
  const stages = receipt?.stages;
  if (!Array.isArray(stages)) return undefined;
  // The bootstrap returns the receipt the moment a stage blocks, so at most one
  // blocking stage is present; we still scan defensively for the first one.
  const stage = stages.find((s) => s.status === 'blocked' || s.status === 'failed');
  if (!stage) return undefined;
  const code = String(stage.code || '').trim() || 'UNKNOWN_LOCAL_BLOCK';
  return {
    stage_id: stage.id,
    stage_status: stage.status as 'blocked' | 'failed',
    reason_code: code,
    remediation_kind: remediationKindForCode(code),
    ...(typeof stage.detail === 'string' && stage.detail.trim() ? { detail: stage.detail } : {}),
  };
}

export type CommandEveLocalRuntimeTierCard = {
  id: string;
  label: string;
  model_ref: string;
  runtime_model_ref: string;
  context_length: number;
  max_tokens: number;
  min_unified_memory_gb: number;
  min_free_disk_gb: number;
  status: CommandEveLocalRuntimeTierStatus;
};

export type CommandEveLocalRuntimeStatusModel = {
  schema_version: 'command-eve-local-runtime-status/v0';
  generated_at: string;
  read_only: true;
  release: string;
  hermes: {
    package: string;
    version: string;
  };
  provider: {
    type: 'ollama';
    base_url: string;
    egress_proxy_url: string;
  };
  selected_tier_id: string;
  selected_model_ref: string;
  receipt?: {
    path: string;
    status: RuntimeBootstrapReceipt['status'];
    default_model: string;
    base_model?: string;
    next_action: string;
    completed_at: string;
  };
  model_warmup?: {
    path: string;
    status: 'running' | 'ready' | 'failed' | 'skipped';
    model: string;
    base_url: string;
    started_at: string;
    completed_at?: string;
    elapsed_ms: number;
    error?: string;
  };
  /**
   * The first blocked/failed bootstrap stage, with its reason code mapped to a
   * remediation kind — drives the S4 RemediationCard. Absent when no local
   * stage is blocked (cloud stays the default regardless).
   */
  blocked_stage?: CommandEveLocalRuntimeBlockedStage;
  tiers: CommandEveLocalRuntimeTierCard[];
  warnings: string[];
};

export type CommandEveLocalRuntimeStatusResult = {
  version: typeof COMMAND_EVE_LOCAL_RUNTIME_STATUS_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveLocalRuntimeStatus;
  reason_code?: string;
  message?: string;
  model?: CommandEveLocalRuntimeStatusModel;
  source: {
    manifest_path?: string;
    receipt_path?: string;
    generated_by: 'command-eve-local-runtime-status-core';
  };
};

export type CommandEveLocalRuntimeStatusOptions = {
  userDataPath: string;
  appPath?: string;
  resourcesPath?: string;
  manifestPath?: string;
  receiptPath?: string;
  modelWarmupReceiptPath?: string;
  now?: () => Date;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function parseReceipt(receiptPath: string): { receipt?: RuntimeBootstrapReceipt; warning?: string } {
  if (!fs.existsSync(receiptPath)) return {};
  try {
    const raw = readJsonFile(receiptPath);
    if (!isRecord(raw) || typeof raw.status !== 'string' || typeof raw.default_model !== 'string') {
      return { warning: 'runtime_receipt_schema_mismatch' };
    }
    return { receipt: raw as RuntimeBootstrapReceipt };
  } catch {
    return { warning: 'runtime_receipt_json_invalid' };
  }
}

function parseModelWarmupReceipt(receiptPath: string): {
  receipt?: NonNullable<CommandEveLocalRuntimeStatusModel['model_warmup']>;
  warning?: string;
} {
  if (!fs.existsSync(receiptPath)) return {};
  try {
    const raw = readJsonFile(receiptPath);
    if (
      !isRecord(raw) ||
      raw.version !== 'command-eve-model-warmup/v0' ||
      !['running', 'ready', 'failed', 'skipped'].includes(String(raw.status || '')) ||
      typeof raw.model !== 'string' ||
      typeof raw.base_url !== 'string' ||
      typeof raw.started_at !== 'string' ||
      typeof raw.elapsed_ms !== 'number'
    ) {
      return { warning: 'model_warmup_receipt_schema_mismatch' };
    }
    if (typeof raw.completed_at !== 'undefined' && typeof raw.completed_at !== 'string') {
      return { warning: 'model_warmup_receipt_schema_mismatch' };
    }
    return {
      receipt: {
        path: receiptPath,
        status: raw.status as 'running' | 'ready' | 'failed' | 'skipped',
        model: raw.model,
        base_url: raw.base_url,
        started_at: raw.started_at,
        elapsed_ms: raw.elapsed_ms,
        ...(typeof raw.completed_at === 'string' ? { completed_at: raw.completed_at } : {}),
        ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
      },
    };
  } catch {
    return { warning: 'model_warmup_receipt_json_invalid' };
  }
}

function tierContextLength(tier: RuntimeBootstrapTier): number {
  return tier.context_length || 65_536;
}

function tierMaxTokens(tier: RuntimeBootstrapTier): number {
  return tier.max_tokens || 512;
}

function tierOllamaNumCtx(tier: RuntimeBootstrapTier): number {
  return tier.ollama_num_ctx || tierContextLength(tier);
}

function tierStatus(tier: RuntimeBootstrapTier, selectedTier: RuntimeBootstrapTier): CommandEveLocalRuntimeTierStatus {
  if (tier.id === selectedTier.id) return 'selected';
  if (tier.id.includes('31b')) return 'pro';
  if (tier.default) return 'available';
  return 'opt_in';
}

function buildTierCard(tier: RuntimeBootstrapTier, selectedTier: RuntimeBootstrapTier): CommandEveLocalRuntimeTierCard {
  return {
    id: tier.id,
    label: tier.label,
    model_ref: tier.model_ref,
    runtime_model_ref: commandEveOllamaContextModelRef(tier.model_ref, tierOllamaNumCtx(tier)),
    context_length: tierContextLength(tier),
    max_tokens: tierMaxTokens(tier),
    min_unified_memory_gb: tier.min_unified_memory_gb,
    min_free_disk_gb: tier.min_free_disk_gb,
    status: tierStatus(tier, selectedTier),
  };
}

function resultBase(
  source: CommandEveLocalRuntimeStatusResult['source']
): Pick<CommandEveLocalRuntimeStatusResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_LOCAL_RUNTIME_STATUS_BRIDGE_VERSION,
    source,
  };
}

function inferSelectedTier(
  manifest: RuntimeBootstrapManifest,
  receipt?: RuntimeBootstrapReceipt
): RuntimeBootstrapTier {
  const byReceiptBase = receipt?.base_model
    ? manifest.local_runtime.tiers.find((tier) => tier.model_ref === receipt.base_model)
    : undefined;
  const byReceiptDefault = receipt?.default_model
    ? manifest.local_runtime.tiers.find(
        (tier) => commandEveOllamaContextModelRef(tier.model_ref, tierOllamaNumCtx(tier)) === receipt.default_model
      )
    : undefined;
  return byReceiptBase || byReceiptDefault || selectRuntimeBootstrapTier(manifest);
}

export function buildLocalRuntimeStatus(
  options: CommandEveLocalRuntimeStatusOptions
): CommandEveLocalRuntimeStatusResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const manifestPath =
    options.manifestPath ||
    resolveCommandEveRuntimeBootstrapManifestPath({
      appPath: options.appPath,
      resourcesPath: options.resourcesPath,
    });
  const receiptPath = options.receiptPath || paths.receiptPath;
  const modelWarmupReceiptPath = options.modelWarmupReceiptPath || paths.modelWarmupReceiptPath;
  const base = resultBase({
    manifest_path: manifestPath,
    receipt_path: receiptPath,
    generated_by: 'command-eve-local-runtime-status-core',
  });

  try {
    const manifest = loadCommandEveRuntimeBootstrapManifest(manifestPath);
    const warnings: string[] = [];
    const parsedReceipt = parseReceipt(receiptPath);
    const parsedModelWarmupReceipt = parseModelWarmupReceipt(modelWarmupReceiptPath);
    if (parsedReceipt.warning) warnings.push(parsedReceipt.warning);
    if (!parsedReceipt.receipt) warnings.push('runtime_receipt_missing');
    if (parsedModelWarmupReceipt.warning) warnings.push(parsedModelWarmupReceipt.warning);
    if (!parsedModelWarmupReceipt.receipt) warnings.push('model_warmup_receipt_missing');

    const selectedTier = inferSelectedTier(manifest, parsedReceipt.receipt);
    const manifestFailures = validateRuntimeBootstrapManifest(manifest, selectedTier);
    if (manifestFailures.length) {
      throw new Error(manifestFailures.join(', '));
    }
    const tiers = manifest.local_runtime.tiers.map((tier) => buildTierCard(tier, selectedTier));

    return {
      ...base,
      ok: true,
      status: 'ready',
      model: {
        schema_version: 'command-eve-local-runtime-status/v0',
        generated_at: (options.now ?? (() => new Date()))().toISOString(),
        read_only: true,
        release: manifest.release,
        hermes: {
          package: manifest.hermes.package,
          version: manifest.hermes.version,
        },
        provider: {
          type: manifest.local_runtime.provider,
          base_url: manifest.local_runtime.base_url,
          egress_proxy_url: manifest.local_runtime.egress_proxy_url,
        },
        selected_tier_id: selectedTier.id,
        selected_model_ref: commandEveOllamaContextModelRef(selectedTier.model_ref, tierOllamaNumCtx(selectedTier)),
        receipt: parsedReceipt.receipt
          ? {
              path: receiptPath,
              status: parsedReceipt.receipt.status,
              default_model: parsedReceipt.receipt.default_model,
              base_model: parsedReceipt.receipt.base_model,
              next_action: parsedReceipt.receipt.next_action,
              completed_at: parsedReceipt.receipt.completed_at,
            }
          : undefined,
        blocked_stage: buildBlockedStage(parsedReceipt.receipt),
        model_warmup: parsedModelWarmupReceipt.receipt,
        tiers,
        warnings,
      },
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'LOCAL_RUNTIME_STATUS_FAILED',
      message: error instanceof Error ? error.message : 'Command EVE local runtime status could not be built.',
    };
  }
}
