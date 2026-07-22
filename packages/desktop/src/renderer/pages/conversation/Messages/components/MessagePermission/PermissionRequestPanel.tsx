/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import { Attention, CheckOne, Earth, Edit, PreviewOpen, Shield, Terminal } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PermissionRequestPanel.module.css';
import {
  getPermissionOptionsIdentity,
  getSafePermissionOptionId,
  type PermissionIntent,
  type PermissionOperationKind,
  type PermissionPanelOption,
} from './permissionOptions';

const { Text } = Typography;

type PermissionRequestPanelProps = {
  requestKey: string;
  testIdPrefix: 'message-permission' | 'message-acp-permission';
  title: string;
  description?: string;
  operationKind: PermissionOperationKind;
  detail?: string;
  options: PermissionPanelOption[];
  onConfirm: (optionValue: string) => Promise<void>;
};

const optionDescriptionKeys: Partial<Record<PermissionIntent, string>> = {
  'allow-once': 'messages.permissionOptions.allowOnceDescription',
  'allow-always': 'messages.permissionOptions.allowAlwaysDescription',
  'reject-once': 'messages.permissionOptions.rejectOnceDescription',
  'reject-always': 'messages.permissionOptions.rejectAlwaysDescription',
};

const operationKindKeys: Record<PermissionOperationKind, string> = {
  execute: 'messages.permissionKinds.execute',
  edit: 'messages.permissionKinds.edit',
  read: 'messages.permissionKinds.read',
  fetch: 'messages.permissionKinds.fetch',
  tool: 'messages.permissionKinds.tool',
};

const renderOperationIcon = (kind: PermissionOperationKind) => {
  switch (kind) {
    case 'execute':
      return <Terminal theme='outline' size='16' />;
    case 'edit':
      return <Edit theme='outline' size='16' />;
    case 'read':
      return <PreviewOpen theme='outline' size='16' />;
    case 'fetch':
      return <Earth theme='outline' size='16' />;
    default:
      return <Shield theme='outline' size='16' />;
  }
};

export const PermissionRequestPanel: React.FC<PermissionRequestPanelProps> = ({
  requestKey,
  testIdPrefix,
  title,
  description,
  operationKind,
  detail,
  options,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const optionsIdentity = getPermissionOptionsIdentity(options);
  const autoFocusOptionId =
    getSafePermissionOptionId(options) ?? options.find((option) => !option.disabled)?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(() => getSafePermissionOptionId(options));
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const respondingRef = useRef(false);
  const requestEpochRef = useRef(0);
  const optionsEpochRef = useRef(0);
  const restoreFocusAfterErrorRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  const optionsLabelId = useId();
  optionsRef.current = options;

  const focusOption = useCallback((optionId: string) => {
    const panel = panelRef.current;
    if (!panel) return;
    const optionElement = Array.from(panel.querySelectorAll<HTMLElement>('[data-permission-option-id]')).find(
      (element) => element.dataset.permissionOptionId === optionId
    );
    optionElement?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    requestEpochRef.current += 1;
    respondingRef.current = false;
    restoreFocusAfterErrorRef.current = false;
    setIsResponding(false);
    setHasResponded(false);
    setHasError(false);
    setSelectedId(getSafePermissionOptionId(optionsRef.current));
  }, [requestKey]);

  useEffect(() => {
    optionsEpochRef.current += 1;
    restoreFocusAfterErrorRef.current = false;
    setHasError(false);
    setHasResponded(false);
    setSelectedId(getSafePermissionOptionId(optionsRef.current));
  }, [optionsIdentity]);

  useEffect(() => {
    if (hasResponded || respondingRef.current || !autoFocusOptionId) return;
    const activeElement = document.activeElement;
    if (activeElement !== document.body && activeElement !== document.documentElement) return;

    const optionsGroup = panelRef.current?.querySelector<HTMLElement>('[data-permission-options="true"]');
    if (!optionsGroup) return;
    const pendingOptionsGroups = Array.from(
      document.querySelectorAll<HTMLElement>('[data-permission-options="true"]')
    ).filter((group) => !(group.closest('fieldset') as HTMLFieldSetElement | null)?.disabled);
    if (pendingOptionsGroups[pendingOptionsGroups.length - 1] !== optionsGroup) return;

    focusOption(autoFocusOptionId);
  }, [autoFocusOptionId, focusOption, hasResponded, optionsIdentity, requestKey]);

  const handleOptionChange = useCallback((optionId: string) => {
    setSelectedId(optionId);
  }, []);

  useEffect(() => {
    if (!hasError || isResponding || !restoreFocusAfterErrorRef.current || !selectedId) return;
    const activeElement = document.activeElement;
    const focusCanReturn =
      activeElement === document.body ||
      activeElement === document.documentElement ||
      Boolean(panelRef.current?.contains(activeElement));
    restoreFocusAfterErrorRef.current = false;
    if (focusCanReturn) focusOption(selectedId);
  }, [focusOption, hasError, isResponding, selectedId]);

  const submitSelected = useCallback(async () => {
    if (respondingRef.current || hasResponded || !selectedId) return;
    const selectedOption = options.find((option) => option.id === selectedId && !option.disabled);
    if (!selectedOption) return;

    const requestEpoch = requestEpochRef.current;
    const optionsEpoch = optionsEpochRef.current;
    respondingRef.current = true;
    restoreFocusAfterErrorRef.current = Boolean(panelRef.current?.contains(document.activeElement));
    setIsResponding(true);
    setHasError(false);

    try {
      await onConfirm(selectedOption.value);
      if (requestEpochRef.current === requestEpoch && optionsEpochRef.current === optionsEpoch) {
        restoreFocusAfterErrorRef.current = false;
        setHasResponded(true);
      }
    } catch {
      if (requestEpochRef.current === requestEpoch && optionsEpochRef.current === optionsEpoch) {
        const activeElement = document.activeElement;
        restoreFocusAfterErrorRef.current =
          restoreFocusAfterErrorRef.current &&
          (activeElement === document.body ||
            activeElement === document.documentElement ||
            Boolean(panelRef.current?.contains(activeElement)));
        setHasError(true);
      }
    } finally {
      if (requestEpochRef.current === requestEpoch) {
        respondingRef.current = false;
        setIsResponding(false);
      }
    }
  }, [hasResponded, onConfirm, options, selectedId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFieldSetElement>) => {
      if (
        event.defaultPrevented ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target as Element;
      if (!target.closest('[data-permission-options="true"]')) return;

      const isEnter = event.key === 'Enter';
      const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
      if (!isEnter && !isArrow) return;
      event.preventDefault();
      event.stopPropagation();

      if (isResponding || hasResponded) return;
      if (isEnter) {
        if (!event.repeat) void submitSelected();
        return;
      }

      const enabledOptions = options.filter((option) => !option.disabled);
      if (enabledOptions.length === 0) return;

      const currentIndex = enabledOptions.findIndex((option) => option.id === selectedId);
      const nextIndex =
        currentIndex === -1
          ? event.key === 'ArrowDown'
            ? 0
            : enabledOptions.length - 1
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + enabledOptions.length) % enabledOptions.length;
      const nextOption = enabledOptions[nextIndex];
      setSelectedId(nextOption.id);
      focusOption(nextOption.id);
    },
    [focusOption, hasResponded, isResponding, options, selectedId, submitSelected]
  );

  const optionsGroupAccessibilityProps = {
    'aria-labelledby': optionsLabelId,
    'aria-keyshortcuts': 'ArrowUp ArrowDown Enter',
    'data-testid': `${testIdPrefix}-options`,
    'data-permission-options': 'true',
  } as React.AriaAttributes & {
    'data-testid': string;
    'data-permission-options': 'true';
  };

  return (
    <Card className={styles.card} bordered={false} data-testid={`${testIdPrefix}-card`}>
      <div ref={panelRef} className={styles.panel} aria-busy={isResponding}>
        <div className={styles.header}>
          <span className={styles.operationIcon} aria-hidden='true'>
            {renderOperationIcon(operationKind)}
          </span>
          <div className={styles.heading}>
            <div className={styles.titleRow}>
              <Text className={styles.title}>{title}</Text>
              <Text className={styles.operationBadge}>{t(operationKindKeys[operationKind])}</Text>
            </div>
            {description && <Text className={styles.description}>{description}</Text>}
          </div>
        </div>

        {detail && (
          <div className={styles.detailBlock}>
            <Text className={styles.detailLabel}>{t('messages.command')}</Text>
            <code className={styles.detail} dir='auto'>
              {detail}
            </code>
          </div>
        )}

        {!hasResponded && (
          <>
            <fieldset className={styles.optionsFieldset} disabled={isResponding} onKeyDown={handleKeyDown}>
              <legend id={optionsLabelId} className={styles.optionsLegend}>
                {t('messages.chooseAction')}
              </legend>
              {options.length > 0 ? (
                <Radio.Group
                  className={styles.optionsGroup}
                  name={`${testIdPrefix}-${optionsLabelId}`}
                  value={selectedId}
                  disabled={isResponding}
                  onChange={handleOptionChange}
                  {...optionsGroupAccessibilityProps}
                >
                  {options.map((option) => {
                    const descriptionKey = optionDescriptionKeys[option.intent];
                    return (
                      <div
                        key={option.id}
                        className={styles.optionRow}
                        data-testid={option.testId}
                        data-permission-option-id={option.id}
                        data-selected={selectedId === option.id}
                        data-disabled={Boolean(option.disabled || isResponding)}
                      >
                        <Radio
                          className={styles.optionRadio}
                          value={option.id}
                          disabled={option.disabled || isResponding}
                        >
                          <span className={styles.optionContent}>
                            <span className={styles.optionText}>
                              <Text className={styles.optionLabel}>{option.label}</Text>
                              {descriptionKey && <Text className={styles.optionDescription}>{t(descriptionKey)}</Text>}
                            </span>
                          </span>
                        </Radio>
                      </div>
                    );
                  })}
                </Radio.Group>
              ) : (
                <Text className={styles.emptyState}>{t('messages.noOptionsAvailable')}</Text>
              )}
            </fieldset>

            {hasError && (
              <div
                className={classNames(styles.feedback, styles.error)}
                role='alert'
                aria-live='assertive'
                data-testid={`${testIdPrefix}-error`}
              >
                <Attention theme='outline' size='16' aria-hidden='true' />
                <span>{t('messages.permissionResponseFailed')}</span>
              </div>
            )}

            <div className={styles.footer}>
              <span className={styles.keyboardHint} aria-hidden='true'>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>↵</kbd>
              </span>
              <Button
                type='primary'
                size='small'
                disabled={!selectedId || isResponding}
                loading={isResponding}
                onClick={() => void submitSelected()}
                data-testid={`${testIdPrefix}-confirm`}
              >
                {isResponding ? t('messages.processing') : t('messages.confirm')}
              </Button>
            </div>
          </>
        )}

        {hasResponded && (
          <div
            className={classNames(styles.feedback, styles.success)}
            role='status'
            aria-live='polite'
            data-testid={`${testIdPrefix}-status`}
          >
            <CheckOne theme='outline' size='16' aria-hidden='true' />
            <span>{t('messages.responseSentSuccessfully')}</span>
          </div>
        )}
      </div>
    </Card>
  );
};
