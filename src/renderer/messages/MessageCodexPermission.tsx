/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexPermission } from '@/common/chatLib';
import { conversation } from '@/common/ipcBridge';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageCodexPermissionProps {
  message: IMessageCodexPermission;
}

const MessageCodexPermission: React.FC<MessageCodexPermissionProps> = React.memo(({ message }) => {
  const { options = [], toolCall } = message.content || {};
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

  // 生成全局唯一且稳定的权限ID，不依赖于conversation_id或message_id
  const generateGlobalPermissionId = () => {
    // 构建权限请求的特征字符串
    const features = [toolCall?.kind || 'permission', toolCall?.title || '', toolCall?.rawInput?.command || '', JSON.stringify(options || [])];

    const featureString = features.filter(Boolean).join('|');

    // 生成稳定的哈希
    let hash = 0;
    for (let i = 0; i < featureString.length; i++) {
      const char = featureString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32位整数
    }

    return `codex_perm_${Math.abs(hash)}`;
  };

  const permissionId = generateGlobalPermissionId();
  // 使用全局key，不区分conversation，让相同权限请求在所有会话中共享状态
  const storageKey = `codex_global_permission_choice_${permissionId}`;
  const responseKey = `codex_global_permission_responded_${permissionId}`;

  console.log('🔐 [MessageCodexPermission] Component rendered with:', {
    messageId: message.id,
    msgId: message.msg_id,
    toolCallId: toolCall?.toolCallId,
    permissionId,
    storageKey,
    responseKey,
    conversationId: message.conversation_id,
  });

  // 立即从localStorage初始化状态，避免闪烁
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [isResponding, setIsResponding] = useState(false);

  const [hasResponded, setHasResponded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(responseKey) === 'true';
    } catch {
      return false;
    }
  });

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

  // 组件挂载时清理旧存储
  useEffect(() => {
    console.log('🔐 [MessageCodexPermission] Component mounted:', {
      storageKey,
      responseKey,
      permissionId,
      initialSelected: selected,
      initialHasResponded: hasResponded,
    });

    // 清理超过7天的旧权限存储
    cleanupOldPermissionStorage();
  }, [permissionId]); // 只在permissionId变化时执行

  // 保存选择状态到 localStorage
  const handleSelectionChange = (value: string) => {
    console.log('🔐 [MessageCodexPermission] Handling selection change:', { value, storageKey });
    setSelected(value);
    try {
      localStorage.setItem(storageKey, value);
      localStorage.setItem(`${storageKey}_timestamp`, Date.now().toString());

      // 立即验证保存结果
      const verifyValue = localStorage.getItem(storageKey);
      console.log('🔐 [MessageCodexPermission] Saved and verified choice:', {
        permissionId,
        storageKey,
        selectedValue: value,
        verifyValue,
        saveSuccess: verifyValue === value,
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

      // 使用通用的 confirmMessage，process 层会自动分发到正确的 handler
      const result = await conversation.confirmMessage.invoke(invokeData);

      if (result.success) {
        setHasResponded(true);
        try {
          localStorage.setItem(responseKey, 'true');
          localStorage.setItem(`${responseKey}_timestamp`, Date.now().toString());

          // 立即验证保存结果
          const verifyResponse = localStorage.getItem(responseKey);
          console.log('🔐 [MessageCodexPermission] Saved and verified response:', {
            permissionId,
            responseKey,
            selected,
            verifyResponse,
            saveSuccess: verifyResponse === 'true',
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

        {/* 调试信息面板 - 可以在生产环境中移除 */}
        {process.env.NODE_ENV === 'development' && (
          <details className='mt-2 text-xs text-gray-500'>
            <summary className='cursor-pointer'>权限持久化调试</summary>
            <div className='mt-1 p-2 bg-gray-50 rounded text-xs space-y-1'>
              <div>
                <strong>工具信息:</strong>
              </div>
              <div>• toolCallId: {toolCall?.toolCallId || 'null'}</div>
              <div>• command: {toolCall?.rawInput?.command || 'null'}</div>
              <div>• kind: {toolCall?.kind || 'null'}</div>
              <div>
                <strong>生成的稳定ID:</strong> {permissionId}
              </div>
              <div>
                <strong>存储键:</strong>
              </div>
              <div>• choice: {storageKey}</div>
              <div>• response: {responseKey}</div>
              <div>
                <strong>当前状态:</strong>
              </div>
              <div>• selected: {selected || 'null'}</div>
              <div>• hasResponded: {hasResponded.toString()}</div>
              <div>
                <strong>localStorage实际值:</strong>
              </div>
              <div>• choice: {localStorage.getItem(storageKey) || 'null'}</div>
              <div>• response: {localStorage.getItem(responseKey) || 'null'}</div>
              <div>
                <strong>会话ID:</strong> {message.conversation_id}
              </div>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
});

export default MessageCodexPermission;
