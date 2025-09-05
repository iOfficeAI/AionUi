/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Typography, Radio, Message } from '@arco-design/web-react';
import type { IMessageAcpPermission } from '@/common/chatLib';
import { acpConversation } from '@/common/ipcBridge';

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
        icon: '🔐'
      };
    }
    
    const { command, description: toolDesc } = toolCall.rawInput;
    
    // 根据命令类型智能判断图标和描述
    if (command?.includes('open')) {
      return {
        title: toolDesc || 'File Access Request',
        description: `Open file: ${command}`,
        icon: '📂'
      };
    } else if (command?.includes('read')) {
      return {
        title: toolDesc || 'Read File Permission',
        description: `Read operation: ${command}`,
        icon: '📖'
      };
    } else if (command?.includes('write') || command?.includes('save')) {
      return {
        title: toolDesc || 'Write File Permission',
        description: `Write operation: ${command}`,
        icon: '✏️'
      };
    } else if (command?.includes('rm') || command?.includes('delete')) {
      return {
        title: toolDesc || 'Delete Permission',
        description: `Delete operation: ${command}`,
        icon: '🗑️'
      };
    } else if (command) {
      return {
        title: toolDesc || 'Execute Command',
        description: `Command: ${command}`,
        icon: '⚡'
      };
    }
    
    return {
      title: toolDesc || 'Permission Request',
      description: 'The agent is requesting permission for an action.',
      icon: '🔐'
    };
  };
  
  const { title, description, icon } = getToolInfo();

  const [selectedOption, setSelectedOption] = useState(options[0]?.optionId || '');
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  const handleResponse = async () => {
    if (!selectedOption || hasResponded) return;

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
        Message.success('Permission response sent');
      } else {
        Message.error(`Failed to send response: ${result.msg}`);
      }
    } catch (error) {
      Message.error('Failed to send response');
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <Card
      className='acp-permission-message max-w-md'
      title={
        <div className='flex items-center gap-2'>
          <span>{icon}</span>
          <Text style={{ fontWeight: 'bold' }}>{title}</Text>
        </div>
      }
      extra={
        hasResponded && (
          <Text type='success' className='text-sm'>
            ✓ Responded
          </Text>
        )
      }
    >
      <div className='space-y-4'>
        <div>
          {description && (
            <div className='bg-gray-50 rounded-lg p-3 mb-3'>
              <Text className='text-sm font-mono text-gray-700'>{description}</Text>
            </div>
          )}
          {toolCall?.toolCallId && (
            <Text type='secondary' className='text-xs'>
              Tool Call ID: {toolCall.toolCallId}
            </Text>
          )}
        </div>

        <div>
          <Text className='block mb-2 text-sm font-medium'>Choose an option:</Text>
          <Radio.Group 
            value={selectedOption} 
            onChange={setSelectedOption} 
            disabled={hasResponded} 
            direction='vertical'
            className='w-full'
          >
            {options && options.length > 0 ? (
              options.map((option, index) => {
                // 优先使用 ACP 官方协议标准的 name 字段，向后兼容 title
                const optionName = option.name || option.title || `Option ${index + 1}`;
                const optionDescription = option.description || getKindDescription(option.kind);
                
                return (
                  <Radio 
                    key={option.optionId} 
                    value={option.optionId} 
                    style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-start' }}
                  >
                    <div style={{ marginLeft: '4px' }}>
                      <div style={{ fontWeight: 500 }}>{optionName}</div>
                      {optionDescription && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          {optionDescription}
                        </div>
                      )}
                    </div>
                  </Radio>
                );
              })
            ) : (
              <Text type='secondary'>No options available</Text>
            )}
          </Radio.Group>
        </div>

        <div className='flex justify-end pt-2'>
          <Button type='primary' size='small' onClick={handleResponse} loading={isResponding} disabled={hasResponded || !selectedOption}>
            {hasResponded ? 'Response Sent' : 'Send Response'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default MessageAcpPermission;
