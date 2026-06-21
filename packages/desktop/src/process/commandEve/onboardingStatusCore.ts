/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE onboarding-status aggregator (Guided Onboarding, SLICE S0 — the
 * keystone).
 *
 * Two machine-written runtime signals already exist on disk with ZERO renderer
 * consumers:
 *   - `runtime-bootstrap-receipt.json`  (runtimeBootstrapCore writes it atomically
 *     per pushStage; carries `status`, `next_action`, and the per-stage `code`
 *     reason codes OLLAMA_MISSING / PYTHON_UNSUPPORTED / MODEL_NOT_FETCHED /
 *     MODEL_PULL_FAILED / BLOCKED_RAM / BLOCKED_DISK …).
 *   - `first-run-profile.json`          (the founder/company identity seed EVE
 *     greets with).
 *
 * This core READS those two files (no spawn, no network, no write), plus the
 * entitlement status and the license-wire presence, and folds them into ONE
 * read-only setup-completeness model the renderer + EVE can consume.
 *
 * FIRST-VALUE GATE — the whole point of the slice: a Command EVE user who has
 * registered + activated a CEVE license and has a stored cloud bearer is READY
 * the moment those two are true. The local Hermes/Ollama lane is OPT-IN: a
 * blocked local stage is reported as a remediation ITEM, never as a thing that
 * holds back first value. So `first_value_ready` is gated on
 * entitlement + license-wire ONLY, NOT on any local stage.
 *
 * HONESTY: this slice is read+map only. It claims no capability it does not
 * wire here — it never asks for an API key/secret, never claims a connector or
 * a learned-from-seed memory (those are out of this lane, S5/S6).
 */

import fs from 'fs';
import {
  resolveCommandEveRuntimeBootstrapPaths,
  type RuntimeBootstrapIdentityProfile,
  type RuntimeBootstrapReceipt,
  type RuntimeBootstrapStage,
} from './runtimeBootstrapCore';
import {
  getEntitlementStatus,
  type CommandEveEntitlementGateState,
  type CommandEveEntitlementStatusResult,
} from './entitlementCore';
import { hasLicenseWire } from '@/common/config/licenseWireAtRest';

export const COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION = 'command-eve-onboarding-status/v0';

/**
 * Per-item completeness state.
 *   - `ok`      → done, nothing to do.
 *   - `blocked` → a real gap the user must close to use the item.
 *   - `skipped` → not part of the user's chosen path (e.g. the local lane for a
 *     pure cloud user); informational, never a blocker.
 */
export type CommandEveOnboardingItemState = 'ok' | 'blocked' | 'skipped';

/**
 * How a blocked item is fixed — drives the S4 RemediationCard / S3 step-screen.
 *   - `none`          → nothing actionable (ok / skipped).
 *   - `external-link` → an external download/page (e.g. install Ollama).
 *   - `html-screen`   → an in-app step-screen EVE authors (S3 onboarding.html).
 *   - `cloud-redirect`→ stay on the default cloud lane (RAM/disk too small for local).
 *   - `reinstall`     → our-bug class; reinstall Command EVE (never a brew command).
 */
export type CommandEveOnboardingRemediationKind =
  | 'none'
  | 'external-link'
  | 'html-screen'
  | 'cloud-redirect'
  | 'reinstall';

export type CommandEveOnboardingItemId =
  | 'registration'
  | 'license'
  | 'cloud-lane'
  | 'local-lane'
  | 'identity';

export interface CommandEveOnboardingItem {
  id: CommandEveOnboardingItemId;
  state: CommandEveOnboardingItemState;
  /** Plain-German one-liner of what this item means / its current state. */
  plain_meaning: string;
  remediation_kind: CommandEveOnboardingRemediationKind;
  /**
   * The machine reason code that produced a `blocked` state, when one exists
   * (e.g. OLLAMA_MISSING from the receipt stage, or an entitlement reason_code).
   * Absent for `ok` / `skipped`.
   */
  reason_code?: string;
}

export interface CommandEveOnboardingStatusModel {
  schema_version: typeof COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION;
  generated_at: string;
  read_only: true;
  /**
   * THE first-value gate: registered + licensed + a usable cloud bearer.
   * Local stages do NOT factor in — a cloud-only user is ready.
   */
  first_value_ready: boolean;
  /** Mirror of the entitlement gate state (the renderer never re-decides it). */
  entitlement_state: CommandEveEntitlementGateState;
  /** Whether the stored CEVE cloud bearer (license wire) is present. */
  cloud_bearer_available: boolean;
  /** Founder/company greeting seed (no PII beyond what the user themselves entered). */
  identity: {
    founder_name?: string;
    company_name?: string;
    needs_confirmation: boolean;
    confidence: RuntimeBootstrapIdentityProfile['confidence'];
    source: RuntimeBootstrapIdentityProfile['source'];
  };
  items: CommandEveOnboardingItem[];
  /** Non-fatal read warnings (missing/malformed signal files). */
  warnings: string[];
}

export interface CommandEveOnboardingStatusResult {
  version: typeof COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION;
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: CommandEveOnboardingStatusModel;
  source: {
    receipt_path?: string;
    first_run_profile_path?: string;
    generated_by: 'command-eve-onboarding-status-core';
  };
}

export interface CommandEveOnboardingStatusOptions {
  userDataPath: string;
  /** Test overrides. */
  receiptPath?: string;
  firstRunProfilePath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  /**
   * Injectable entitlement reader (tests). Defaults to the real
   * `getEntitlementStatus` against `userDataPath`.
   */
  readEntitlement?: () => CommandEveEntitlementStatusResult;
  /** Injectable license-wire presence check (tests). */
  readLicenseWirePresence?: () => boolean;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The local-lane reason codes the receipt may carry on a `blocked`/`failed`
 * stage, mapped to a remediation kind + a plain-German meaning. This is the
 * single source of truth the S3/S4 surfaces key off.
 */
const LOCAL_BLOCK_REMEDIATION: Record<
  string,
  { kind: CommandEveOnboardingRemediationKind; meaning: string }
> = {
  OLLAMA_MISSING: {
    kind: 'external-link',
    meaning: 'Die lokale KI braucht Ollama. Du kannst es in einem Schritt installieren — oder einfach in der Cloud weiterarbeiten.',
  },
  OLLAMA_NOT_RUNNING: {
    kind: 'html-screen',
    meaning: 'Ollama ist installiert, läuft aber gerade nicht. Ich zeige dir, wie du es startest.',
  },
  MODEL_NOT_FETCHED: {
    kind: 'html-screen',
    meaning: 'Das lokale Modell ist noch nicht heruntergeladen. Ich lade es für dich und zeige den Fortschritt.',
  },
  MODEL_PULL_FAILED: {
    kind: 'html-screen',
    meaning: 'Der Download des lokalen Modells ist abgebrochen. Wir versuchen es erneut, sobald Netz da ist.',
  },
  BLOCKED_RAM: {
    kind: 'cloud-redirect',
    meaning: 'Für die lokale KI reicht der Arbeitsspeicher dieses Macs nicht. Macht nichts — die Cloud-KI läuft sofort.',
  },
  BLOCKED_DISK: {
    kind: 'cloud-redirect',
    meaning: 'Für das lokale Modell ist zu wenig Speicherplatz frei. Die Cloud-KI ist deine Standard-Spur und läuft sofort.',
  },
  PYTHON_UNSUPPORTED: {
    kind: 'reinstall',
    meaning: 'Eine mitgelieferte Komponente passt nicht zu deinem System — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
  PYTHON_MISSING: {
    kind: 'reinstall',
    meaning: 'Eine mitgelieferte Laufzeit-Komponente fehlt — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
  PYTHON_VENV_FAILED: {
    kind: 'reinstall',
    meaning: 'Die lokale Laufzeit konnte nicht eingerichtet werden — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
  HERMES_MISSING: {
    kind: 'reinstall',
    meaning: 'Die lokale Agent-Laufzeit fehlt — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
  HERMES_VERSION_MISMATCH: {
    kind: 'reinstall',
    meaning: 'Die lokale Agent-Laufzeit hat die falsche Version — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
  HERMES_INSTALL_FAILED: {
    kind: 'reinstall',
    meaning: 'Die lokale Agent-Laufzeit ließ sich nicht installieren — das ist unser Fehler. Eine Neuinstallation behebt es.',
  },
};

function defaultLocalRemediation(code: string): {
  kind: CommandEveOnboardingRemediationKind;
  meaning: string;
} {
  return (
    LOCAL_BLOCK_REMEDIATION[code] || {
      // Unknown block code: surface it honestly as a "reinstall (our bug)" class
      // rather than inventing a brew command or pretending it is fine.
      kind: 'reinstall',
      meaning: 'Die lokale KI konnte nicht vollständig vorbereitet werden. Die Cloud-KI läuft weiter; eine Neuinstallation kann die lokale Spur reparieren.',
    }
  );
}

function readReceipt(receiptPath: string): { receipt?: RuntimeBootstrapReceipt; warning?: string } {
  if (!fs.existsSync(receiptPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
    if (!isRecord(raw) || typeof raw.status !== 'string' || !Array.isArray(raw.stages)) {
      return { warning: 'onboarding_receipt_schema_mismatch' };
    }
    return { receipt: raw as RuntimeBootstrapReceipt };
  } catch {
    return { warning: 'onboarding_receipt_json_invalid' };
  }
}

function readFirstRunProfile(profilePath: string): {
  profile?: RuntimeBootstrapIdentityProfile;
  warning?: string;
} {
  if (!fs.existsSync(profilePath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as unknown;
    if (!isRecord(raw) || raw.version !== 'command-eve-first-run-profile/v0') {
      return { warning: 'onboarding_first_run_profile_schema_mismatch' };
    }
    return { profile: raw as RuntimeBootstrapIdentityProfile };
  } catch {
    return { warning: 'onboarding_first_run_profile_json_invalid' };
  }
}

/**
 * Find the first blocked/failed stage in a receipt and return its reason code.
 * The bootstrap returns the receipt the moment a stage blocks, so at most one
 * blocking stage is present; we still scan defensively.
 */
function firstBlockingStage(stages: RuntimeBootstrapStage[]): RuntimeBootstrapStage | undefined {
  return stages.find((stage) => stage.status === 'blocked' || stage.status === 'failed');
}

function entitlementItem(entitlement: CommandEveEntitlementStatusResult): {
  registration: CommandEveOnboardingItem;
  license: CommandEveOnboardingItem;
} {
  const state = entitlement.state;
  const registered =
    state === 'registered_unlicensed' || state === 'entitled' || state === 'expired';
  const licensed = state === 'entitled';

  const registration: CommandEveOnboardingItem = registered
    ? {
        id: 'registration',
        state: 'ok',
        plain_meaning: 'Du bist registriert.',
        remediation_kind: 'none',
      }
    : {
        id: 'registration',
        state: 'blocked',
        plain_meaning: 'Lege kurz dein Konto an, damit ich dich kenne.',
        remediation_kind: 'html-screen',
        reason_code: entitlement.reason_code || 'REGISTRATION_REQUIRED',
      };

  const license: CommandEveOnboardingItem = licensed
    ? {
        id: 'license',
        state: 'ok',
        plain_meaning: 'Deine Lizenz ist aktiv.',
        remediation_kind: 'none',
      }
    : {
        id: 'license',
        state: 'blocked',
        plain_meaning:
          state === 'expired'
            ? 'Deine Lizenz ist abgelaufen — kurz verlängern, dann geht es weiter.'
            : 'Füge deinen Lizenz-Code ein, dann bist du startklar.',
        remediation_kind: 'html-screen',
        reason_code: entitlement.reason_code || (state === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_REQUIRED'),
      };

  return { registration, license };
}

function cloudLaneItem(
  cloudBearerAvailable: boolean,
  licensed: boolean
): CommandEveOnboardingItem {
  if (cloudBearerAvailable) {
    return {
      id: 'cloud-lane',
      state: 'ok',
      plain_meaning: 'Die Cloud-KI ist startklar und antwortet sofort.',
      remediation_kind: 'none',
    };
  }
  // No bearer yet. If licensed, this is a transient re-activation gap; if not
  // licensed, it is simply downstream of the license item (don't double-blame).
  return {
    id: 'cloud-lane',
    state: licensed ? 'blocked' : 'skipped',
    plain_meaning: licensed
      ? 'Die Cloud-KI hat noch keinen Zugang hinterlegt — aktiviere deine Lizenz auf diesem Gerät erneut.'
      : 'Die Cloud-KI wird verfügbar, sobald deine Lizenz aktiv ist.',
    remediation_kind: licensed ? 'html-screen' : 'none',
    ...(licensed ? { reason_code: 'EVE_INFERENCE_NO_BEARER' } : {}),
  };
}

function localLaneItem(receipt?: RuntimeBootstrapReceipt): CommandEveOnboardingItem {
  if (!receipt) {
    // No receipt means the local lane was never prepared. That is the DEFAULT
    // for a cloud-first user — skipped, never a blocker.
    return {
      id: 'local-lane',
      state: 'skipped',
      plain_meaning: 'Die lokale KI ist optional. Du kannst sie später einrichten, wenn du sie brauchst.',
      remediation_kind: 'none',
    };
  }
  if (receipt.status === 'ready') {
    return {
      id: 'local-lane',
      state: 'ok',
      plain_meaning: 'Die lokale KI ist eingerichtet und einsatzbereit.',
      remediation_kind: 'none',
    };
  }
  if (receipt.status === 'skipped') {
    return {
      id: 'local-lane',
      state: 'skipped',
      plain_meaning: 'Die lokale KI ist deaktiviert. Die Cloud-KI ist deine Standard-Spur.',
      remediation_kind: 'none',
    };
  }
  // blocked / failed → surface the specific reason code.
  const stage = firstBlockingStage(receipt.stages);
  const code = stage?.code || 'LOCAL_RUNTIME_BLOCKED';
  const remediation = defaultLocalRemediation(code);
  return {
    id: 'local-lane',
    state: 'blocked',
    plain_meaning: remediation.meaning,
    remediation_kind: remediation.kind,
    reason_code: code,
  };
}

function identityItem(profile?: RuntimeBootstrapIdentityProfile): {
  item: CommandEveOnboardingItem;
  identity: CommandEveOnboardingStatusModel['identity'];
} {
  const identity: CommandEveOnboardingStatusModel['identity'] = {
    founder_name: profile?.founder_name,
    company_name: profile?.company_name,
    needs_confirmation: profile?.needs_confirmation ?? true,
    confidence: profile?.confidence ?? 'placeholder',
    source: profile?.source ?? 'unverified',
  };
  // Identity is a soft, never-blocking onboarding nicety: a confirmed name is
  // `ok`, a guessed name is `blocked` (a gentle "stimmt das?"), no seed is
  // `skipped` (EVE just greets neutrally). It NEVER affects first_value_ready.
  let item: CommandEveOnboardingItem;
  if (profile && !identity.needs_confirmation && identity.founder_name) {
    item = {
      id: 'identity',
      state: 'ok',
      plain_meaning: `Ich kenne dich als ${identity.founder_name}.`,
      remediation_kind: 'none',
    };
  } else if (profile && identity.founder_name) {
    item = {
      id: 'identity',
      state: 'blocked',
      plain_meaning: `Stimmt es, dass ich dich ${identity.founder_name} nennen darf?`,
      remediation_kind: 'html-screen',
      reason_code: 'IDENTITY_NEEDS_CONFIRMATION',
    };
  } else {
    item = {
      id: 'identity',
      state: 'skipped',
      plain_meaning: 'Sag mir bei Gelegenheit, wie ich dich nennen soll.',
      remediation_kind: 'none',
    };
  }
  return { item, identity };
}

export function buildCommandEveOnboardingStatus(
  options: CommandEveOnboardingStatusOptions
): CommandEveOnboardingStatusResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const receiptPath = options.receiptPath || paths.receiptPath;
  const firstRunProfilePath = options.firstRunProfilePath || paths.firstRunProfile;
  const source: CommandEveOnboardingStatusResult['source'] = {
    receipt_path: receiptPath,
    first_run_profile_path: firstRunProfilePath,
    generated_by: 'command-eve-onboarding-status-core',
  };

  try {
    const warnings: string[] = [];

    const entitlement: CommandEveEntitlementStatusResult = options.readEntitlement
      ? options.readEntitlement()
      : getEntitlementStatus({ userDataPath: options.userDataPath, env: options.env, now: options.now });

    const cloudBearerAvailable = options.readLicenseWirePresence
      ? options.readLicenseWirePresence()
      : hasLicenseWire(options.userDataPath);

    const parsedReceipt = readReceipt(receiptPath);
    if (parsedReceipt.warning) warnings.push(parsedReceipt.warning);
    const parsedProfile = readFirstRunProfile(firstRunProfilePath);
    if (parsedProfile.warning) warnings.push(parsedProfile.warning);

    const licensed = entitlement.state === 'entitled';

    const { registration, license } = entitlementItem(entitlement);
    const cloudLane = cloudLaneItem(cloudBearerAvailable, licensed);
    const localLane = localLaneItem(parsedReceipt.receipt);
    const { item: identity, identity: identitySummary } = identityItem(parsedProfile.profile);

    // THE first-value gate: licensed AND a usable cloud bearer is present.
    // Registration is implied by `entitled`. Local stages are deliberately NOT
    // part of this gate.
    const firstValueReady = licensed && cloudBearerAvailable;

    const model: CommandEveOnboardingStatusModel = {
      schema_version: COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION,
      generated_at: (options.now ?? (() => new Date()))().toISOString(),
      read_only: true,
      first_value_ready: firstValueReady,
      entitlement_state: entitlement.state,
      cloud_bearer_available: cloudBearerAvailable,
      identity: identitySummary,
      items: [registration, license, cloudLane, localLane, identity],
      warnings,
    };

    return {
      version: COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION,
      ok: true,
      model,
      source,
    };
  } catch (error) {
    return {
      version: COMMAND_EVE_ONBOARDING_STATUS_BRIDGE_VERSION,
      ok: false,
      reason_code: 'ONBOARDING_STATUS_FAILED',
      message: error instanceof Error ? error.message : 'Command EVE onboarding status could not be built.',
      source,
    };
  }
}
