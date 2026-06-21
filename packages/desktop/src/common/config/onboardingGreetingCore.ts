/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE guided onboarding (SLICE S2) — the pure greeting builder.
 *
 * Turns the read-only setup-completeness model from the S0 aggregator
 * (`command-eve.onboarding-status`) into a ONE-TIME German readiness-checklist
 * greeting view-model. The renderer paints this into the existing chat
 * `emptySlot` seam (shown only when a conversation has zero messages) — no new
 * message type, no persistence, no behaviour change anywhere else.
 *
 * THE GATE (mirrors S0): a cloud-ready user — licensed + a usable cloud bearer
 * — is "startklar". `first_value_ready` is the single truth; local stages NEVER
 * hold back first value. So:
 *   - first_value_ready  → a warm "du bist startklar" greeting, no gap list.
 *   - !first_value_ready → list ONLY the items that genuinely block first value
 *     (the real gaps), each with a plain-German line + a "klick hier" target.
 *
 * HONESTY (carried from S0/S1): this builder claims no capability it does not
 * surface here. It never asks for an API key/secret, never references a learned-
 * from-seed memory or a connector (S5/S6, out of this lane). `skipped` items
 * (e.g. the optional local lane for a cloud user) are NEVER shown as gaps.
 *
 * This module is PURE (no IO, no React) so it is unit-testable in isolation and
 * shared between the renderer component and the test suite.
 */

import type {
  ICommandEveOnboardingItem,
  ICommandEveOnboardingItemId,
  ICommandEveOnboardingStatusModel,
} from '@/common/adapter/ipcBridge';

export const COMMAND_EVE_ONBOARDING_GREETING_VERSION = 'command-eve-onboarding-greeting/v0';

/**
 * Where a "klick hier" link in the greeting should take the operator. These are
 * stable, app-internal hash-route hints the renderer maps to navigation; the
 * pure core stays free of any router dependency.
 *   - `registration` → the registration / license gate (account setup).
 *   - `runtime`      → the read-only /runtime page (S4 RemediationCard lives there).
 *   - `none`         → no navigation target (informational only).
 */
export type CommandEveGreetingLinkTarget = 'registration' | 'runtime' | 'none';

export interface CommandEveGreetingGap {
  /** Which onboarding item this gap came from (stable key for React + tests). */
  id: ICommandEveOnboardingItemId;
  /** Plain-German one-liner describing the gap (taken from the S0 model). */
  text: string;
  /** The label for the inline "klick hier" link, or undefined when none. */
  link_label?: string;
  /** Where the link points. `none` ⇒ no link is rendered. */
  link_target: CommandEveGreetingLinkTarget;
  /** The machine reason code behind the gap, when one exists (diagnostics). */
  reason_code?: string;
}

export interface CommandEveGreetingModel {
  schema_version: typeof COMMAND_EVE_ONBOARDING_GREETING_VERSION;
  /** True ⇒ render the "du bist startklar" state; false ⇒ render the gap list. */
  ready: boolean;
  /** The headline line (greets by name when we have a confirmed one). */
  headline: string;
  /** A short supporting line under the headline. */
  subline: string;
  /**
   * The real remaining gaps, in display order. EMPTY when `ready` is true.
   * Only `blocked` items that actually hold back first value appear here —
   * `skipped` and `ok` items are filtered out (a cloud user never sees the
   * optional local lane as a gap).
   */
  gaps: CommandEveGreetingGap[];
}

/**
 * Map an onboarding item's id + remediation kind to the greeting's navigation
 * target + link label. The link is a gentle "klick hier"; the destination is an
 * existing in-app page (never an external command, never a secret prompt).
 */
function resolveLink(item: ICommandEveOnboardingItem): {
  link_label?: string;
  link_target: CommandEveGreetingLinkTarget;
} {
  switch (item.id) {
    case 'registration':
    case 'license':
    case 'cloud-lane':
      // Account / license / cloud-bearer gaps are all closed at the
      // registration + activation gate.
      return { link_label: 'klick hier', link_target: 'registration' };
    case 'local-lane':
      // The optional local lane is repaired on the read-only /runtime page,
      // where the S4 RemediationCard renders the reason-code-specific fix.
      return { link_label: 'klick hier', link_target: 'runtime' };
    case 'identity':
      // Identity confirmation is a soft conversational nicety — no link; EVE
      // simply asks in chat. (It is never a first-value blocker anyway.)
      return { link_target: 'none' };
    default:
      return { link_target: 'none' };
  }
}

/**
 * The greeting headline. We greet by a CONFIRMED name only (confidence
 * 'verified' and no pending confirmation); a guessed name is never asserted as
 * fact in the headline (honesty — that confirmation belongs in chat, not in a
 * one-shot greeting).
 */
function buildHeadline(model: ICommandEveOnboardingStatusModel, ready: boolean): string {
  const name = model.identity.founder_name;
  const confirmed =
    Boolean(name) && model.identity.confidence === 'verified' && !model.identity.needs_confirmation;
  const greeting = confirmed ? `Hi ${name}` : 'Hi';
  return ready ? `${greeting} — du bist startklar.` : `${greeting} — fast geschafft.`;
}

/**
 * Build the one-time readiness-greeting view-model from the S0 status model.
 * Pure: same input ⇒ same output, no IO, no React.
 */
export function buildOnboardingGreeting(
  model: ICommandEveOnboardingStatusModel
): CommandEveGreetingModel {
  const ready = model.first_value_ready === true;

  if (ready) {
    return {
      schema_version: COMMAND_EVE_ONBOARDING_GREETING_VERSION,
      ready: true,
      headline: buildHeadline(model, true),
      subline: 'Schreib mir einfach, woran du gerade arbeitest — ich lege sofort los.',
      gaps: [],
    };
  }

  // Not ready: surface ONLY the genuine first-value blockers. `skipped` (e.g.
  // the optional local lane) and `ok` items are filtered out so a cloud user is
  // never nagged about a lane they don't use. We still list a soft identity
  // confirmation if it is the only thing left, since it carries no link and is
  // harmless — but only as a non-blocking note, not as a hard gap.
  const blockers = (model.items || []).filter((item) => item.state === 'blocked');

  const gaps: CommandEveGreetingGap[] = blockers.map((item) => {
    const link = resolveLink(item);
    return {
      id: item.id,
      text: item.plain_meaning,
      link_label: link.link_label,
      link_target: link.link_target,
      ...(item.reason_code ? { reason_code: item.reason_code } : {}),
    };
  });

  return {
    schema_version: COMMAND_EVE_ONBOARDING_GREETING_VERSION,
    ready: false,
    headline: buildHeadline(model, false),
    subline:
      gaps.length > 0
        ? 'Nur noch das hier, dann können wir loslegen:'
        : 'Gleich geht es los.',
    gaps,
  };
}
