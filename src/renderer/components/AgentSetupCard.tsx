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
import { CheckOne, CloseOne, Loading, Close, Down } from '@icon-park/react';
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

const AgentSetupCard: React.FC<AgentSetupCardProps> = ({ conversationId, currentAgent, error, isChecking, progress: _progress, availableAgents, bestAgent, onDismiss, onRetry, autoSwitch = true, initialMessage }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const switchingRef = React.useRef(false); // Use ref to avoid stale closure in auto-switch
  const autoSwitchTriggeredRef = React.useRef(false);
  const [errorExpanded, setErrorExpanded] = useState(false); // 错误信息默认收起 / Error collapsed by default

  const _currentAgentName = currentAgent ? AGENT_NAMES[currentAgent] || currentAgent : 'Agent';
  const _currentAgentLogo = currentAgent ? AGENT_LOGOS[currentAgent] : undefined;

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
      {/* Collapsible Error Header - 可折叠的错误信息 */}
      {error && (
        <div className='border-1 border-solid border-danger-3 rounded-12px bg-danger-1 mb-12px overflow-hidden'>
          <div className='flex items-center justify-between p-12px cursor-pointer select-none' onClick={() => setErrorExpanded(!errorExpanded)}>
            <div className='flex items-center gap-8px'>
              <CloseOne theme='filled' size={16} fill='var(--color-danger-6)' />
              <span className='text-13px font-medium text-danger-6'>{t('agent.setup.connectionError', { defaultValue: 'Connection Error' })}</span>
            </div>
            <Down theme='outline' size={14} className={classNames('text-t-secondary transition-transform duration-200', errorExpanded && 'rotate-180')} />
          </div>
          {errorExpanded && (
            <div className='px-12px pb-12px'>
              <div className='text-12px text-t-secondary'>{error}</div>
            </div>
          )}
        </div>
      )}

      {/* Scanning / Connecting Card - 扫描/连接卡片 */}
      <div className={classNames('relative border-1 border-solid rounded-12px p-16px', hasAvailableAndSwitching ? 'border-success-3 bg-success-1' : 'border-primary-3 bg-primary-1')}>
        {/* Dismiss button */}
        {onDismiss && !isChecking && !switching && (
          <button onClick={onDismiss} className='absolute top-12px right-12px p-4px rounded-4px hover:bg-fill-2 transition-colors cursor-pointer border-none bg-transparent' aria-label={t('common.close', { defaultValue: 'Close' })}>
            <Close theme='outline' size={14} className='text-t-secondary' />
          </button>
        )}

        {/* Success Message - 连接成功提示 */}
        {hasAvailableAndSwitching && (
          <div className='flex items-center gap-8px mb-12px'>
            <CheckOne theme='filled' size={16} fill='var(--color-success-6)' />
            <span className='text-13px font-medium text-success-6'>{t('guid.scanning.connectingMessage', { defaultValue: 'Connected successfully, please wait...' })}</span>
          </div>
        )}

        {/* Scanning Header - 扫描中提示 */}
        {isChecking && (
          <div className='flex items-center gap-8px mb-12px'>
            <Loading theme='outline' size={16} className='animate-spin text-primary' />
            <span className='text-13px text-t-secondary'>{t('guid.scanning.scanningMessage', { defaultValue: 'Scanning local available agents...' })}</span>
          </div>
        )}

        {/* Initial Message - 初始检测提示 */}
        {!isChecking && !hasAvailableAndSwitching && availableAgents.length === 0 && (
          <div className='flex items-center gap-8px mb-12px'>
            <Loading theme='outline' size={16} className='animate-spin text-primary' />
            <span className='text-13px text-t-secondary'>{t('guid.scanning.initialMessage', { defaultValue: 'Current Agent is unavailable, detecting other available agents...' })}</span>
          </div>
        )}

        {/* Agent Cards - Agent 卡片列表 */}
        {(isChecking || hasAvailableAndSwitching) && availableAgents.length > 0 && (
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

                  // Determine status display
                  let statusIcon: React.ReactNode;
                  let statusText: string;
                  let statusColor: string;

                  if (result.checking) {
                    statusIcon = <Loading theme='outline' size={12} className='animate-spin' style={{ color: 'var(--color-warning-6)' }} />;
                    statusText = t('guid.scanning.statusTesting', { defaultValue: 'Testing latency...' });
                    statusColor = 'var(--color-warning-6)';
                  } else if (result.available) {
                    statusIcon = <CheckOne theme='filled' size={12} fill='var(--color-success-6)' />;
                    statusText = result.latency ? `${result.latency}ms` : t('guid.scanning.statusAvailable', { defaultValue: 'Available' });
                    statusColor = 'var(--color-success-6)';
                  } else if (result.error) {
                    statusIcon = <CloseOne theme='filled' size={12} fill='var(--color-danger-6)' />;
                    statusText = t('guid.scanning.statusUnreachable', { defaultValue: 'Unreachable' });
                    statusColor = 'var(--color-danger-6)';
                  } else {
                    statusIcon = null;
                    statusText = t('guid.scanning.statusQueued', { defaultValue: 'Queued' });
                    statusColor = 'var(--color-text-3)';
                  }

                  return (
                    <div key={result.backend} className={classNames('rounded-10px p-12px transition-all min-w-120px flex-shrink-0', isSelected ? 'bg-success-1 border-2 border-solid border-success shadow-sm' : result.available && !hasAvailableAndSwitching ? 'bg-white border-1 border-solid border-border-2 cursor-pointer hover:border-primary-3 hover:bg-fill-1' : 'bg-white border-1 border-solid border-border-2')} onClick={result.available && !hasAvailableAndSwitching ? () => handleSelectAgent(result) : undefined}>
                      <div className='flex flex-col items-center text-center'>
                        <div className='relative w-32px h-32px mb-6px'>
                          {AGENT_LOGOS[result.backend] ? <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-full h-full' /> : <div className='w-full h-full rounded-full bg-fill-2 flex items-center justify-center text-14px'>{result.name.charAt(0)}</div>}
                          {!result.available && !result.checking && <CloseOne theme='filled' size={14} fill='var(--color-danger-6)' className='absolute -top-2px -right-2px' />}
                        </div>
                        <div className='text-13px font-medium text-t-primary mb-2px'>{result.name}</div>
                        <div className='flex items-center gap-4px text-11px' style={{ color: statusColor }}>
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
            <div className='text-11px text-t-tertiary mt-4px text-center'>{t('guid.scanning.establishingConnection', { defaultValue: 'Establishing connection...' })}</div>
          </div>
        )}

        {/* No alternatives found */}
        {!isChecking && availableCount === 0 && availableAgents.length > 0 && (
          <div className='text-center py-12px'>
            <div className='text-24px mb-4px'>😔</div>
            <div className='text-13px font-medium text-t-primary mb-4px'>{t('agent.setup.noAlternatives', { defaultValue: 'No available agents found' })}</div>
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
      </div>
    </div>
  );
};

export default AgentSetupCard;
