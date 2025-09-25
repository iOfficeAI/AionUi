/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexPermission } from '@/common/chatLib';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmationHandler, usePermissionIdGenerator, useToolIcon, usePermissionStorageKeys, usePermissionState, usePermissionStorageCleanup } from './hooks';

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
  // 使用全局key，不区分conversation，让相同权限请求在所有会话中共享状态
  const { storageKey, responseKey } = usePermissionStorageKeys(permissionId);

  const { selected, setSelected, hasResponded, setHasResponded } = usePermissionState(storageKey, responseKey);

  const [isResponding, setIsResponding] = useState(false);

  // 组件挂载时清理旧存储
  useEffect(() => {
    // 清理超过7天的旧权限存储
    cleanupOldPermissionStorage();
  }, [permissionId]); // 只在permissionId变化时执行

  // 保存选择状态到 localStorage
  const handleSelectionChange = (value: string) => {
    setSelected(value);
    try {
      localStorage.setItem(storageKey, value);
      localStorage.setItem(`${storageKey}_timestamp`, Date.now().toString());

      // 立即验证保存结果
      const _verifyValue = localStorage.getItem(storageKey);
    } catch {
      // Error saving to localStorage
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
          localStorage.setItem(responseKey, 'true');
          localStorage.setItem(`${responseKey}_timestamp`, Date.now().toString());

          // 立即验证保存结果
          const _verifyResponse = localStorage.getItem(responseKey);
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

  return (
    <Card className='mb-4' bordered={false} style={{ background: '#f8f9fa' }}>
      <div className='space-y-4'>
        {/* Header with icon and title */}
        <div className='flex items-center space-x-2'>
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{title}</Text>
          <span className='text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded'>Codex</span>
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
                  const optionName = option?.name || `Option ${index + 1}`;
                  const optionId = option?.optionId || `option_${index}`;
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
