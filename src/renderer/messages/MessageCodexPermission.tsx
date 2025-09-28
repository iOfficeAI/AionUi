/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexPermission } from '@/common/chatLib';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmationHandler, usePermissionIdGenerator, useToolIcon, usePermissionState, usePermissionStorageCleanup } from '@/common/codex/utils/permissionUtils';

const { Text } = Typography;

interface MessageCodexPermissionProps {
  message: IMessageCodexPermission;
}

const MessageCodexPermission: React.FC<MessageCodexPermissionProps> = React.memo(({ message }) => {
  const { options = [], toolCall } = message.content || {};
  const { t } = useTranslation();

  const { generateGlobalPermissionId } = usePermissionIdGenerator();
  const { getToolIcon } = useToolIcon();
  const { handleConfirmation } = useConfirmationHandler();
  const { cleanupOldPermissionStorage } = usePermissionStorageCleanup();

  // 基于实际数据生成显示信息
  const getToolInfo = () => {
    if (!toolCall) {
      return {
        title: 'Permission Request',
        icon: '🔐',
      };
    }

    // 直接使用 toolCall 中的实际数据
    const displayTitle = toolCall.title || toolCall.rawInput?.description || 'Permission Request';

    return {
      title: displayTitle,
      icon: getToolIcon(toolCall.kind),
    };
  };
  const { title, icon } = getToolInfo();

  const permissionId = generateGlobalPermissionId(toolCall);

  // 全局权限选择key（基于权限类型）
  const globalPermissionKey = `codex_global_permission_choice_${permissionId}`;

  // 具体权限请求响应key（基于具体的callId）
  const specificResponseKey = `codex_permission_responded_${toolCall?.toolCallId || message.id}`;

  // 使用正确的keys：全局权限选择 + 具体请求响应
  const { selected, setSelected, hasResponded, setHasResponded } = usePermissionState(globalPermissionKey, specificResponseKey);

  const [isResponding, setIsResponding] = useState(false);

  // Check if we have an "always" permission stored and should auto-handle
  const [shouldAutoHandle, setShouldAutoHandle] = useState<string | null>(() => {
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

  // 立即自动处理"always"权限（在渲染之前）
  useEffect(() => {
    if (shouldAutoHandle && !hasResponded) {
      setSelected(shouldAutoHandle);
      setHasResponded(true);
      setIsResponding(true);

      // 立即更新响应状态到 localStorage
      localStorage.setItem(specificResponseKey, 'true');
      localStorage.setItem(`${specificResponseKey}_timestamp`, Date.now().toString());

      const confirmationData = {
        confirmKey: shouldAutoHandle,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        callId: toolCall?.toolCallId || message.id,
      };

      handleConfirmation(confirmationData)
        .then(() => {
          setShouldAutoHandle(null); // Clear the auto-handle flag
        })
        .catch((error) => {
          // Handle error silently
        })
        .finally(() => {
          setIsResponding(false);
        });
    }
  }, []); // Run only once on mount

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

      // Verify save was successful
      const savedValue = localStorage.getItem(globalPermissionKey);
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
        msg_id: message.id,
        conversation_id: message.conversation_id,
        callId: toolCall?.toolCallId || message.id, // 使用 toolCallId 或 message.id 作为 fallback
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

  if (!toolCall) {
    return null;
  }

  // Don't render UI if already responded or if auto-handling
  const shouldShowAutoHandling = shouldAutoHandle && !hasResponded;
  const shouldShowFullUI = !hasResponded && !shouldAutoHandle;

  if (shouldShowAutoHandling) {
    return (
      <Card className='mb-4' bordered={false} style={{ background: '#f0f8ff' }}>
        <div className='space-y-4 p-2'>
          <div className='flex items-center space-x-2'>
            <span className='text-2xl'>⚡</span>
            <Text className='block text-sm text-gray-600'>{t('messages.auto_handling_permission', { defaultValue: '' })}</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (!shouldShowFullUI) {
    return (
      <Card className='mb-4' bordered={false} style={{ background: '#f0fff0' }}>
        <div className='space-y-4 p-2'>
          <div className='flex items-center space-x-2'>
            <span className='text-2xl'>✅</span>
            <Text className='block text-sm text-green-700'>{t('messages.permission_already_handled', { defaultValue: 'Permission already handled' })}</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className='mb-4' bordered={false} style={{ background: '#f8f9fa' }}>
      <div className='space-y-4'>
        <div className='flex items-center space-x-2'>
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>
        {(toolCall.rawInput?.command || toolCall.title) && (
          <div>
            <Text className='text-xs text-gray-500 mb-1'>Command:</Text>
            <code className='text-xs bg-gray-100 p-2 rounded block text-gray-800 break-all'>{toolCall.rawInput?.command || toolCall.title}</code>
          </div>
        )}
        {!hasResponded && (
          <>
            <div className='mt-10px'>Choose an action:</div>
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
                {isResponding ? 'Processing...' : t('messages.confirm', { defaultValue: 'Confirm' })}
              </Button>
            </div>
          </>
        )}

        {hasResponded && (
          <div className='mt-10px p-2 bg-green-50 border border-green-200 rounded-md'>
            <Text className='text-sm text-green-700'>✓ Response sent successfully</Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageCodexPermission;
