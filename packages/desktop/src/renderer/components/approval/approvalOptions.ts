/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalized approval-option model shared by every approval card surface
 * (Workspace tab, inline tool-group, inline ACP / OpenCode permission card,
 * MCP elicitation header). Two adapter functions — `fromChislOptions` and
 * `fromAcpOptions` — translate the wire shapes carried by the existing
 * `IConfirmation` and `IMessageAcpPermission` payloads into this common type
 * so the `ApprovalCardBase` does not need to special-case either source.
 */

export type ApprovalOptionKind = 'allow_once' | 'allow_always' | 'allow_scoped' | 'reject';

export type ApprovalOption = {
  id: string;
  label: string;
  isI18nKey: boolean;
  kind: ApprovalOptionKind;
  params?: Record<string, string>;
  shortcut?: string;
};

const ALLOW_SCOPED_KEYWORDS = ['dir', 'session', 'scoped'];
const REJECT_KEYWORDS = ['reject', 'deny', 'cancel', 'no'];
const ALLOW_ALWAYS_KEYWORDS = ['always', 'proceed_always'];
const ALLOW_ONCE_KEYWORDS = ['once', 'proceed_once', 'allow_once', 'yes'];

/**
 * Map a free-form id / kind string to one of the four canonical kinds.
 * Defaults to `allow_once` (the safest non-silencing choice) so a
 * quick-confirm never lands on `allow_always` and blesses the whole session.
 */
export function classifyKind(idOrKind: string | undefined | null): ApprovalOptionKind {
  const value = (idOrKind ?? '').toLowerCase();
  if (!value) return 'allow_once';
  if (REJECT_KEYWORDS.some((k) => value.includes(k))) return 'reject';
  if (ALLOW_SCOPED_KEYWORDS.some((k) => value.includes(k))) return 'allow_scoped';
  if (ALLOW_ALWAYS_KEYWORDS.some((k) => value.includes(k))) return 'allow_always';
  return 'allow_once';
}

/** Raw option shape carried by the chisl-flavored `IConfirmation` payload. */
export type ChislOption = {
  label?: string;
  value?: unknown;
  params?: Record<string, string>;
};

/** Raw option shape carried by an ACP `tool_call.options[].option_id/name` payload. */
export type AcpOption = {
  option_id?: string;
  name?: string;
  kind?: string;
  params?: Record<string, string>;
};

function asStringId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/**
 * Adapt a chisl-style option list (the shape carried by `IConfirmation` and
 * by every OpenCode `permission.asked` mapped into the workspace queue) to
 * the shared `ApprovalOption` form. The label is preserved verbatim because
 * the chisl pipeline always treats it as an i18n key (falling back to the
 * raw text when no key is registered).
 */
export function fromChislOptions(options: ChislOption[] | undefined | null): ApprovalOption[] {
  if (!options) return [];
  return options.map((opt, index) => {
    const id = asStringId(opt?.value, `option_${index}`);
    const label = typeof opt?.label === 'string' && opt.label.length > 0 ? opt.label : id;
    return {
      id,
      label,
      isI18nKey: true,
      kind: classifyKind(id),
      params: opt?.params,
    };
  });
}

/**
 * Adapt an ACP-style option list (`option_id` / `name` / optional `kind`) to
 * the shared `ApprovalOption` form. ACP option labels are typically
 * user-presented strings, not i18n keys, so we mark them as raw text and
 * prefer the ACP-supplied `kind` mapping when available, falling back to the
 * generic classifier.
 */
export function fromAcpOptions(options: AcpOption[] | undefined | null): ApprovalOption[] {
  if (!options) return [];
  return options.map((opt, index) => {
    const id = typeof opt?.option_id === 'string' && opt.option_id.length > 0 ? opt.option_id : `option_${index}`;
    const label = typeof opt?.name === 'string' && opt.name.length > 0 ? opt.name : id;
    const kind = opt?.kind ? classifyKind(opt.kind) : classifyKind(id);
    return {
      id,
      label,
      isI18nKey: false,
      kind,
      params: opt?.params,
    };
  });
}
