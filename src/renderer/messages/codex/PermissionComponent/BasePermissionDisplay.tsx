/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseCodexPermissionRequest } from '@/common/codex/types';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import type { ReactNode } from 'react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmationHandler, usePermissionState, usePermissionStorageCleanup } from '@/common/codex/utils/permissionUtils';

const { Text } = Typography;

interface BasePermissionDisplayProps {
  content: BaseCodexPermissionRequest & { data: { call_id: string } };
  messageId: string;
  conversationId: string;
  icon: string;
  title: string;
  children: ReactNode; // 特定类型的详细信息内容
}

const BasePermissionDisplay: React.FC<BasePermissionDisplayProps> = React.memo(({ content, messageId, conversationId, icon, title, children }) => {
  const { options = [], data } = content;
  const { t } = useTranslation();

  const { handleConfirmation } = useConfirmationHandler();
  const { cleanupOldPermissionStorage } = usePermissionStorageCleanup();

  // 直接使用 call_id 作为权限标识，确保每个请求唯一
  const permissionId = data.call_id;

  // 全局权限选择key（基于权限类型）
  const globalPermissionKey = `codex_global_permission_choice_${permissionId}`;

  // 具体权限请求响应key（基于具体的callId）
  const specificResponseKey = `codex_permission_responded_${data.call_id || messageId}`;

  // 使用正确的keys：全局权限选择 + 具体请求响应
  const { selected, setSelected, hasResponded, setHasResponded } = usePermissionState(globalPermissionKey, specificResponseKey);

  const [isResponding, setIsResponding] = useState(false);

  // Check if we have an "always" permission stored and should auto-handle
  const [shouldAutoHandle] = useState<string | null>(() => {
    try {
      const storedChoice = localStorage.getItem(globalPermissionKey);
      if (storedChoice === 'allow_always' || storedChoice === 'reject_always') {
        const alreadyResponded = localStorage.getItem(specificResponseKey) === 'true';
        if (!alreadyResponded) {
          return storedChoice;
        }
      }
    } catch (error) {
      // localStorage error
    }
    return null;
  });

  // 组件挂载时清理旧存储
  useEffect(() => {
    // 清理超过7天的旧权限存储
    cleanupOldPermissionStorage();
  }, [permissionId]); // 只在permissionId变化时执行

  // 备用检查：组件挂载时检查是否有 always 权限（如果第一个没有捕获）
  useEffect(() => {
    const checkStoredChoice = () => {
      if (hasResponded) return;

      try {
        const storedChoice = localStorage.getItem(globalPermissionKey);
        // 只设置选中状态，不自动确认
        if (storedChoice && !selected) {
          setSelected(storedChoice);
        }
      } catch (error) {
        // Handle error silently
      }
    };

    checkStoredChoice();
  }, [permissionId, hasResponded, globalPermissionKey, selected]);

  // 保存选择状态到 localStorage
  const handleSelectionChange = (value: string) => {
    setSelected(value);
    try {
      localStorage.setItem(globalPermissionKey, value);
      localStorage.setItem(`${globalPermissionKey}_timestamp`, Date.now().toString());
    } catch (error) {
      // Handle error silently
    }
  };

  const handleConfirm = async () => {
    if (hasResponded || !selected) return;

    setIsResponding(true);
    try {
      const confirmationData = {
        confirmKey: selected,
        msg_id: messageId,
        conversation_id: conversationId,
        callId: data.call_id || messageId,
      };

      // 使用通用的 confirmMessage，process 层会自动分发到正确的 handler
      const result = await handleConfirmation(confirmationData);

      if (result.success) {
        setHasResponded(true);
        try {
          localStorage.setItem(specificResponseKey, 'true');
          localStorage.setItem(`${specificResponseKey}_timestamp`, Date.now().toString());

          // Verify save was successful
          localStorage.getItem(specificResponseKey);
        } catch {
          // Error saving response to localStorage
        }
      } else {
        // Handle failure case - could add error display here
      }
    } catch (error) {
      // Handle error case - could add error logging here
    } finally {
      setIsResponding(false);
    }
  };

  // Don't render UI if already responded or if auto-handling
  const shouldShowAutoHandling = shouldAutoHandle && !hasResponded;

  if (shouldShowAutoHandling) {
    return (
      <Card className='mb-4' bordered={false} style={{ background: 'var(--bg-1)' }}>
        <div className='space-y-4 p-2'>
          <div className='flex items-center space-x-2'>
            <span className='text-2xl'>{icon}</span>
            <Text className='block text-sm text-t-secondary'>{t('messages.auto_handling_permission', { defaultValue: '' })}</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className='mb-4' bordered={false} style={{ background: 'var(--bg-1)' }}>
      <div className='space-y-4'>
        <div className='flex items-center space-x-2'>
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>

        {/* 特定类型的详细信息 */}
        {children}

        {!hasResponded && (
          <>
            <div className='mt-10px'>{t('codex.permissions.choose_action')}</div>
            <Radio.Group direction='vertical' size='mini' value={selected} onChange={handleSelectionChange}>
              {options && options.length > 0 ? (
                options.map((option, index) => {
                  const optionId = option?.optionId || `option_${index}`;
                  // Translate the option name using the i18n key
                  const optionName = option?.name ? t(option.name, { defaultValue: option.name }) : `Option ${index + 1}`;
                  return (
                    <Radio key={optionId} value={optionId}>
                      {optionName}
                    </Radio>
                  );
                })
              ) : (
                <Text type='secondary'>No options available</Text>
              )}
            </Radio.Group>
            <div className='flex justify-start pl-20px'>
              <Button type='primary' size='mini' disabled={!selected || isResponding} onClick={handleConfirm}>
                {isResponding ? t('codex.permissions.processing') : t('messages.confirm', { defaultValue: 'Confirm' })}
              </Button>
            </div>
          </>
        )}

        {hasResponded && (
          <div className='mt-10px p-2 rounded-md border' style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}>
            <Text className='text-sm' style={{ color: 'rgb(var(--success-6))' }}>
              ✓ {t('codex.permissions.response_sent')}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default BasePermissionDisplay;
