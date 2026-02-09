/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AgentSetupCard - A card component displayed above the SendBox when the current
 * agent is not configured (no auth/API key). It guides new users to set up their
 * agent or switch to an available alternative.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Message, Progress } from '@arco-design/web-react';
import { CheckOne, CloseOne, Loading, Down, Up } from '@icon-park/react';
import classNames from 'classnames';
import { ipcBridge } from '@/common';
import type { AcpBackendAll } from '@/types/acpTypes';
import type { AgentCheckResult } from '@/renderer/hooks/useAgentReadinessCheck';

// Agent logos
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

type AgentSetupCardProps = {
  conversationId: string;
  currentAgent: AcpBackendAll | null;
  error?: string;
  isChecking: boolean;
  progress: number;
  availableAgents: AgentCheckResult[];
  bestAgent: AgentCheckResult | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  // Auto-switch to best agent when found
  autoSwitch?: boolean;
  // Initial message to pass to the new conversation after switching
  initialMessage?: string;
};

const AgentSetupCard: React.FC<AgentSetupCardProps> = ({ conversationId, currentAgent: _currentAgent, error: _error, isChecking, progress: _progress, availableAgents, bestAgent, onDismiss: _onDismiss, onRetry, autoSwitch = true, initialMessage }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [expanded, setExpanded] = useState(false); // Default collapsed
  const switchingRef = React.useRef(false); // Use ref to avoid stale closure in auto-switch
  const autoSwitchTriggeredRef = React.useRef(false);

  const handleSelectAgent = useCallback(
    async (agent: AgentCheckResult) => {
      if (switchingRef.current) return;
      switchingRef.current = true;
      setSwitching(true);

      try {
        // Get current conversation info
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
        if (!conversation) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          switchingRef.current = false;
          setSwitching(false);
          return;
        }

        // Determine conversation type based on agent
        // Codex uses 'codex' type, Gemini uses 'gemini' type, others use 'acp' type
        const isGemini = agent.backend === 'gemini';
        const isCodex = agent.backend === 'codex';
        const conversationType = isGemini ? 'gemini' : isCodex ? 'codex' : 'acp';

        // Get current conversation's model info (if gemini type)
        const currentModel = conversation.type === 'gemini' ? conversation.model : undefined;

        // Create new conversation with the selected agent
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
                  presetRules: ((conversation.extra as Record<string, unknown>)?.presetRules || (conversation.extra as Record<string, unknown>)?.presetContext) as string,
                  enabledSkills: conversation.extra?.enabledSkills,
                  presetAssistantId: conversation.extra?.presetAssistantId,
                }
              : {
                  backend: agent.backend,
                  cliPath: agent.cliPath,
                  presetContext: ((conversation.extra as Record<string, unknown>)?.presetRules || (conversation.extra as Record<string, unknown>)?.presetContext) as string,
                  enabledSkills: conversation.extra?.enabledSkills,
                  presetAssistantId: conversation.extra?.presetAssistantId,
                }),
          },
        });

        if (!newConversation?.id) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          switchingRef.current = false;
          setSwitching(false);
          return;
        }

        // Store initial message for the new conversation to send automatically
        // 存储初始消息，让新会话自动发送
        if (initialMessage) {
          const messageData = { input: initialMessage, files: [] as string[] };
          if (isGemini) {
            sessionStorage.setItem(`gemini_initial_message_${newConversation.id}`, JSON.stringify(messageData));
          } else if (isCodex) {
            sessionStorage.setItem(`codex_initial_message_${newConversation.id}`, JSON.stringify(messageData));
          } else {
            sessionStorage.setItem(`acp_initial_message_${newConversation.id}`, JSON.stringify(messageData));
          }
        }

        // Show success notification and navigate
        Message.success(
          t('conversation.chat.switchedToAgent', {
            defaultValue: `Switched to ${agent.name}`,
            agent: agent.name,
          })
        );

        void navigate(`/conversation/${newConversation.id}`);
      } catch (error) {
        console.error('Failed to switch agent:', error);
        Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [conversationId, navigate, t, initialMessage]
  );

  const availableCount = availableAgents.filter((a) => a.available).length;

  // Auto-switch to best agent when check completes and best agent is found
  // Add a delay (1.5s) to let users see the animation and understand what's happening
  useEffect(() => {
    if (autoSwitch && !isChecking && bestAgent && !autoSwitchTriggeredRef.current && !switchingRef.current) {
      autoSwitchTriggeredRef.current = true;
      // Delay auto-switch to give users time to see what's happening
      const timer = setTimeout(() => {
        void handleSelectAgent(bestAgent);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [autoSwitch, isChecking, bestAgent, handleSelectAgent]);

  // Reset refs when conversation changes
  useEffect(() => {
    autoSwitchTriggeredRef.current = false;
    switchingRef.current = false;
  }, [conversationId]);

  // 是否有可用的 agent 且正在切换 / Has available agent and is switching
  const hasAvailableAndSwitching = !isChecking && availableCount > 0 && (switching || (autoSwitch && bestAgent));

  return (
    <div className='mb-12px'>
      {/* Main Card - 主卡片 */}
      <div className='relative rounded-12px p-16px bg-bg-2 border-1 border-solid border-border-2'>
        {/* Collapsed View - 收起状态：一行提示 + 展开按钮 */}
        {!expanded && !hasAvailableAndSwitching && (
          <div className='flex items-center justify-between cursor-pointer' onClick={() => setExpanded(true)}>
            <div className='flex items-center gap-8px'>
              <Loading theme='outline' size={16} className='animate-spin text-t-secondary' />
              <span className='text-13px text-t-primary'>{t('guid.scanning.initialMessage', { defaultValue: 'Current Agent is unavailable, detecting other available agents...' })}</span>
            </div>
            <Down theme='outline' size={16} className='text-t-tertiary hover:text-t-secondary transition-colors' />
          </div>
        )}

        {/* Expanded View - 展开状态 */}
        {(expanded || hasAvailableAndSwitching) && (
          <>
            {/* Header with collapse button - 带收起按钮的头部 */}
            {!hasAvailableAndSwitching && (
              <div className='flex items-center justify-between mb-12px'>
                <div className='flex items-center gap-8px'>
                  {isChecking ? (
                    <>
                      <Loading theme='outline' size={16} className='animate-spin text-t-secondary' />
                      <span className='text-13px text-t-primary'>{t('guid.scanning.scanningMessage', { defaultValue: 'Scanning local available agents...' })}</span>
                    </>
                  ) : (
                    <>
                      <Loading theme='outline' size={16} className='animate-spin text-t-secondary' />
                      <span className='text-13px text-t-primary'>{t('guid.scanning.initialMessage', { defaultValue: 'Current Agent is unavailable, detecting other available agents...' })}</span>
                    </>
                  )}
                </div>
                <button onClick={() => setExpanded(false)} className='p-4px rounded-4px hover:bg-fill-3 transition-colors cursor-pointer border-none bg-transparent'>
                  <Up theme='outline' size={16} className='text-t-tertiary' />
                </button>
              </div>
            )}

            {/* Success Message - 连接成功提示 */}
            {hasAvailableAndSwitching && (
              <div className='flex items-center gap-8px mb-12px'>
                <CheckOne theme='filled' size={16} className='text-success-6' />
                <span className='text-13px font-medium text-success-6'>{t('guid.scanning.connectingMessage', { defaultValue: 'Connected successfully, please wait...' })}</span>
              </div>
            )}

            {/* Agent Cards - Agent 卡片列表 */}
            {availableAgents.length > 0 && (
              <div className='overflow-x-auto pb-4px -mx-4px px-4px'>
                <div className='flex gap-10px' style={{ width: 'max-content' }}>
                  {availableAgents
                    .sort((a, b) => {
                      // Best match first, then available ones, then by checking status
                      const aIsBest = bestAgent?.backend === a.backend;
                      const bIsBest = bestAgent?.backend === b.backend;
                      if (aIsBest && !bIsBest) return -1;
                      if (!aIsBest && bIsBest) return 1;
                      if (a.available && !b.available) return -1;
                      if (!a.available && b.available) return 1;
                      if (a.checking && !b.checking) return -1;
                      if (!a.checking && b.checking) return 1;
                      return 0;
                    })
                    .map((result) => {
                      const isBest = bestAgent?.backend === result.backend;
                      const isSelected = hasAvailableAndSwitching && isBest;

                      // Determine card style based on status
                      let cardStyle = 'bg-fill-1 border-1 border-solid border-border-2';
                      if (isSelected) {
                        cardStyle = 'bg-success-1 border-2 border-solid border-success-6';
                      } else if (result.checking) {
                        cardStyle = 'bg-warning-1 border-1 border-solid border-warning-3';
                      } else if (result.available && !hasAvailableAndSwitching) {
                        cardStyle = 'bg-fill-1 border-1 border-solid border-border-2 cursor-pointer hover:border-primary-4 hover:bg-fill-2';
                      }

                      // Determine status display
                      let statusIcon: React.ReactNode;
                      let statusText: string;
                      let statusClass: string;

                      if (result.checking) {
                        statusIcon = <Loading theme='outline' size={12} className='animate-spin text-warning-6' />;
                        statusText = t('guid.scanning.statusTesting', { defaultValue: 'Testing latency...' });
                        statusClass = 'text-warning-6';
                      } else if (result.available) {
                        statusIcon = <CheckOne theme='filled' size={12} className='text-success-6' />;
                        statusText = result.latency ? `${result.latency}ms` : t('guid.scanning.statusAvailable', { defaultValue: 'Available' });
                        statusClass = 'text-success-6';
                      } else if (result.error) {
                        statusIcon = <CloseOne theme='filled' size={12} className='text-success-6' />;
                        statusText = t('guid.scanning.statusUnreachable', { defaultValue: 'Unreachable' });
                        statusClass = 'text-success-6';
                      } else {
                        statusIcon = null;
                        statusText = t('guid.scanning.statusQueued', { defaultValue: 'Queued' });
                        statusClass = 'text-success-6';
                      }

                      return (
                        <div key={result.backend} className={classNames('rounded-10px p-12px transition-all min-w-120px flex-shrink-0', cardStyle)} onClick={result.available && !hasAvailableAndSwitching ? () => handleSelectAgent(result) : undefined}>
                          <div className='flex flex-col items-center text-center'>
                            <div className='relative w-32px h-32px mb-6px'>
                              {AGENT_LOGOS[result.backend] ? <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-full h-full' /> : <div className='w-full h-full rounded-full bg-fill-2 flex items-center justify-center text-14px text-t-primary'>{result.name.charAt(0)}</div>}
                              {!result.available && !result.checking && <CloseOne theme='filled' size={14} className='absolute -top-2px -right-2px text-t-tertiary' />}
                            </div>
                            <div className='text-13px font-medium mb-2px text-t-primary'>{result.name}</div>
                            <div className={classNames('flex items-center gap-4px text-11px', statusClass)}>
                              {statusIcon}
                              <span>{statusText}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Connection Progress - 连接进度条 */}
            {hasAvailableAndSwitching && bestAgent && (
              <div className='mt-12px'>
                <Progress percent={switching ? 50 : 100} size='small' status='success' showText={false} />
                <div className='text-11px mt-4px text-center text-t-tertiary'>{t('guid.scanning.establishingConnection', { defaultValue: 'Establishing connection...' })}</div>
              </div>
            )}

            {/* No alternatives found */}
            {!isChecking && availableCount === 0 && availableAgents.length > 0 && (
              <div className='text-center py-12px'>
                <div className='text-24px mb-4px'>😔</div>
                <div className='text-13px font-medium mb-4px text-t-primary'>{t('agent.setup.noAlternatives', { defaultValue: 'No available agents found' })}</div>
                <div className='text-12px text-t-secondary'>{t('agent.setup.configureFirst', { defaultValue: 'Please configure an agent in Settings first.' })}</div>
                <Button type='outline' size='small' className='mt-8px' onClick={() => navigate('/settings')}>
                  {t('common.goToSettings', { defaultValue: 'Go to Settings' })}
                </Button>
              </div>
            )}

            {/* Retry button */}
            {!isChecking && !switching && onRetry && availableCount === 0 && (
              <div className='mt-12px flex justify-end'>
                <Button type='text' size='small' onClick={onRetry}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AgentSetupCard;
