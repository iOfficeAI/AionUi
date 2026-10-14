/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Modal, Button, Tag, Typography, Checkbox, Space } from '@arco-design/web-react';
import { Shield, CheckOne, CloseOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { SafetyGateRequest } from '@/common/browser/safetyTypes';

const { Paragraph, Text } = Typography;

export const SafetyApprovalModal: React.FC = () => {
  const { t } = useTranslation();
  const [currentRequest, setCurrentRequest] = useState<SafetyGateRequest | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onBrowserSafetyApprovalRequest) return;

    const unsubscribe = window.electronAPI.onBrowserSafetyApprovalRequest((req: unknown) => {
      setCurrentRequest(req as SafetyGateRequest);
      setRememberChoice(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRespond = (approved: boolean) => {
    if (!currentRequest) return;
    if (window.electronAPI?.browserRespondSafetyApproval) {
      window.electronAPI.browserRespondSafetyApproval({
        requestId: currentRequest.id,
        approved,
        rememberChoice,
      });
    }
    setCurrentRequest(null);
  };

  if (!currentRequest) return null;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'publish':
        return 'orange';
      case 'send':
        return 'blue';
      case 'delete':
        return 'red';
      case 'spend':
        return 'gold';
      default:
        return 'arcoblue';
    }
  };

  return (
    <Modal
      visible={Boolean(currentRequest)}
      title={
        <Space align='center'>
          <Shield theme='filled' size='18' fill='#FF7D00' />
          <span>{t('conversation.browser.safetyGateTitle')}</span>
          <Tag color={getActionColor(currentRequest.actionType)} size='small'>
            {currentRequest.actionType.toUpperCase()}
          </Tag>
        </Space>
      }
      onCancel={() => handleRespond(false)}
      footer={
        <div className='flex items-center justify-between w-full'>
          <Checkbox checked={rememberChoice} onChange={setRememberChoice}>
            <Text type='secondary' className='text-xs'>
              {t('conversation.browser.safetyRemember')}
            </Text>
          </Checkbox>
          <Space>
            <Button type='secondary' status='default' icon={<CloseOne />} onClick={() => handleRespond(false)}>
              {t('conversation.browser.safetyReject')}
            </Button>
            <Button type='primary' status='warning' icon={<CheckOne />} onClick={() => handleRespond(true)}>
              {t('conversation.browser.safetyApprove')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className='flex flex-col gap-3 py-2'>
        <Paragraph type='secondary' className='mb-2 text-xs'>
          {t('conversation.browser.safetyGateDesc')}
        </Paragraph>

        <div className='p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)] flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Text bold>{currentRequest.title}</Text>
          </div>

          {currentRequest.details.platform && (
            <div className='flex items-center gap-2'>
              <Text type='secondary' className='text-xs'>
                {t('conversation.browser.safetyTarget')}:
              </Text>
              <Tag size='small'>{currentRequest.details.platform}</Tag>
            </div>
          )}

          {currentRequest.details.caption && (
            <div className='flex flex-col gap-1'>
              <Text type='secondary' className='text-xs'>
                {t('conversation.browser.safetyCaption')}:
              </Text>
              <div className='p-2 bg-[var(--color-bg-2)] rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto border border-[var(--color-border-1)]'>
                {currentRequest.details.caption}
              </div>
            </div>
          )}

          {currentRequest.details.mediaPath && (
            <div className='flex flex-col gap-1'>
              <Text type='secondary' className='text-xs'>
                {t('conversation.browser.safetyMedia')}:
              </Text>
              <Text code className='text-xs break-all'>
                {currentRequest.details.mediaPath}
              </Text>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
