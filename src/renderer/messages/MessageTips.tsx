/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips } from '@/common/chatLib';
import { Attention, CheckOne, CloseOne, Loading } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
import { ipcBridge } from '@/common';
import { Button, Message, Progress } from '@arco-design/web-react';
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

interface AgentCheckResult {
  backend: AcpBackendAll;
  name: string;
  available: boolean;
  latency?: number;
  error?: string;
  checking: boolean;
}

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
  const navigate = useNavigate();
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AcpBackendAll | 'gemini'>('gemini');
  const [checkResults, setCheckResults] = useState<AgentCheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bestAgent, setBestAgent] = useState<AgentCheckResult | null>(null);

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

  // 当检测到错误时，将当前使用的 agent 添加到排除列表，并开始健康检查
  useEffect(() => {
    if (isApiError && message.conversation_id && !showHealthCheck) {
      // 检测当前会话类型，如果是 gemini 则排除它；如果是 acp，排除对应的 backend
      void ipcBridge.conversation.get.invoke({ id: message.conversation_id }).then((conv) => {
        if (conv?.type === 'gemini') {
          setCurrentAgent('gemini');
          setExcludedAgents((prev) => {
            const newExcluded = [...new Set([...prev, 'gemini' as AcpBackendAll])];
            localStorage.setItem(excludedAgentsKey, JSON.stringify(newExcluded));
            return newExcluded;
          });
          setShowHealthCheck(true);
          void startHealthCheck('gemini');
        } else if (conv?.type === 'acp' && conv.extra?.backend) {
          const backend = conv.extra.backend as AcpBackendAll;
          setCurrentAgent(backend);
          setExcludedAgents((prev) => {
            const newExcluded = [...new Set([...prev, backend])];
            localStorage.setItem(excludedAgentsKey, JSON.stringify(newExcluded));
            return newExcluded;
          });
          setShowHealthCheck(true);
          void startHealthCheck(backend);
        }
      });
    }
  }, [isApiError, message.conversation_id, excludedAgentsKey, showHealthCheck]);

  // Start health check for available agents
  const startHealthCheck = useCallback(
    async (failedAgent: AcpBackendAll | 'gemini') => {
      setChecking(true);
      setProgress(0);
      setCheckResults([]);
      setBestAgent(null);

      try {
        const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        if (!result.success || !result.data) {
          setChecking(false);
          return;
        }

        const agentsToCheck = result.data
          .filter((agent) => agent.backend !== 'custom' && !excludedAgents.includes(agent.backend) && agent.backend !== failedAgent && AGENT_LOGOS[agent.backend])
          .map((agent) => ({
            backend: agent.backend as AcpBackendAll,
            name: AGENT_NAMES[agent.backend] || agent.name,
            available: false,
            checking: true,
          }));

        if (agentsToCheck.length === 0) {
          setChecking(false);
          return;
        }

        setCheckResults(agentsToCheck);

        const total = agentsToCheck.length;
        let completed = 0;
        const results: AgentCheckResult[] = [];

        for (const agent of agentsToCheck) {
          const startTime = Date.now();

          try {
            const healthResult = await ipcBridge.acpConversation.checkAgentHealth.invoke({ backend: agent.backend });
            const latency = Date.now() - startTime;

            const result: AgentCheckResult = {
              ...agent,
              available: healthResult.success === true,
              latency: healthResult.success ? latency : undefined,
              error: healthResult.success ? undefined : healthResult.msg,
              checking: false,
            };

            results.push(result);
          } catch (error) {
            results.push({
              ...agent,
              available: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              checking: false,
            });
          }

          completed++;
          setProgress(Math.round((completed / total) * 100));
          setCheckResults([...results, ...agentsToCheck.slice(completed).map((a) => ({ ...a, checking: true }))]);
        }

        const availableAgents = results.filter((r) => r.available);
        if (availableAgents.length > 0) {
          const best = availableAgents.reduce((prev, current) => {
            if (!prev.latency) return current;
            if (!current.latency) return prev;
            return current.latency < prev.latency ? current : prev;
          });
          setBestAgent(best);
        }

        setChecking(false);
      } catch (error) {
        console.error('Health check failed:', error);
        setChecking(false);
      }
    },
    [excludedAgents]
  );

  // Handle agent selection from health check card
  const handleSelectAgent = useCallback(
    async (agentType: AcpBackendAll) => {
      if (!message.conversation_id) return;

      try {
        // Get current conversation info
        const conversation = await ipcBridge.conversation.get.invoke({ id: message.conversation_id });
        if (!conversation) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          return;
        }

        // Determine conversation type based on agentType
        const isGemini = agentType === 'gemini';
        const conversationType = isGemini ? 'gemini' : 'acp';

        // Get current conversation's model info (if gemini type)
        const currentModel = conversation.type === 'gemini' ? conversation.model : undefined;

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
                  // Gemini conversation extra fields
                  presetRules: ((conversation.extra as Record<string, unknown>)?.presetRules || (conversation.extra as Record<string, unknown>)?.presetContext) as string,
                  enabledSkills: conversation.extra?.enabledSkills,
                  presetAssistantId: conversation.extra?.presetAssistantId,
                }
              : {
                  // ACP conversation extra fields
                  backend: agentType,
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

        // Get user's original message (from sessionStorage or database)
        const messages = await ipcBridge.database.getConversationMessages.invoke({ conversation_id: message.conversation_id });
        const userMessage = messages?.find((msg) => msg.position === 'right' && msg.type === 'text');
        if (userMessage && userMessage.type === 'text') {
          // Store initial message for new conversation page to send
          const initialMessage: { input: string; files: string[] } = {
            input: userMessage.content.content,
            files: [],
          };
          const storageKey = isGemini ? `gemini_initial_message_${newConversation.id}` : `acp_initial_message_${newConversation.id}`;
          sessionStorage.setItem(storageKey, JSON.stringify(initialMessage));
        }

        // Show notification and navigate to new conversation
        const agentName = AGENT_NAMES[agentType] || agentType;
        Message.success(t('conversation.chat.switchedToAgent', { defaultValue: `Switched to ${agentName}`, agent: agentName }));

        setShowHealthCheck(false);
        void navigate(`/conversation/${newConversation.id}`);
      } catch (error) {
        console.error('Failed to switch agent:', error);
        Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
      }
    },
    [message.conversation_id, navigate, t]
  );

  // Get latency label based on latency value
  const getLatencyLabel = useCallback(
    (latency?: number): string => {
      if (!latency) return '';
      if (latency < 1000) return t('agent.health.lowLatency', { defaultValue: 'Low Latency' });
      if (latency < 3000) return t('agent.health.mediumLatency', { defaultValue: 'Medium Latency' });
      return t('agent.health.highLatency', { defaultValue: 'High Latency' });
    },
    [t]
  );

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

  const currentAgentName = AGENT_NAMES[currentAgent as AcpBackendAll] || currentAgent;

  if (json)
    return (
      <div className=' p-x-12px p-y-8px w-full max-w-100% min-w-0'>
        <CollapsibleContent maxHeight={300} defaultCollapsed={true}>
          <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
        </CollapsibleContent>
        {isApiError && conversationId && !showHealthCheck && <AgentSelector conversationId={conversationId} excludeAgents={excludedAgents} />}
        {isApiError && conversationId && showHealthCheck && (
          <div className='m-t-12px border-1 border-solid border-border-2 rounded-8px p-16px bg-fill-1'>
            {/* Header */}
            <div className='flex items-center gap-8px mb-12px'>
              <span className='text-20px'>⚠️</span>
              <div className='flex-1'>
                <div className='text-14px font-medium text-t-primary'>{t('agent.health.detectedError', { defaultValue: '检测到当前 Agent ({{agent}}) 响应异常', agent: currentAgentName })}</div>
                <div className='text-12px text-t-secondary m-t-4px'>{t('agent.health.autoSwitching', { defaultValue: '系统将自动尝试切换线路' })}</div>
              </div>
            </div>

            {/* Checking Phase */}
            {checking && (
              <div>
                <div className='flex items-center gap-6px mb-8px'>
                  <Loading theme='outline' size={14} className='animate-spin' />
                  <span className='text-12px text-t-secondary'>{t('agent.health.evaluating', { defaultValue: '正在评估网络延迟与模型可用性...' })}</span>
                </div>

                {/* Check results list with fixed height scrolling */}
                <div className='max-h-120px overflow-y-auto mb-10px space-y-6px'>
                  {checkResults.map((result) => (
                    <div key={result.backend} className='flex items-center gap-6px text-12px'>
                      {result.checking ? <Loading theme='outline' size={12} className='animate-spin text-t-tertiary' /> : result.available ? <CheckOne theme='filled' size={12} fill='var(--color-success-6)' /> : <CloseOne theme='filled' size={12} fill='var(--color-danger-6)' />}
                      <span className='text-t-secondary'>{t('agent.health.checking', { defaultValue: '检查 {{agent}} 节点...', agent: result.name })}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <Progress percent={progress} size='small' status={progress === 100 ? 'success' : 'normal'} />
              </div>
            )}

            {/* Results Phase */}
            {!checking && bestAgent && (
              <div>
                <div className='flex items-center gap-6px mb-10px'>
                  <span className='text-16px'>⚡</span>
                  <span className='text-13px font-medium text-t-primary'>{t('agent.health.foundBest', { defaultValue: '已找到最佳替代方案' })}</span>
                </div>

                {/* Available agents list with fixed height scrolling */}
                <div className='max-h-160px overflow-y-auto space-y-8px'>
                  {/* Best agent card */}
                  <div className='bg-primary-1 border-1 border-primary-3 rounded-6px p-12px cursor-pointer hover:bg-primary-2 transition-colors' onClick={() => handleSelectAgent(bestAgent.backend)}>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-10px'>
                        {AGENT_LOGOS[bestAgent.backend] && <img src={AGENT_LOGOS[bestAgent.backend]} alt={bestAgent.name} className='w-20px h-20px' />}
                        <div>
                          <div className='text-13px font-medium text-t-primary'>{bestAgent.name}</div>
                          <div className='flex items-center gap-6px text-11px'>
                            <span className='flex items-center gap-3px text-success'>
                              <span className='w-5px h-5px rounded-full bg-success'></span>
                              {t('agent.health.available', { defaultValue: 'Available' })}
                            </span>
                            {bestAgent.latency && (
                              <>
                                <span className='text-t-tertiary'>·</span>
                                <span className='text-t-secondary'>{getLatencyLabel(bestAgent.latency)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className='px-8px py-2px bg-primary text-white text-11px font-medium rounded-full'>{t('agent.health.bestMatch', { defaultValue: 'Best Match' })}</span>
                    </div>
                  </div>

                  {/* Other available agents */}
                  {checkResults
                    .filter((r) => r.available && r.backend !== bestAgent.backend)
                    .map((result) => (
                      <div key={result.backend} className='bg-fill-2 rounded-6px p-10px cursor-pointer hover:bg-fill-3 transition-colors' onClick={() => handleSelectAgent(result.backend)}>
                        <div className='flex items-center gap-10px'>
                          {AGENT_LOGOS[result.backend] && <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-18px h-18px' />}
                          <div>
                            <div className='text-12px font-medium text-t-primary'>{result.name}</div>
                            <div className='flex items-center gap-6px text-11px'>
                              <span className='text-t-secondary'>{t('agent.health.available', { defaultValue: 'Available' })}</span>
                              {result.latency && (
                                <>
                                  <span className='text-t-tertiary'>·</span>
                                  <span className='text-t-tertiary'>{result.latency}ms</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* No available agents */}
            {!checking && !bestAgent && checkResults.length > 0 && (
              <div className='text-center py-16px'>
                <div className='text-32px mb-6px'>😔</div>
                <div className='text-13px font-medium text-t-primary mb-6px'>{t('agent.health.noAvailable', { defaultValue: '当前环境没有可用 agent' })}</div>
                <div className='text-12px text-t-secondary'>{t('agent.health.checkConfig', { defaultValue: '请检查配置或稍后重试' })}</div>
              </div>
            )}
          </div>
        )}
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
      {isApiError && conversationId && !showHealthCheck && <AgentSelector conversationId={conversationId} excludeAgents={excludedAgents} />}
      {isApiError && conversationId && showHealthCheck && (
        <div className='m-t-12px border-1 border-solid border-border-2 rounded-8px p-16px bg-fill-1'>
          {/* Header */}
          <div className='flex items-center gap-8px mb-12px'>
            <span className='text-20px'>⚠️</span>
            <div className='flex-1'>
              <div className='text-14px font-medium text-t-primary'>{t('agent.health.detectedError', { defaultValue: '检测到当前 Agent ({{agent}}) 响应异常', agent: currentAgentName })}</div>
              <div className='text-12px text-t-secondary m-t-4px'>{t('agent.health.autoSwitching', { defaultValue: '系统将自动尝试切换线路' })}</div>
            </div>
          </div>

          {/* Checking Phase */}
          {checking && (
            <div>
              <div className='flex items-center gap-6px mb-8px'>
                <Loading theme='outline' size={14} className='animate-spin' />
                <span className='text-12px text-t-secondary'>{t('agent.health.evaluating', { defaultValue: '正在评估网络延迟与模型可用性...' })}</span>
              </div>

              {/* Check results list with fixed height scrolling */}
              <div className='max-h-120px overflow-y-auto mb-10px space-y-6px'>
                {checkResults.map((result) => (
                  <div key={result.backend} className='flex items-center gap-6px text-12px'>
                    {result.checking ? <Loading theme='outline' size={12} className='animate-spin text-t-tertiary' /> : result.available ? <CheckOne theme='filled' size={12} fill='var(--color-success-6)' /> : <CloseOne theme='filled' size={12} fill='var(--color-danger-6)' />}
                    <span className='text-t-secondary'>{t('agent.health.checking', { defaultValue: '检查 {{agent}} 节点...', agent: result.name })}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <Progress percent={progress} size='small' status={progress === 100 ? 'success' : 'normal'} />
            </div>
          )}

          {/* Results Phase */}
          {!checking && bestAgent && (
            <div>
              <div className='flex items-center gap-6px mb-10px'>
                <span className='text-16px'>⚡</span>
                <span className='text-13px font-medium text-t-primary'>{t('agent.health.foundBest', { defaultValue: '已找到最佳替代方案' })}</span>
              </div>

              {/* Available agents list with fixed height scrolling */}
              <div className='max-h-160px overflow-y-auto space-y-8px'>
                {/* Best agent card */}
                <div className='bg-primary-1 border-1 border-primary-3 rounded-6px p-12px cursor-pointer hover:bg-primary-2 transition-colors' onClick={() => handleSelectAgent(bestAgent.backend)}>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-10px'>
                      {AGENT_LOGOS[bestAgent.backend] && <img src={AGENT_LOGOS[bestAgent.backend]} alt={bestAgent.name} className='w-20px h-20px' />}
                      <div>
                        <div className='text-13px font-medium text-t-primary'>{bestAgent.name}</div>
                        <div className='flex items-center gap-6px text-11px'>
                          <span className='flex items-center gap-3px text-success'>
                            <span className='w-5px h-5px rounded-full bg-success'></span>
                            {t('agent.health.available', { defaultValue: 'Available' })}
                          </span>
                          {bestAgent.latency && (
                            <>
                              <span className='text-t-tertiary'>·</span>
                              <span className='text-t-secondary'>{getLatencyLabel(bestAgent.latency)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className='px-8px py-2px bg-primary text-white text-11px font-medium rounded-full'>{t('agent.health.bestMatch', { defaultValue: 'Best Match' })}</span>
                  </div>
                </div>

                {/* Other available agents */}
                {checkResults
                  .filter((r) => r.available && r.backend !== bestAgent.backend)
                  .map((result) => (
                    <div key={result.backend} className='bg-fill-2 rounded-6px p-10px cursor-pointer hover:bg-fill-3 transition-colors' onClick={() => handleSelectAgent(result.backend)}>
                      <div className='flex items-center gap-10px'>
                        {AGENT_LOGOS[result.backend] && <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-18px h-18px' />}
                        <div>
                          <div className='text-12px font-medium text-t-primary'>{result.name}</div>
                          <div className='flex items-center gap-6px text-11px'>
                            <span className='text-t-secondary'>{t('agent.health.available', { defaultValue: 'Available' })}</span>
                            {result.latency && (
                              <>
                                <span className='text-t-tertiary'>·</span>
                                <span className='text-t-tertiary'>{result.latency}ms</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* No available agents */}
          {!checking && !bestAgent && checkResults.length > 0 && (
            <div className='text-center py-16px'>
              <div className='text-32px mb-6px'>😔</div>
              <div className='text-13px font-medium text-t-primary mb-6px'>{t('agent.health.noAvailable', { defaultValue: '当前环境没有可用 agent' })}</div>
              <div className='text-12px text-t-secondary'>{t('agent.health.checkConfig', { defaultValue: '请检查配置或稍后重试' })}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageTips;
