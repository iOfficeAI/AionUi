/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AgentSetupCard - A card component displayed above the SendBox when the current
 * agent is not configured (no auth/API key). It guides new users to set up their
 * agent or switch to an available alternative.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Message, Progress } from '@arco-design/web-react';
import { CheckOne, CloseOne, Loading, Close } from '@icon-park/react';
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
};

const AgentSetupCard: React.FC<AgentSetupCardProps> = ({ conversationId, currentAgent, error, isChecking, progress, availableAgents, bestAgent, onDismiss, onRetry }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  const currentAgentName = currentAgent ? AGENT_NAMES[currentAgent] || currentAgent : 'Agent';
  const currentAgentLogo = currentAgent ? AGENT_LOGOS[currentAgent] : undefined;

  const handleSelectAgent = useCallback(
    async (agent: AgentCheckResult) => {
      if (switching) return;
      setSwitching(true);

      try {
        // Get current conversation info
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
        if (!conversation) {
          Message.error(t('conversation.chat.switchAgentFailed', { defaultValue: 'Failed to switch agent' }));
          setSwitching(false);
          return;
        }

        // Determine conversation type based on agent
        const isGemini = agent.backend === 'gemini';
        const conversationType = isGemini ? 'gemini' : 'acp';

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
          setSwitching(false);
          return;
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
        setSwitching(false);
      }
    },
    [conversationId, navigate, switching, t]
  );

  const availableCount = availableAgents.filter((a) => a.available).length;

  return (
    <div className='relative border-1 border-solid border-warning-3 rounded-12px p-16px bg-warning-1 mb-12px'>
      {/* Dismiss button */}
      {onDismiss && (
        <button onClick={onDismiss} className='absolute top-12px right-12px p-4px rounded-4px hover:bg-warning-2 transition-colors cursor-pointer border-none bg-transparent' aria-label={t('common.close', { defaultValue: 'Close' })}>
          <Close theme='outline' size={14} className='text-t-secondary' />
        </button>
      )}

      {/* Header */}
      <div className='flex items-center gap-10px mb-12px'>
        {currentAgentLogo && <img src={currentAgentLogo} alt={currentAgentName} className='w-24px h-24px' />}
        <div className='flex-1'>
          <div className='text-14px font-medium text-t-primary'>
            {t('agent.setup.notConfigured', {
              defaultValue: '{{agent}} is not configured',
              agent: currentAgentName,
            })}
          </div>
          <div className='text-12px text-t-secondary mt-2px'>{error || t('agent.setup.authRequired', { defaultValue: 'Authentication or API key is required to use this agent.' })}</div>
        </div>
      </div>

      {/* Checking Phase */}
      {isChecking && (
        <div className='mt-12px'>
          <div className='flex items-center gap-6px mb-8px'>
            <Loading theme='outline' size={14} className='animate-spin text-primary' />
            <span className='text-12px text-t-secondary'>{t('agent.setup.findingAlternatives', { defaultValue: 'Finding available alternatives...' })}</span>
          </div>

          {/* Check results list */}
          <div className='max-h-100px overflow-y-auto mb-8px space-y-4px'>
            {availableAgents.map((result) => (
              <div key={result.backend} className='flex items-center gap-6px text-12px'>
                {result.checking ? <Loading theme='outline' size={12} className='animate-spin text-t-tertiary' /> : result.available ? <CheckOne theme='filled' size={12} fill='var(--color-success-6)' /> : <CloseOne theme='filled' size={12} fill='var(--color-danger-6)' />}
                <span className='text-t-secondary'>{t('agent.setup.checkingAgent', { defaultValue: 'Checking {{agent}}...', agent: result.name })}</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <Progress percent={progress} size='small' status={progress === 100 ? 'success' : 'normal'} />
        </div>
      )}

      {/* Results Phase - Available Agents */}
      {!isChecking && availableCount > 0 && (
        <div className='mt-12px'>
          <div className='flex items-center gap-6px mb-10px'>
            <span className='text-16px'>⚡</span>
            <span className='text-13px font-medium text-t-primary'>
              {t('agent.setup.alternativesFound', {
                defaultValue: '{{count}} available alternatives found',
                count: availableCount,
              })}
            </span>
          </div>

          {/* Available agents list */}
          <div className='max-h-140px overflow-y-auto space-y-8px'>
            {availableAgents
              .filter((r) => r.available)
              .sort((a, b) => {
                // Sort by latency (lowest first)
                if (!a.latency) return 1;
                if (!b.latency) return -1;
                return a.latency - b.latency;
              })
              .map((result) => {
                const isBest = bestAgent?.backend === result.backend;
                return (
                  <div key={result.backend} className={classNames('rounded-8px p-10px cursor-pointer transition-colors', isBest ? 'bg-primary-1 border-1 border-solid border-primary-3 hover:bg-primary-2' : 'bg-white border-1 border-solid border-border-2 hover:bg-fill-2')} onClick={() => handleSelectAgent(result)}>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-8px'>
                        {AGENT_LOGOS[result.backend] && <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-20px h-20px' />}
                        <div>
                          <div className='text-13px font-medium text-t-primary'>{result.name}</div>
                          <div className='flex items-center gap-6px text-11px'>
                            <span className='flex items-center gap-3px text-success'>
                              <span className='w-5px h-5px rounded-full bg-success' />
                              {t('agent.health.available', { defaultValue: 'Available' })}
                            </span>
                            {result.latency && (
                              <>
                                <span className='text-t-tertiary'>·</span>
                                <span className='text-t-secondary'>{result.latency}ms</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {isBest && <span className='px-8px py-2px bg-primary text-white text-11px font-medium rounded-full'>{t('agent.health.bestMatch', { defaultValue: 'Best Match' })}</span>}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Loading overlay during switch */}
          {switching && (
            <div className='mt-8px flex items-center gap-6px text-12px text-t-secondary'>
              <Loading theme='outline' size={12} className='animate-spin' />
              <span>{t('agent.setup.switching', { defaultValue: 'Switching agent...' })}</span>
            </div>
          )}
        </div>
      )}

      {/* No alternatives found */}
      {!isChecking && availableCount === 0 && availableAgents.length > 0 && (
        <div className='mt-12px text-center py-12px'>
          <div className='text-24px mb-4px'>😔</div>
          <div className='text-13px font-medium text-t-primary mb-4px'>{t('agent.setup.noAlternatives', { defaultValue: 'No available agents found' })}</div>
          <div className='text-12px text-t-secondary'>{t('agent.setup.configureFirst', { defaultValue: 'Please configure an agent in Settings first.' })}</div>
          <Button type='outline' size='small' className='mt-8px' onClick={() => navigate('/settings')}>
            {t('common.goToSettings', { defaultValue: 'Go to Settings' })}
          </Button>
        </div>
      )}

      {/* Retry button */}
      {!isChecking && onRetry && (
        <div className='mt-12px flex justify-end'>
          <Button type='text' size='small' onClick={onRetry}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AgentSetupCard;
