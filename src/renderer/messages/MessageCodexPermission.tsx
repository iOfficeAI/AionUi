/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexPermission } from '@/common/chatLib';
import { codexConversation } from '@/common/ipcBridge';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageCodexPermissionProps {
  message: IMessageCodexPermission;
}

const MessageCodexPermission: React.FC<MessageCodexPermissionProps> = React.memo(({ message }) => {
  const { options = [], toolCall } = (message.content as any) || {};
  const { t } = useTranslation();

  console.log('🔐 [MessageCodexPermission] Full message content:', {
    message,
    content: message.content,
    toolCall,
    options,
  });

  // 基于实际数据生成显示信息
  const getToolInfo = () => {
    if (!toolCall) {
      return {
        title: 'Permission Request',
        description: 'Codex is requesting permission.',
        icon: '🔐',
      };
    }

    // 直接使用 toolCall 中的实际数据
    const displayTitle = toolCall.title || toolCall.rawInput?.description || 'Permission Request';

    // 简单的图标映射
    const kindIcons: Record<string, string> = {
      edit: '✏️',
      read: '📖',
      fetch: '🌐',
      execute: '⚡',
    };

    return {
      title: displayTitle,
      icon: kindIcons[toolCall.kind || 'execute'] || '⚡',
    };
  };
  const { title, icon } = getToolInfo();

  // 生成唯一的存储键，使用更稳定的标识符
  const permissionId = toolCall?.toolCallId || message.msg_id || message.id;
  const storageKey = `codex_permission_choice_${message.conversation_id}_${permissionId}`;
  const responseKey = `codex_permission_responded_${message.conversation_id}_${permissionId}`;

  console.log('🔐 [MessageCodexPermission] Component rendered with:', {
    messageId: message.id,
    msgId: message.msg_id,
    toolCallId: toolCall?.toolCallId,
    permissionId,
    storageKey,
    responseKey,
    conversationId: message.conversation_id,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  // 清理旧的权限存储（超过7天的）
  const cleanupOldPermissionStorage = () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('codex_permission_choice_') || key.startsWith('codex_permission_responded_')) {
        const timestamp = localStorage.getItem(`${key}_timestamp`);
        if (timestamp && parseInt(timestamp) < sevenDaysAgo) {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      }
    });
  };

  // 在组件挂载时从 localStorage 恢复状态
  useEffect(() => {
    console.log('🔐 [MessageCodexPermission] useEffect triggered with dependencies:', {
      storageKey,
      responseKey,
      permissionId,
      hasLocalStorage: typeof localStorage !== 'undefined',
    });

    try {
      // 清理旧存储
      cleanupOldPermissionStorage();

      const savedChoice = localStorage.getItem(storageKey);
      const savedResponse = localStorage.getItem(responseKey);

      console.log('🔐 [MessageCodexPermission] Restoring state:', {
        permissionId,
        storageKey,
        responseKey,
        savedChoice,
        savedResponse,
        toolCall: toolCall?.title || toolCall?.rawInput?.description,
        allLocalStorageKeys: Object.keys(localStorage).filter((k) => k.includes('codex_permission')),
      });

      if (savedChoice) {
        console.log('🔐 [MessageCodexPermission] Setting saved choice:', savedChoice);
        setSelected(savedChoice);
      }

      if (savedResponse === 'true') {
        console.log('🔐 [MessageCodexPermission] Setting hasResponded to true');
        setHasResponded(true);
      }
    } catch (error) {
      console.error('🔐 [MessageCodexPermission] Error accessing localStorage:', error);
    }
  }, [storageKey, responseKey, permissionId]);

  // 保存选择状态到 localStorage
  const handleSelectionChange = (value: string) => {
    setSelected(value);
    try {
      localStorage.setItem(storageKey, value);
      localStorage.setItem(`${storageKey}_timestamp`, Date.now().toString());
      console.log('🔐 [MessageCodexPermission] Saved choice:', {
        permissionId,
        storageKey,
        selectedValue: value,
        verifyValue: localStorage.getItem(storageKey),
      });
    } catch (error) {
      console.error('🔐 [MessageCodexPermission] Error saving choice to localStorage:', error);
    }
  };

  const handleConfirm = async () => {
    if (hasResponded || !selected) return;

    setIsResponding(true);
    try {
      const invokeData = {
        confirmKey: selected,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        callId: toolCall?.toolCallId || message.id, // 使用 toolCallId 或 message.id 作为 fallback
      };

      // 使用 Codex 专用的确认处理器
      const result = await codexConversation.confirmMessage.invoke(invokeData);

      if (result.success) {
        setHasResponded(true);
        try {
          localStorage.setItem(responseKey, 'true');
          localStorage.setItem(`${responseKey}_timestamp`, Date.now().toString());
          console.log('🔐 [MessageCodexPermission] Saved response:', {
            permissionId,
            responseKey,
            selected,
            verifyResponse: localStorage.getItem(responseKey),
          });
        } catch (error) {
          console.error('🔐 [MessageCodexPermission] Error saving response to localStorage:', error);
        }
      } else {
        // Handle failure case - could add error display here
        console.error('Failed to confirm Codex permission:', result);
      }
    } catch (error) {
      // Handle error case - could add error logging here
      console.error('Error confirming Codex permission:', error);
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
                options.map((option: any, index: number) => {
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
