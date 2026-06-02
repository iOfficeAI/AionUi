/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Card, Radio, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Code, EditOne, FileText, Folder, Shield, Terminal } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApprovalOption, ApprovalOptionKind } from './approvalOptions';
import styles from './ApprovalCardBase.module.css';

const { Text } = Typography;

const KIND_TO_ARCO_COLOR: Record<ApprovalOptionKind, string> = {
  allow_once: 'gray',
  allow_always: 'orange',
  allow_scoped: 'arcoblue',
  reject: 'red',
};

const ACTION_ICONS: Record<string, React.ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string }>> = {
  exec: Terminal,
  edit: EditOne,
  read: FileText,
  fetch: FileText,
  file: FileText,
  folder: Folder,
  mcp: Code,
  permission: Shield,
};

/**
 * Sub-agent attribution header. When `parentSessionId` is set the request
 * came from a child OpenCode session; surfacing a visible tag tells the
 * user they're approving a sub-agent's action, not the main agent's.
 */
export type ApprovalCardBaseProps = {
  /** Stable id used for keyboard auto-focus and ARIA wiring. */
  testIdPrefix: string;
  /** Sub-agent / child-session id, if any. Renders a visible tag. */
  parentSessionId?: string | null;
  /** Action key (e.g. "exec", "edit", "mcp") → icon. Falls back to Shield. */
  action?: string | null;
  /** Title shown in the header. Falls back to `t('messages.permissionRequest')`. */
  title?: string | null;
  /** Resolved filesystem target path (e.g. for external_directory). Hidden for `external_directory` command_type. */
  targetPath?: string | null;
  /** Optional `command_type` text (hidden when equal to `external_directory`). */
  commandType?: string | null;
  /** Optional secondary description text. */
  description?: string | null;
  /** Optional OpenCode `pattern` array — shown as a list of comma-separated patterns. */
  patterns?: string[] | null;
  /** Optional tool-call id (e.g. `messageID`/`toolCallID` from the OpenCode payload). */
  toolCallId?: string | null;
  /** Normalized option list. */
  options: ApprovalOption[];
  /** Optional body slot used by the question freeform input / multi-select chips / MCP schema form. */
  bodySlot?: React.ReactNode;
  /** `true` once the user has clicked Confirm (locally) or the parent has stamped `responded`. */
  responded: boolean;
  /** Fires when the user clicks the Confirm button. Caller is responsible for IPC and for flipping `responded` to true. */
  onConfirm: (option: ApprovalOption) => void;
  /** Fires when the user presses Esc on a focused card. */
  onReject: () => void;
  /** Override the default i18n translator (e.g. for tests). */
  t?: TFunction;
  /** Set `true` to suppress the Confirm/Reject buttons (e.g. when the caller's body slot already owns submission). */
  hideActions?: boolean;
  /** Optional key to opt out of the default "Once" auto-select. */
  defaultOptionId?: string | null;
};

/**
 * Resolve the action-key → icon component, falling back to `Shield` for the
 * generic permission case. We deliberately keep this as a small lookup here
 * (rather than reaching into a map in the caller) so the visual contract
 * lives with the component.
 */
function iconFor(action: string | null | undefined): React.ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string }> {
  if (!action) return Shield;
  return ACTION_ICONS[action] ?? Shield;
}

/**
 * The single shared approval-card layout. Renders the option-picker header
 * (sub-agent tag, icon, title, optional path/command/pattern/description
 * blocks) and the responded-state footer. The `bodySlot` lets the question
 * freeform input, multi-select chips, and MCP schema form mount their own
 * bespoke UI between the option picker and the Confirm button without
 * diverging the visual contract.
 *
 * Controlled/presentational: owns only ephemeral selection + keyboard state.
 * All side effects (IPC, persisted `responded` flip) flow through `onConfirm`
 * and `onReject`. The parent MUST set `responded=true` after the IPC round
 * trip so the card flips to the success state. The derived
 * `effectiveResponded = props.responded || locallyResponded` pattern — set
 * after the `await` and never reset on `props.responded` flip-back — is the
 * banner-sync fix and MUST not regress.
 */
const ApprovalCardBase: React.FC<ApprovalCardBaseProps> = ({
  testIdPrefix,
  parentSessionId,
  action,
  title,
  targetPath,
  commandType,
  description,
  patterns,
  toolCallId,
  options,
  bodySlot,
  responded,
  onConfirm,
  onReject,
  t: tProp,
  hideActions,
  defaultOptionId,
}) => {
  const { t: tHook } = useTranslation();
  const t = tProp ?? tHook;

  // Pre-select the safest "Once" option so a fast double-click can't
  // accidentally land on "always", which would silence every subsequent
  // shell prompt in the session via the backend's `approval_memory`.
  const safeDefaultId = useMemo(() => {
    if (defaultOptionId) return defaultOptionId;
    const once = options.find((opt) => opt.kind === 'allow_once' || opt.id.toLowerCase().includes('once'));
    return once ? once.id : options[0]?.id ?? null;
  }, [options, defaultOptionId]);

  const [selectedId, setSelectedId] = useState<string | null>(safeDefaultId);
  const [isResponding, setIsResponding] = useState(false);
  // `locallyResponded` flips to true the moment the user clicks Confirm
  // and stays true for the lifetime of the card; `props.responded` may
  // flip back transiently (banner sync, list refresh) without yanking the
  // success state out from under us.
  const [locallyResponded, setLocallyResponded] = useState(false);
  const effectiveResponded = responded || locallyResponded;

  // Track whether the user reduced motion preference is set; we use it
  // to skip the entrance animation in the prefers-reduced-motion case.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Auto-focus the card root so keyboard shortcuts work without a prior
  // click. Bounded to the card root, NOT window, so a stack of cards only
  // responds on the focused one.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  const selectedOption = useMemo(() => options.find((opt) => opt.id === selectedId) ?? null, [options, selectedId]);

  const handleConfirm = useCallback(async () => {
    if (effectiveResponded || isResponding) return;
    const chosen = selectedOption;
    if (!chosen) return;
    setIsResponding(true);
    try {
      await Promise.resolve(onConfirm(chosen));
      setLocallyResponded(true);
    } catch (error) {
      console.error('[ApprovalCardBase] onConfirm failed:', error);
    } finally {
      setIsResponding(false);
    }
  }, [effectiveResponded, isResponding, selectedOption, onConfirm]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (effectiveResponded) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        void handleConfirm();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onReject();
        return;
      }
      if (event.key === 'a' || event.key === 'A') {
        const scoped = options.find((opt) => opt.kind === 'allow_always' || opt.kind === 'allow_scoped');
        if (scoped) {
          event.preventDefault();
          setSelectedId(scoped.id);
        }
        return;
      }
      // Number keys 1-9 → pick the Nth option (0-indexed but 1-based UX).
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
        const opt = options[digit - 1];
        if (opt) {
          event.preventDefault();
          setSelectedId(opt.id);
        }
      }
    },
    [effectiveResponded, handleConfirm, onReject, options]
  );

  const Icon = iconFor(action);
  const displayTitle = title || description || t('messages.permissionRequest');

  return (
    <Card
      ref={cardRef}
      className={`${styles.card} ${prefersReducedMotion ? '' : styles.cardEnter}`}
      bordered={false}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-testid={`${testIdPrefix}-card`}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          {parentSessionId && (
            <Tag color='arcoblue' size='small' data-testid={`${testIdPrefix}-subagent-tag`}>
              {t('messages.remoteSubagent.tag')}
            </Tag>
          )}
          <span className={styles.icon} aria-hidden>
            <Icon theme='outline' size='20' />
          </span>
          <Text className={styles.title}>{displayTitle}</Text>
        </div>

        {targetPath && (
          <div className={styles.block}>
            <Text className={styles.blockLabel}>{t('conversation.approval.path')}</Text>
            <code className={styles.codeBlock} data-testid={`${testIdPrefix}-path`}>
              {targetPath}
            </code>
          </div>
        )}

        {commandType && commandType !== 'external_directory' && (
          <div className={styles.block}>
            <Text className={styles.blockLabel}>{t('messages.command')}</Text>
            <code className={styles.codeBlock} data-testid={`${testIdPrefix}-command`}>
              {commandType}
            </code>
          </div>
        )}

        {patterns && patterns.length > 0 && (
          <div className={styles.block}>
            <Text className={styles.blockLabel}>{t('conversation.approval.patterns')}</Text>
            <div className={styles.patterns} data-testid={`${testIdPrefix}-patterns`}>
              {patterns.map((p, i) => (
                <code key={i} className={styles.codeInline}>
                  {p}
                </code>
              ))}
            </div>
          </div>
        )}

        {toolCallId && (
          <div className={styles.block}>
            <Text className={styles.blockLabel}>{t('conversation.approval.toolCallId')}</Text>
            <code className={styles.codeInline} data-testid={`${testIdPrefix}-toolcallid`}>
              {toolCallId}
            </code>
          </div>
        )}

        {description && description !== displayTitle && description !== targetPath && (
          <Text className={styles.description}>{description}</Text>
        )}

        {!effectiveResponded && options.length > 0 && (
          <Radio.Group
            direction='vertical'
            size='mini'
            value={selectedId ?? undefined}
            onChange={(v) => setSelectedId(typeof v === 'string' ? v : null)}
            className={styles.options}
          >
            {options.map((option) => {
              const color = KIND_TO_ARCO_COLOR[option.kind];
              return (
                <div
                  key={option.id}
                  className={styles.optionRow}
                  data-testid={`${testIdPrefix}-option-${option.id}`}
                >
                  <Radio value={option.id}>
                    <Tag color={color} size='small' bordered className={styles.optionTag}>
                      {option.kind}
                    </Tag>
                    <span className={styles.optionLabel}>
                      {option.isI18nKey ? t(option.label, { ...option.params, defaultValue: option.label }) : option.label}
                    </span>
                  </Radio>
                </div>
              );
            })}
          </Radio.Group>
        )}

        {bodySlot}

        {!effectiveResponded && !hideActions && (
          <div className={styles.actions}>
            <Button
              type='primary'
              size='mini'
              disabled={!selectedId || isResponding}
              loading={isResponding}
              onClick={handleConfirm}
              data-testid={`${testIdPrefix}-confirm`}
            >
              {isResponding ? t('messages.processing') : t('messages.confirm')}
            </Button>
            <Button
              type='secondary'
              size='mini'
              disabled={isResponding}
              onClick={onReject}
              data-testid={`${testIdPrefix}-reject`}
            >
              {t('conversation.approval.reject')}
            </Button>
          </div>
        )}

        {effectiveResponded && (
          <div className={styles.responded} data-testid={`${testIdPrefix}-responded`}>
            <CheckOne theme='outline' size='14' />
            <Text className={styles.respondedLabel}>{t('messages.responseSentSuccessfully')}</Text>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ApprovalCardBase;
