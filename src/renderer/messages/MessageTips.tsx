/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips } from '@/common/chatLib';
import { Attention, CheckOne } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
import { ipcBridge } from '@/common';
import { Button, Message } from '@arco-design/web-react';
import type { AcpBackendAll } from '@/types/acpTypes';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import DroidLogo from '@/renderer/assets/logos/droid.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';

const icon = {
  success: <CheckOne theme='filled' size='16' fill={theme.Color.FunctionalColor.success} className='m-t-2px' />,
  warning: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.warn} />,
  error: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.error} />,
};

const AGENT_LOGOS: Partial<Record<AcpBackendAll, string>> = {
  claude: ClaudeLogo,
  codex: CodexLogo,
  opencode: OpenCodeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  iflow: IflowLogo,
  droid: DroidLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
};

const AGENT_NAMES: Partial<Record<AcpBackendAll, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini: 'Gemini',
  qwen: 'Qwen Code',
  iflow: 'iFlow',
  droid: 'Droid',
  goose: 'Goose',
  auggie: 'Auggie',
  kimi: 'Kimi',
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      return {
        json: true,
        data: json,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

// Agent 选择器组件
const AgentSelector: React.FC<{
  conversationId: string;
  excludeAgents: AcpBackendAll[];
}> = ({ conversationId, excludeAgents }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [availableAgents, setAvailableAgents] = useState<Array<{ backend: AcpBackendAll; name: string; cliPath?: string }>>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
      if (result.success && result.data) {
        // 显示所有可用的 agents，排除 custom 和已失败的 agents，以及没有 logo 的 agents
        // Show all available agents, excluding 'custom', failed agents, and agents without logos
        const agents = result.data
          .filter((agent) => agent.backend !== 'custom' && !excludeAgents.includes(agent.backend) && AGENT_LOGOS[agent.backend])
          .map((agent) => ({
            backend: agent.backend,
            name: agent.name,
            cliPath: agent.cliPath,
          }));
        setAvailableAgents(agents);
      }
    };
    void fetchAgents();
  }, [excludeAgents]);

  const handleSwitch = useCallback(
    async (agentType: AcpBackendAll, cliPath?: string) => {
      if (switching) return;
      setSwitching(true);

      try {
        // 获取当前会话信息
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
        if (!conversation) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          return;
        }

        // 根据 agentType 决定会话类型
        // Determine conversation type based on agentType
        const isGemini = agentType === 'gemini';
        const conversationType = isGemini ? 'gemini' : 'acp';

        // 获取当前会话的模型信息（如果是 gemini 类型）
        // Get current conversation's model info (if gemini type)
        const currentModel = conversation.type === 'gemini' ? conversation.model : undefined;

        // 创建新的会话
        // Create new conversation
        const newConversation = await ipcBridge.conversation.create.invoke({
          type: conversationType,
          name: conversation.name || 'New Conversation',
          model: currentModel || {
            id: 'default',
            name: 'Default',
            useModel: 'default',
            platform: 'custom',
            baseUrl: '',
            apiKey: '',
          },
          extra: {
            workspace: conversation.extra?.workspace || '',
            customWorkspace: conversation.extra?.customWorkspace || false,
            ...(isGemini
              ? {
                  // Gemini 会话的 extra 字段
                  presetRules: ((conversation.extra as Record<string, unknown>)?.presetRules || (conversation.extra as Record<string, unknown>)?.presetContext) as string,
                  enabledSkills: conversation.extra?.enabledSkills,
                  presetAssistantId: conversation.extra?.presetAssistantId,
                }
              : {
                  // ACP 会话的 extra 字段
                  backend: agentType,
                  cliPath,
                  presetContext: ((conversation.extra as Record<string, unknown>)?.presetRules || (conversation.extra as Record<string, unknown>)?.presetContext) as string,
                  enabledSkills: conversation.extra?.enabledSkills,
                  presetAssistantId: conversation.extra?.presetAssistantId,
                }),
          },
        });

        if (!newConversation?.id) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          return;
        }

        // 获取用户的原始消息（从 sessionStorage 或数据库）
        const messages = await ipcBridge.database.getConversationMessages.invoke({ conversation_id: conversationId });
        const userMessage = messages?.find((msg) => msg.position === 'right' && msg.type === 'text');
        if (userMessage && userMessage.type === 'text') {
          // 存储初始消息，让新会话页面发送
          const initialMessage: { input: string; files: string[] } = {
            input: userMessage.content.content,
            files: [],
          };
          const storageKey = isGemini ? `gemini_initial_message_${newConversation.id}` : `acp_initial_message_${newConversation.id}`;
          sessionStorage.setItem(storageKey, JSON.stringify(initialMessage));
        }

        // 显示通知并导航到新会话
        const agentName = AGENT_NAMES[agentType] || agentType;
        Message.success(t('conversation.chat.switchedToAgent', { defaultValue: `Switched to ${agentName}`, agent: agentName }));

        void navigate(`/conversation/${newConversation.id}`);
      } catch (error) {
        console.error('Failed to switch agent:', error);
        Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
      } finally {
        setSwitching(false);
      }
    },
    [conversationId, navigate, switching, t]
  );

  if (availableAgents.length === 0) {
    return null;
  }

  return (
    <div className='m-t-8px'>
      <div className='text-12px text-t-secondary m-b-4px'>{t('conversation.chat.tryAnotherAgent', { defaultValue: 'Try another agent:' })}</div>
      <div className='flex gap-8px overflow-x-auto p-b-4px'>
        {availableAgents.map((agent) => (
          <Button key={agent.backend} type='outline' size='small' loading={switching} onClick={() => handleSwitch(agent.backend, agent.cliPath)} className='flex items-center gap-4px flex-shrink-0'>
            <img src={AGENT_LOGOS[agent.backend]} alt={AGENT_NAMES[agent.backend]} className='w-16px h-16px' />
            <span>{AGENT_NAMES[agent.backend]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};

const MessageTips: React.FC<{ message: IMessageTips }> = ({ message }) => {
  const { content, type } = message.content;
  const { json, data } = useFormatContent(content);
  const { t } = useTranslation();

  // 检测是否是 API 错误（适合显示 agent 选择器）
  const isApiError = useMemo(() => {
    if (type !== 'error') return false;
    let text = '';
    if (typeof content === 'string') {
      text = content.toLowerCase();
    } else if (content && typeof data === 'object') {
      try {
        text = JSON.stringify(data).toLowerCase();
      } catch {
        return false;
      }
    } else {
      return false;
    }

    // 检测 API 相关错误
    const hasApiError = /(?:api|status|code|error)[:\s]*(?:400|401|403|404|500|502|503|504)/i.test(text) || text.includes('invalid url') || text.includes('not found') || text.includes('api key not valid') || text.includes('api_key_invalid') || text.includes('invalid_argument') || text.includes('unauthorized') || text.includes('forbidden');

    return hasApiError;
  }, [content, data, type]);

  // 从 localStorage 获取已排除的 agents（按会话 ID 存储）
  const conversationId = message.conversation_id;
  const excludedAgentsKey = `excluded_agents_${conversationId}`;
  const [excludedAgents, setExcludedAgents] = useState<AcpBackendAll[]>(() => {
    try {
      const stored = localStorage.getItem(excludedAgentsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // 当检测到错误时，将当前使用的 agent 添加到排除列表
  useEffect(() => {
    if (isApiError && message.conversation_id) {
      // 检测当前会话类型，如果是 gemini 则排除它；如果是 acp，排除对应的 backend
      void ipcBridge.conversation.get.invoke({ id: message.conversation_id }).then((conv) => {
        if (conv?.type === 'gemini') {
          setExcludedAgents((prev) => {
            const newExcluded = [...new Set([...prev, 'gemini' as AcpBackendAll])];
            localStorage.setItem(excludedAgentsKey, JSON.stringify(newExcluded));
            return newExcluded;
          });
        } else if (conv?.type === 'acp' && conv.extra?.backend) {
          setExcludedAgents((prev) => {
            const newExcluded = [...new Set([...prev, conv.extra.backend as AcpBackendAll])];
            localStorage.setItem(excludedAgentsKey, JSON.stringify(newExcluded));
            return newExcluded;
          });
        }
      });
    }
  }, [isApiError, message.conversation_id, excludedAgentsKey]);

  // Handle structured error messages with error codes
  const getDisplayContent = (content: string): string => {
    if (content.startsWith('ERROR_')) {
      const parts = content.split(': ');
      const errorCode = parts[0].replace('ERROR_', '');
      const originalMessage = parts[1] || '';

      // Map error codes to i18n keys
      const errorMap: Record<string, string> = {
        CLOUDFLARE_BLOCKED: 'codex.network.cloudflare_blocked',
        NETWORK_TIMEOUT: 'codex.network.network_timeout',
        CONNECTION_REFUSED: 'codex.network.connection_refused',
        SESSION_TIMEOUT: 'codex.error.session_timeout',
        SYSTEM_INIT_FAILED: 'codex.error.system_init_failed',
        INVALID_MESSAGE_FORMAT: 'codex.error.invalid_message_format',
        INVALID_INPUT: 'codex.error.invalid_input',
        PERMISSION_DENIED: 'codex.error.permission_denied',
      };

      const i18nKey = errorMap[errorCode];
      if (i18nKey) {
        return t(i18nKey, { defaultValue: originalMessage });
      }
    }
    return content;
  };

  const displayContent = getDisplayContent(content);

  if (json)
    return (
      <div className=' p-x-12px p-y-8px w-full max-w-100% min-w-0'>
        <CollapsibleContent maxHeight={300} defaultCollapsed={true}>
          <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
        </CollapsibleContent>
        {isApiError && conversationId && <AgentSelector conversationId={conversationId} excludeAgents={excludedAgents} />}
      </div>
    );
  return (
    <div className='w-full'>
      <div className={classNames('bg-message-tips rd-8px  p-x-12px p-y-8px flex items-start gap-4px')}>
        {icon[type] || icon.warning}
        <CollapsibleContent maxHeight={200} defaultCollapsed={true} className='flex-1' useMask={true}>
          <span
            className='whitespace-break-spaces text-t-primary [word-break:break-word]'
            dangerouslySetInnerHTML={{
              __html: displayContent,
            }}
          ></span>
        </CollapsibleContent>
      </div>
      {isApiError && conversationId && <AgentSelector conversationId={conversationId} excludeAgents={excludedAgents} />}
    </div>
  );
};

export default MessageTips;
