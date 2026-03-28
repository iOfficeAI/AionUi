/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import type { AcpBackendConfig, AvailableAgent, EffectiveAgentInfo } from '../types';
import { Down, Plus, Robot } from '@icon-park/react';
import React, { useState } from 'react';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type AssistantSelectionAreaProps = {
  isPresetAgent: boolean;
  selectedAgentInfo: AvailableAgent | undefined;
  customAgents: AcpBackendConfig[];
  localeKey: string;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  onSelectAssistant: (assistantId: string) => void;
  onSetInput: (text: string) => void;
  onFocusInput: () => void;
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  isPresetAgent,
  selectedAgentInfo,
  customAgents,
  localeKey,
  currentEffectiveAgentInfo,
  onSelectAssistant,
  onSetInput,
  onFocusInput,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Only render if there are preset agents
  if (!customAgents || !customAgents.some((a) => a.isPreset)) return null;

  if (isPresetAgent && selectedAgentInfo) {
    // Selected Assistant View
    return (
      <div className='mt-16px w-full'>
        <div className='flex flex-col w-full animate-fade-in'>
          {/* Main Agent Fallback Notice */}
          {currentEffectiveAgentInfo.isFallback && (
            <div
              className='mb-12px px-12px py-8px rd-8px text-12px flex items-center gap-8px'
              style={{
                background: 'rgb(var(--warning-1))',
                border: '1px solid rgb(var(--warning-3))',
                color: 'rgb(var(--warning-6))',
              }}
            >
              <span>
                {t('guid.agentFallbackNotice', {
                  original:
                    currentEffectiveAgentInfo.originalType.charAt(0).toUpperCase() +
                    currentEffectiveAgentInfo.originalType.slice(1),
                  fallback:
                    currentEffectiveAgentInfo.agentType.charAt(0).toUpperCase() +
                    currentEffectiveAgentInfo.agentType.slice(1),
                  defaultValue: `${currentEffectiveAgentInfo.originalType.charAt(0).toUpperCase() + currentEffectiveAgentInfo.originalType.slice(1)} is unavailable, using ${currentEffectiveAgentInfo.agentType.charAt(0).toUpperCase() + currentEffectiveAgentInfo.agentType.slice(1)} instead.`,
                })}
              </span>
            </div>
          )}
          <div className='w-full'>
            <div
              className='flex items-center justify-between py-8px cursor-pointer select-none'
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            >
              <span className='text-13px text-[rgb(var(--primary-6))] opacity-80'>
                {t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}
              </span>
              <Down
                theme='outline'
                size={14}
                fill='rgb(var(--primary-6))'
                className={`transition-transform duration-300 ${isDescriptionExpanded ? 'rotate-180' : ''}`}
              />
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ${isDescriptionExpanded ? 'max-h-240px mt-4px opacity-100' : 'max-h-0 opacity-0'}`}
            >
              <div
                className='p-12px rd-14px text-13px text-3 text-t-secondary whitespace-pre-wrap leading-relaxed '
                style={{
                  border: '1px solid var(--color-border-2)',
                  background: 'var(--color-fill-1)',
                }}
              >
                {customAgents.find((a) => a.id === selectedAgentInfo.customAgentId)?.descriptionI18n?.[localeKey] ||
                  customAgents.find((a) => a.id === selectedAgentInfo.customAgentId)?.description ||
                  t('settings.assistantDescriptionPlaceholder', { defaultValue: 'No description' })}
              </div>
            </div>
          </div>

          {/* Prompts Section */}
          {(() => {
            const agent = customAgents.find((a) => a.id === selectedAgentInfo.customAgentId);
            const prompts = agent?.promptsI18n?.[localeKey] || agent?.promptsI18n?.['en-US'] || agent?.prompts;
            if (prompts && prompts.length > 0) {
              return (
                <div className='flex flex-wrap gap-8px mt-16px'>
                  {prompts.map((prompt: string, index: number) => (
                    <div
                      key={index}
                      className='px-12px py-6px bg-fill-2 hover:bg-fill-3 text-[rgb(var(--primary-6))] text-13px rd-16px cursor-pointer transition-colors shadow-sm'
                      onClick={() => {
                        onSetInput(prompt);
                        onFocusInput();
                      }}
                    >
                      {prompt}
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    );
  }

  // Assistant List View
  return (
    <div className='mt-16px w-full'>
      <div className='flex flex-wrap gap-8px justify-center'>
        {customAgents
          .filter((a) => a.isPreset && a.enabled !== false)
          .toSorted((a, b) => {
            if (a.id === 'cowork') return -1;
            if (b.id === 'cowork') return 1;
            return 0;
          })
          .map((assistant) => {
            const avatarValue = assistant.avatar?.trim();
            const mappedAvatar = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
            const resolvedAvatar = avatarValue ? resolveExtensionAssetUrl(avatarValue) : undefined;
            const avatarImage = mappedAvatar || resolvedAvatar;
            const isImageAvatar = Boolean(
              avatarImage &&
              (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) ||
                /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(avatarImage))
            );
            return (
              <div
                key={assistant.id}
                className='h-28px group flex items-center gap-8px px-16px rd-100px cursor-pointer transition-all b-1 b-solid bg-fill-0 hover:bg-fill-1 select-none'
                style={{
                  borderWidth: '1px',
                  borderColor: 'color-mix(in srgb, var(--color-border-2) 70%, transparent)',
                }}
                onClick={() => onSelectAssistant(`custom:${assistant.id}`)}
              >
                {isImageAvatar ? (
                  <img src={avatarImage} alt='' width={16} height={16} style={{ objectFit: 'contain' }} />
                ) : avatarValue ? (
                  <span style={{ fontSize: 16, lineHeight: '18px' }}>{avatarValue}</span>
                ) : (
                  <Robot theme='outline' size={16} />
                )}
                <span className='text-14px text-2 hover:text-1'>
                  {assistant.nameI18n?.[localeKey] || assistant.name}
                </span>
              </div>
            );
          })}
        <div
          className='flex items-center justify-center h-28px w-28px rd-50% bg-fill-0 hover:bg-fill-2 cursor-pointer b-1 b-dashed select-none transition-colors'
          style={{ borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--color-border-2) 70%, transparent)' }}
          onClick={() => navigate('/settings/assistants')}
        >
          <Plus theme='outline' size={14} className='line-height-0 text-[var(--color-text-3)]' />
        </div>
      </div>
    </div>
  );
};

export default AssistantSelectionArea;
