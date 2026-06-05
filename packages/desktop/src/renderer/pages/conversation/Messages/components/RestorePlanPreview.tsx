/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * forge-5-02-03: read-only restore-plan preview.
 *
 * Renders the per-path operation, prior-content restorability, binary
 * preview-block marker, and documented unsupported coverage returned
 * by `GET /api/conversations/{id}/opencode/tool-call-restore-plan`.
 * Does NOT perform a restore — the existing `revertToolCall` bridge
 * call is the one that actually reverts files, and it is untouched
 * by this component.
 *
 * The component is intentionally controlled by the parent: callers
 * pass `conversationId` + `toolCallId` and the component owns the
 * fetch lifecycle (loading / error / not-found / happy-path). It
 * gracefully handles all four server-side branches (found=true,
 * found=false, route failure, 404) and surfaces a clear, non-blocking
 * message in each case.
 */

import { ipcBridge } from '@/common';
import { Button, Message, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { IconEye, IconExclamationCircle, IconInfoCircle, IconClose } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { iconColors } from '@/renderer/styles/colors';

export type RestorePlanOperation = 'create' | 'modify' | 'delete' | 'unknown';

export interface RestorePlanPathEntry {
  path: string;
  operation: RestorePlanOperation;
  prior_content_restorable: boolean;
  preview_blocked: boolean;
  source_commit_sha: string | null;
  warnings: string[];
  errors: string[];
}

export interface RestorePlanDetail {
  commit_sha: string;
  paths: RestorePlanPathEntry[];
  warnings: string[];
  errors: string[];
}

export interface RestorePlanUnsupportedCoverage {
  run_shell_not_snapshotted: boolean;
  non_local_fs_mcp_not_covered: boolean;
  opencode_session_revert_not_used: boolean;
}

export interface RestorePlanResponse {
  tool_call_id: string;
  found: boolean;
  actionable: boolean;
  plan: RestorePlanDetail | null;
  unsupported_coverage: RestorePlanUnsupportedCoverage;
}

export type RestorePlanFetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: RestorePlanResponse };

export interface RestorePlanPreviewProps {
  conversationId: string;
  toolCallId: string;
  /** When true, the parent has already disabled the tool call and the
   * preview is a no-op aside from showing a hint. */
  disabled?: boolean;
}

const OPERATION_LABEL_KEY: Record<RestorePlanOperation, string> = {
  create: 'messages.restorePlan.operation.create',
  modify: 'messages.restorePlan.operation.modify',
  delete: 'messages.restorePlan.operation.delete',
  unknown: 'messages.restorePlan.operation.unknown',
};

const OPERATION_LABEL_FALLBACK: Record<RestorePlanOperation, string> = {
  create: 'Create',
  modify: 'Modify',
  delete: 'Delete',
  unknown: 'Unknown',
};

const OPERATION_COLOR: Record<RestorePlanOperation, string> = {
  create: 'green',
  modify: 'arcoblue',
  delete: 'red',
  unknown: 'gray',
};

const RestorePlanPreview: React.FC<RestorePlanPreviewProps> = ({ conversationId, toolCallId, disabled }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RestorePlanFetchState>({ kind: 'idle' });
  // Prevent stale responses from a previous fetch overwriting a fresh one
  // when the user clicks the button multiple times in quick succession.
  const fetchSeqRef = useRef(0);

  const fetchPlan = useCallback(async () => {
    if (disabled) return;
    const seq = ++fetchSeqRef.current;
    setState({ kind: 'loading' });
    try {
      const data = await ipcBridge.conversation.getToolCallRestorePlan.invoke({
        conversation_id: conversationId,
        tool_call_id: toolCallId,
      });
      if (seq !== fetchSeqRef.current) return;
      if (!data.found) {
        setState({ kind: 'not_found' });
        return;
      }
      setState({ kind: 'ok', data });
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState({ kind: 'error', message });
    }
  }, [conversationId, toolCallId, disabled]);

  // Reset state when the underlying tool call id changes so opening the
  // modal for a different call does not briefly show the previous plan.
  useEffect(() => {
    setState({ kind: 'idle' });
    fetchSeqRef.current += 1;
  }, [toolCallId]);

  const handleOpen = () => {
    setOpen(true);
    void fetchPlan();
  };

  const handleClose = () => {
    fetchSeqRef.current += 1;
    setOpen(false);
  };

  const renderBody = () => {
    switch (state.kind) {
      case 'idle':
        return null;
      case 'loading':
        return (
          <div className='flex items-center gap-8px p-12px text-13px text-t-secondary'>
            <Spin size={14} />
            {t('messages.restorePlan.loading', { defaultValue: 'Computing restore plan…' })}
          </div>
        );
      case 'not_found':
        return (
          <div className='flex items-start gap-8px p-12px rd-6px bg-2'>
            <IconInfoCircle style={{ color: iconColors.secondary, marginTop: 2, flexShrink: 0 }} />
            <div className='text-13px text-t-secondary leading-18px'>
              {t('messages.restorePlan.notFound', {
                defaultValue:
                  'No snapshot recorded for this tool call. The per-tool-call ledger only captures local_fs_mcp file mutations; tool calls that did not touch the working tree, or that were not snapshotted, will appear here as "not found".',
              })}
            </div>
          </div>
        );
      case 'error':
        return (
          <div className='flex items-start gap-8px p-12px rd-6px' style={{ background: 'var(--color-danger-light, #fdecec)' }}>
            <IconExclamationCircle style={{ color: 'var(--color-danger, #d9534f)', marginTop: 2, flexShrink: 0 }} />
            <div className='text-13px leading-18px'>
              <div className='font-medium'>
                {t('messages.restorePlan.errorTitle', { defaultValue: 'Failed to load restore plan' })}
              </div>
              <div className='text-t-secondary m-t-4px'>{state.message}</div>
            </div>
          </div>
        );
      case 'ok': {
        const data = state.data;
        const plan = data.plan;
        if (!plan) {
          // Defensive: the server only sets `plan` when `found=true`, so
          // an ok response without a plan body is treated as a soft error.
          return (
            <div className='flex items-start gap-8px p-12px rd-6px bg-2'>
              <IconInfoCircle style={{ color: iconColors.secondary, marginTop: 2, flexShrink: 0 }} />
              <div className='text-13px text-t-secondary leading-18px'>
                {t('messages.restorePlan.emptyPlan', { defaultValue: 'Restore plan is empty.' })}
              </div>
            </div>
          );
        }
        return (
          <div className='flex flex-col gap-12px'>
            <div className='flex items-center gap-8px flex-wrap'>
              <span className='text-12px text-t-secondary'>
                {t('messages.restorePlan.commitLabel', { defaultValue: 'Snapshot commit' })}:
              </span>
              <code className='text-12px font-mono' title={plan.commit_sha}>
                {plan.commit_sha.slice(0, 12)}
              </code>
              {data.actionable ? (
                <Tag color='green' size='small'>
                  {t('messages.restorePlan.actionable', { defaultValue: 'Actionable' })}
                </Tag>
              ) : (
                <Tag color='orange' size='small'>
                  {t('messages.restorePlan.notActionable', { defaultValue: 'Has errors' })}
                </Tag>
              )}
            </div>

            {plan.warnings.length > 0 && (
              <RestorePlanWarningsBlock
                title={t('messages.restorePlan.warningsTitle', { defaultValue: 'Plan warnings' })}
                items={plan.warnings}
              />
            )}
            {plan.errors.length > 0 && (
              <RestorePlanWarningsBlock
                title={t('messages.restorePlan.errorsTitle', { defaultValue: 'Plan errors' })}
                items={plan.errors}
                tone='error'
              />
            )}

            <div className='flex flex-col gap-4px'>
              {plan.paths.map((entry) => (
                <RestorePlanPathRow key={entry.path} entry={entry} />
              ))}
            </div>

            <RestorePlanUnsupportedCoverageBlock coverage={data.unsupported_coverage} />
          </div>
        );
      }
    }
  };

  return (
    <>
      <Tooltip
        content={t('messages.restorePlan.tooltip', { defaultValue: 'Preview restore plan (read-only)' })}
      >
        <button
          type='button'
          className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors shrink-0'
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
          disabled={disabled}
          aria-label={t('messages.restorePlan.tooltip', { defaultValue: 'Preview restore plan (read-only)' })}
          style={{ lineHeight: 0 }}
        >
          <IconEye style={{ fontSize: 14, color: iconColors.secondary }} />
        </button>
      </Tooltip>
      <AionModal
        visible={open}
        size='small'
        style={{ width: 560, height: 'auto', maxHeight: '80vh' }}
        header={{
          title: t('messages.restorePlan.title', { defaultValue: 'Restore Plan (read-only preview)' }),
          showClose: true,
        }}
        contentStyle={{ padding: '16px 20px 0' }}
        onCancel={handleClose}
        footer={{
          render: () => (
            <div className='flex justify-end gap-10px pt-16px'>
              <Button
                className='px-16px min-w-80px'
                style={{ borderRadius: 'var(--radius-control)' }}
                onClick={handleClose}
              >
                {t('conversation.history.cancelDelete', { defaultValue: 'Close' })}
              </Button>
            </div>
          ),
        }}
      >
        {renderBody()}
      </AionModal>
    </>
  );
};

const RestorePlanPathRow: React.FC<{ entry: RestorePlanPathEntry }> = ({ entry }) => {
  const { t } = useTranslation();
  const opLabel = t(OPERATION_LABEL_KEY[entry.operation], { defaultValue: OPERATION_LABEL_FALLBACK[entry.operation] });
  const previewBlockedHint = entry.preview_blocked
    ? t('messages.restorePlan.previewBlocked', { defaultValue: 'Binary file — preview blocked' })
    : null;
  const notRestorableHint = !entry.prior_content_restorable
    ? t('messages.restorePlan.notRestorable', { defaultValue: 'Prior content not recoverable' })
    : null;
  const hint = previewBlockedHint ?? notRestorableHint;
  return (
    <div className='flex items-center gap-8px p-6px rd-4px hover:bg-2 transition-colors'>
      <Tag color={OPERATION_COLOR[entry.operation]} size='small'>
        {opLabel}
      </Tag>
      <span className='flex-1 min-w-0 text-13px font-mono break-all' title={entry.path}>
        {entry.path}
      </span>
      {hint && (
        <Tooltip content={hint}>
          <span className='text-12px text-t-secondary inline-flex items-center gap-4px shrink-0'>
            {entry.preview_blocked ? (
              <IconExclamationCircle style={{ fontSize: 12, color: iconColors.secondary }} />
            ) : (
              <IconInfoCircle style={{ fontSize: 12, color: iconColors.secondary }} />
            )}
            {entry.preview_blocked
              ? t('messages.restorePlan.binary', { defaultValue: 'binary' })
              : t('messages.restorePlan.noPrior', { defaultValue: 'no prior' })}
          </span>
        </Tooltip>
      )}
    </div>
  );
};

const RestorePlanWarningsBlock: React.FC<{ title: string; items: string[]; tone?: 'error' }> = ({
  title,
  items,
  tone,
}) => (
  <div className='flex flex-col gap-4px'>
    <div className='text-12px font-medium text-t-secondary'>{title}</div>
    <ul
      className='m-0 p-6px-12px rd-4px text-12px leading-18px'
      style={{ background: tone === 'error' ? 'var(--color-danger-light, #fdecec)' : 'var(--color-fill-2, #f5f5f5)' }}
    >
      {items.map((item, idx) => (
        <li key={`${idx}-${item}`}>{item}</li>
      ))}
    </ul>
  </div>
);

const RestorePlanUnsupportedCoverageBlock: React.FC<{ coverage: RestorePlanUnsupportedCoverage }> = ({ coverage }) => {
  const { t } = useTranslation();
  const items: Array<{ key: keyof RestorePlanUnsupportedCoverage; label: string }> = [
    {
      key: 'run_shell_not_snapshotted',
      label: t('messages.restorePlan.coverage.runShell', {
        defaultValue: 'run_shell post-exec deltas are NOT attributed to tool_call_id',
      }),
    },
    {
      key: 'non_local_fs_mcp_not_covered',
      label: t('messages.restorePlan.coverage.nonLocalFsMcp', {
        defaultValue: 'Mutations outside local_fs_mcp are NOT in the ledger',
      }),
    },
    {
      key: 'opencode_session_revert_not_used',
      label: t('messages.restorePlan.coverage.sessionRevert', {
        defaultValue: 'OpenCode session-state revert is NOT applied by this plan',
      }),
    },
  ];
  return (
    <div className='flex flex-col gap-4px p-8px rd-6px' style={{ background: 'var(--color-fill-2, #f5f5f5)' }}>
      <div className='text-12px font-medium text-t-secondary'>
        {t('messages.restorePlan.coverage.title', { defaultValue: 'This plan does not cover' })}
      </div>
      <ul className='m-0 p-0 list-none flex flex-col gap-2px'>
        {items
          .filter((item) => coverage[item.key])
          .map((item) => (
            <li key={item.key} className='text-12px text-t-secondary flex items-start gap-4px'>
              <IconClose style={{ fontSize: 10, color: 'var(--color-danger, #d9534f)', marginTop: 4, flexShrink: 0 }} />
              <span>{item.label}</span>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default RestorePlanPreview;
