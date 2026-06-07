/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { ApprovalCardBase, fromChislOptions } from '@renderer/components/approval';
import type { ApprovalOption } from '@renderer/components/approval';
import styles from '@renderer/components/approval/ApprovalCardBase.module.css';
import type { WorkspaceApproval } from '../hooks/useWorkspaceApprovals';

type ApprovalsListProps = {
  t: TFunction;
  approvals: WorkspaceApproval[];
  respond: (approval: WorkspaceApproval, value: string, params?: Record<string, string>) => Promise<void>;
};

/** P1.2a (D5): the description-tail meta marker we append in
 * `agent.rs::meta_marker_for`. Parsing it here lets the shared card chrome
 * render the structured `patterns` and `tool_call_id` without touching
 * the `Confirmation` struct (aionui-common is out of the P1.2a allowlist).
 * Returns `null` when the marker is absent / malformed — callers fall back
 * to a no-pattern / no-tool-call-id render. */
const META_MARKER_RE = /\[\[chisl-meta:(\{[\s\S]*?\})\]\]$/;

type ParsedMeta = {
  tool_call_id?: string;
  patterns?: string[];
  expires_at_ms?: number;
};

function parseMetaMarker(description: string | undefined | null): ParsedMeta | null {
  if (!description) return null;
  const m = META_MARKER_RE.exec(description);
  if (!m || !m[1]) return null;
  try {
    const parsed = JSON.parse(m[1]) as Record<string, unknown>;
    const out: ParsedMeta = {};
    if (typeof parsed['tool_call_id'] === 'string') out.tool_call_id = parsed['tool_call_id'];
    if (Array.isArray(parsed['patterns'])) {
      out.patterns = parsed['patterns'].filter((p): p is string => typeof p === 'string');
    }
    if (typeof parsed['expires_at_ms'] === 'number') out.expires_at_ms = parsed['expires_at_ms'];
    return out;
  } catch {
    return null;
  }
}

/** P1.2a (D4): detect the question-flow freeform / multi-select / Reject
 * sentinels so we can render a freeform text input or chip selector
 * instead of the default radio. The sentinels are stamped in
 * `opencode_question::build_question_confirmations`. */
const QUESTION_FREEFORM_VALUE = '__question_freeform__';
const QUESTION_ALL_VALUE = '__question_all__';
const QUESTION_REJECT_VALUE = '__question_reject__';

function findQuestionOption(options: ApprovalOption[] | undefined, sentinel: string): ApprovalOption | undefined {
  if (!options) return undefined;
  return options.find((opt) => opt.id === sentinel);
}

/** The Approvals workspace tab body: a scrollable list of pending approvals. */
const ApprovalsList: React.FC<ApprovalsListProps> = ({ t, approvals, respond }) => {
  const prefersReducedMotion = prefersReducedMotionNow();

  if (approvals.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center h-full text-t-tertiary text-12px px-16px text-center gap-8px'>
        <Shield theme='outline' size='28' />
        <span>{t('conversation.workspace.approvals.empty')}</span>
      </div>
    );
  }

  return (
    <div className='h-full overflow-y-auto px-12px py-8px'>
      {approvals.map((approval, index) => (
        <ApprovalCardItem
          key={approval.call_id}
          approval={approval}
          index={index}
          t={t}
          respond={respond}
          prefersReducedMotion={prefersReducedMotion}
        />
      ))}
    </div>
  );
};

const ApprovalCardItem: React.FC<{
  approval: WorkspaceApproval;
  index: number;
  t: TFunction;
  respond: ApprovalsListProps['respond'];
  prefersReducedMotion: boolean;
}> = ({ approval, index, t, respond, prefersReducedMotion }) => {
  const description = (approval as { description?: string }).description;
  const meta = useMemo(() => parseMetaMarker(description), [description]);
  const normalized = useMemo(() => fromChislOptions(approval.options), [approval.options]);
  const allowDirOption = (approval.options || []).find((opt) => String(opt?.value) === 'allow_dir');
  const targetPath = (allowDirOption as { params?: Record<string, string> } | undefined)?.params?.path;
  const freeform = findQuestionOption(normalized, QUESTION_FREEFORM_VALUE);
  const allSentinel = findQuestionOption(normalized, QUESTION_ALL_VALUE);
  const rejectSentinel = findQuestionOption(normalized, QUESTION_REJECT_VALUE);
  const isQuestion = approval.action === 'question';
  const staggerDelay = prefersReducedMotion ? 0 : Math.min(index * 30, 240);

  // P1.2a (D4): freeform text answer for `custom: true` questions. The
  // typed value is held in component state, password-masked when the
  // backend's `params.secret === 'true'`, and POSTed verbatim on Confirm.
  // The typed value MUST NEVER appear in logs / telemetry / i18n strings.
  const [freeformText, setFreeformText] = useState('');
  const isSecret = freeform?.params?.['secret'] === 'true';
  const freeformKind = freeform?.params?.['kind'];

  // P1.2a (D4): multi-select answer for `multiple: true` questions. The
  // chip set starts empty; the user picks zero or more. Empty submission
  // is rejected with an inline message.
  const [multiPicked, setMultiPicked] = useState<Set<string>>(() => new Set());
  const [multiError, setMultiError] = useState<string | null>(null);

  const handleConfirm = useCallback(
    async (option: ApprovalOption) => {
      // D4: freeform-text branch — substitute the typed value at confirm
      // time. The backend reads `data.payload` (MCP elicitation style) so
      // we mirror that shape for the OpenCode question reply. The label
      // we POST is the typed text, NOT the sentinel id.
      if (isQuestion && freeform && option.id === QUESTION_FREEFORM_VALUE) {
        const typed = freeformText.trim();
        if (!typed) return; // Empty input is a no-op; the user must type something.
        // Stamp the typed value as a synthetic one-element answer so the
        // opencode_question reply path picks it up unchanged. The
        // `confirm_key` carries the value verbatim.
        await respond(approval, typed, { kind: freeformKind, secret: isSecret ? 'true' : undefined } as Record<
          string,
          string
        >);
        return;
      }
      // D4: multi-select "All" sentinel — submit every provided option.
      if (isQuestion && allSentinel && option.id === QUESTION_ALL_VALUE) {
        const allLabels = normalized
          .filter(
            (o) => o.id !== QUESTION_FREEFORM_VALUE && o.id !== QUESTION_ALL_VALUE && o.id !== QUESTION_REJECT_VALUE
          )
          .map((o) => o.id);
        // POST each label as its own answer. The backend
        // `opencode_question::record` accepts `Vec<String>` for one slot.
        await respond(approval, allLabels.join('|'), { multi: 'all' });
        return;
      }
      // D4: multi-select hand-picked subset.
      if (isQuestion && allSentinel && multiPicked.size > 0 && option.id !== QUESTION_REJECT_VALUE) {
        if (multiPicked.size === 0) {
          setMultiError(t('conversation.approval.questionMultiselectEmpty'));
          return;
        }
        setMultiError(null);
        const labels = Array.from(multiPicked);
        await respond(approval, labels.join('|'), { multi: 'subset' });
        return;
      }
      // Default (single-select permission / question option / reject).
      await respond(approval, option.id, option.params);
    },
    [
      approval,
      respond,
      isQuestion,
      freeform,
      freeformText,
      freeformKind,
      isSecret,
      allSentinel,
      normalized,
      multiPicked,
      t,
    ]
  );

  const bodySlot =
    isQuestion && freeform ? (
      <div className='space-y-2' data-testid='workspace-approval-freeform'>
        <div className='text-xs text-t-secondary'>{t('conversation.approval.questionFreeform')}</div>
        {isSecret ? (
          <input
            type='password'
            value={freeformText}
            onChange={(e) => setFreeformText(e.target.value)}
            // P1.2a security: `type=password` masks the typed value. We never
            // log / telemetry / i18n the typed content.
            data-testid='workspace-approval-freeform-input'
            className='w-full text-xs rounded border p-2'
            style={{ background: 'var(--bg-2)', color: 'var(--text-primary)', borderColor: 'var(--border-1)' }}
          />
        ) : (
          <textarea
            value={freeformText}
            onChange={(e) => setFreeformText(e.target.value)}
            rows={3}
            data-testid='workspace-approval-freeform-input'
            className='w-full text-xs rounded border p-2'
            style={{ background: 'var(--bg-2)', color: 'var(--text-primary)', borderColor: 'var(--border-1)' }}
          />
        )}
      </div>
    ) : isQuestion && allSentinel ? (
      <div className='space-y-2' data-testid='workspace-approval-multiselect'>
        <div className='flex flex-wrap gap-2'>
          {normalized
            .filter(
              (o) => o.id !== QUESTION_FREEFORM_VALUE && o.id !== QUESTION_ALL_VALUE && o.id !== QUESTION_REJECT_VALUE
            )
            .map((o) => {
              const checked = multiPicked.has(o.id);
              return (
                <button
                  key={o.id}
                  type='button'
                  onClick={() => {
                    setMultiError(null);
                    setMultiPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(o.id)) next.delete(o.id);
                      else next.add(o.id);
                      return next;
                    });
                  }}
                  data-testid={`workspace-approval-multiselect-chip-${o.id}`}
                  className={`px-2 py-1 rounded text-xs border ${checked ? 'border-brand' : 'border-1'}`}
                  style={{
                    background: checked ? 'var(--brand-light)' : 'var(--bg-2)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
        </div>
        {multiError && (
          <div className='text-xs' style={{ color: 'rgb(var(--danger-6))' }}>
            {multiError}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div
      className={staggerDelay > 0 ? styles.staggerEnter : undefined}
      style={staggerDelay > 0 ? { animationDelay: `${staggerDelay}ms` } : undefined}
    >
      <ApprovalCardBase
        testIdPrefix='workspace-approval'
        parentSessionId={(approval as { parent_session_id?: string | null }).parent_session_id ?? null}
        sessionId={(approval as { session_id?: string | null }).session_id ?? null}
        approvalCallId={approval.call_id ?? null}
        action={approval.action ?? null}
        title={approval.title ?? null}
        description={description ?? null}
        commandType={approval.command_type ?? null}
        targetPath={typeof targetPath === 'string' && targetPath.startsWith('/') ? targetPath : null}
        patterns={meta?.patterns ?? null}
        toolCallId={meta?.tool_call_id ?? null}
        options={normalized}
        responded={Boolean((approval as { responded?: boolean }).responded)}
        t={t}
        onConfirm={handleConfirm}
        onReject={() => {
          const reject = rejectSentinel ?? normalized.find((opt) => opt.kind === 'reject');
          void respond(approval, reject ? reject.id : 'reject', reject?.params);
        }}
        bodySlot={bodySlot}
      />
    </div>
  );
};

function prefersReducedMotionNow(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default ApprovalsList;
