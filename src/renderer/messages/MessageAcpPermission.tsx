/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chatLib';
import { acpConversation } from '@/common/ipcBridge';
import { Radio, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';

const { Text } = Typography;

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

// 辅助函数：根据 kind 获取描述
const getKindDescription = (kind?: string): string => {
  switch (kind) {
    case 'allow_always':
      return 'Grant permission for all future requests';
    case 'allow_once':
      return 'Grant permission for this request only';
    case 'reject_once':
      return 'Deny this request';
    case 'reject_always':
      return 'Deny all future requests';
    default:
      return '';
  }
};

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = ({ message }) => {
  const { options = [], requestId, toolCall } = message.content || {};

  // 根据 toolCall 信息智能生成标题和描述
  const getToolInfo = () => {
    if (!toolCall?.rawInput) {
      return {
        title: 'Permission Request',
        description: 'The agent is requesting permission for an action.',
        icon: '🔐',
      };
    }

    const { command, description: toolDesc } = toolCall.rawInput;

    // 根据命令类型智能判断图标和描述
    if (command?.includes('open')) {
      return {
        title: toolDesc || 'File Access Request',
        description: `Open file: ${command}`,
        icon: '📂',
      };
    } else if (command?.includes('read')) {
      return {
        title: toolDesc || 'Read File Permission',
        description: `Read operation: ${command}`,
        icon: '📖',
      };
    } else if (command?.includes('write') || command?.includes('save')) {
      return {
        title: toolDesc || 'Write File Permission',
        description: `Write operation: ${command}`,
        icon: '✏️',
      };
    } else if (command?.includes('rm') || command?.includes('delete')) {
      return {
        title: toolDesc || 'Delete Permission',
        description: `Delete operation: ${command}`,
        icon: '🗑️',
      };
    } else if (command) {
      return {
        title: toolDesc || 'Execute Command',
        description: `Command: ${command}`,
        icon: '⚡',
      };
    }

    return {
      title: toolDesc || 'Permission Request',
      description: 'The agent is requesting permission for an action.',
      icon: '🔐',
    };
  };
  const { title, description, icon } = getToolInfo();
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  const handleResponse = async (selectedOption: string) => {
    if (hasResponded) return;

    setIsResponding(true);
    try {
      const invokeData = {
        confirmKey: selectedOption,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        callId: requestId,
      };

      const result = await acpConversation.confirmMessage.invoke(invokeData);

      if (result.success) {
        setHasResponded(true);
      } else {
        // Handle failure case - could add error display here
      }
    } catch (error) {
      // Handle error case - could add error logging here
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div>
      <div>
        <Text className='block mb-2 text-sm font-medium'>{title}</Text>
        <Radio.Group
          onChange={(value) => {
            handleResponse(value).then(() => {});
          }}
          disabled={hasResponded}
          direction='vertical'
          className='w-full'
        >
          {options && options.length > 0 ? (
            options.map((option, index) => {
              const optionName = option.name || option.title || `Option ${index + 1}`;
              // const optionDescription = option.description || getKindDescription(option.kind);
              return (
                <Radio key={option.optionId} value={option.optionId}>
                  {optionName}
                </Radio>
              );
            })
          ) : (
            <Text type='secondary'>No options available</Text>
          )}
        </Radio.Group>
      </div>
    </div>
  );
};

export default MessageAcpPermission;
