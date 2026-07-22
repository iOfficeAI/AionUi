/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import { Attention, CheckOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PermissionRequestPanel.module.css';
import {
  getPermissionOptionsIdentity,
  getSafePermissionOptionId,
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
  const [selectedId, setSelectedId] = useState<string | null>(() => getSafePermissionOptionId(options));
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const respondingRef = useRef(false);
  const requestEpochRef = useRef(0);
  const optionsEpochRef = useRef(0);
  const optionsRef = useRef(options);
  const optionsLabelId = useId();
  optionsRef.current = options;

  useEffect(() => {
    requestEpochRef.current += 1;
    respondingRef.current = false;
    setIsResponding(false);
    setHasResponded(false);
    setHasError(false);
    setSelectedId(getSafePermissionOptionId(optionsRef.current));
  }, [requestKey]);

  useEffect(() => {
    optionsEpochRef.current += 1;
    setHasError(false);
    setHasResponded(false);
    setSelectedId(getSafePermissionOptionId(optionsRef.current));
  }, [optionsIdentity]);

  const handleOptionChange = useCallback((optionId: string) => {
    setSelectedId(optionId);
  }, []);

  const submitSelected = useCallback(async () => {
    if (respondingRef.current || hasResponded || !selectedId) return;
    const selectedOption = options.find((option) => option.id === selectedId && !option.disabled);
    if (!selectedOption) return;

    const requestEpoch = requestEpochRef.current;
    const optionsEpoch = optionsEpochRef.current;
    respondingRef.current = true;
    setIsResponding(true);
    setHasError(false);

    try {
      await onConfirm(selectedOption.value);
      if (requestEpochRef.current === requestEpoch && optionsEpochRef.current === optionsEpoch) {
        setHasResponded(true);
      }
    } catch {
      if (requestEpochRef.current === requestEpoch && optionsEpochRef.current === optionsEpoch) {
        setHasError(true);
      }
    } finally {
      if (requestEpochRef.current === requestEpoch) {
        respondingRef.current = false;
        setIsResponding(false);
      }
    }
  }, [hasResponded, onConfirm, options, selectedId]);

  return (
    <Card className={styles.card} bordered={false} data-testid={`${testIdPrefix}-card`}>
      <div className={styles.panel} aria-busy={isResponding}>
        <div className={styles.heading}>
          <div className={styles.titleRow}>
            <Text className={styles.title}>{title}</Text>
            <Text className={styles.operationBadge}>{operationKind}</Text>
          </div>
          {description && <Text className={styles.description}>{description}</Text>}
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
            <fieldset className={styles.optionsFieldset} disabled={isResponding}>
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
                  aria-labelledby={optionsLabelId}
                  data-testid={`${testIdPrefix}-options`}
                >
                  {options.map((option) => (
                    <div
                      key={option.id}
                      className={styles.optionRow}
                      data-testid={option.testId}
                      data-selected={selectedId === option.id}
                      data-disabled={Boolean(option.disabled || isResponding)}
                    >
                      <Radio
                        className={styles.optionRadio}
                        value={option.id}
                        disabled={option.disabled || isResponding}
                      >
                        <Text className={styles.optionLabel}>{option.label}</Text>
                      </Radio>
                    </div>
                  ))}
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
