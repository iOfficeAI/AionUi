/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getDefaultAcpConfigOptions, isReasoningEffortLevel } from '@/common/types/acpConfigOptions';
import { savePreferredAionrsEffort } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FALLBACK_EFFORT_LEVELS = ['low', 'medium', 'high'] as const;

const AionrsEffortSelector: React.FC<{
  conversationId?: string;
  effort?: string;
  supported?: boolean;
  levels?: string[];
  onEffortChange?: (effort: string) => void;
}> = ({ conversationId, effort, supported, levels, onEffortChange }) => {
  const { t } = useTranslation();
  const [selectedEffort, setSelectedEffort] = useState<string | undefined>(effort);
  const [isApplying, setIsApplying] = useState(false);

  const effortLevels = useMemo(() => {
    const defaultLevels =
      getDefaultAcpConfigOptions('aionrs')[0]?.options?.map((option) => option.value) || FALLBACK_EFFORT_LEVELS;
    const values: string[] = (levels && levels.length > 0 ? levels : defaultLevels).filter(isReasoningEffortLevel);
    return Array.from(new Set(values));
  }, [levels]);

  const fallbackEffort = effortLevels.includes('medium') ? 'medium' : effortLevels[0];
  const requestedEffort = selectedEffort || effort;
  const currentEffort = requestedEffort && effortLevels.includes(requestedEffort) ? requestedEffort : fallbackEffort;

  const handleSelect = useCallback(
    async (nextEffort: string) => {
      setSelectedEffort(nextEffort);
      onEffortChange?.(nextEffort);
      if (!conversationId) return;
      setIsApplying(true);
      try {
        const [result] = await Promise.all([
          ipcBridge.conversation.setConfig.invoke({
            conversation_id: conversationId,
            config: { effort: nextEffort },
          }),
          savePreferredAionrsEffort(nextEffort),
        ]);
        if (!result.success) {
          console.error('[AionrsEffortSelector] Failed to set effort:', result.msg);
          setSelectedEffort(effort || effortLevels[0]);
          onEffortChange?.(effort || effortLevels[0]);
        }
      } catch (error) {
        console.error('[AionrsEffortSelector] Failed to set effort:', error);
        setSelectedEffort(effort || effortLevels[0]);
        onEffortChange?.(effort || effortLevels[0]);
      } finally {
        setIsApplying(false);
      }
    },
    [conversationId, effort, effortLevels, onEffortChange]
  );

  if (supported === false || effortLevels.length <= 1) return null;

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          <Menu.ItemGroup title={t('acp.config.reasoning_effort')}>
            {effortLevels.map((level) => (
              <Menu.Item
                key={level}
                className={level === currentEffort ? 'bg-2!' : ''}
                onClick={() => void handleSelect(level)}
              >
                <div className='flex items-center gap-8px'>
                  {level === currentEffort && <span className='text-primary'>✓</span>}
                  <span className={level !== currentEffort ? 'ml-16px' : ''}>{level}</span>
                </div>
              </Menu.Item>
            ))}
          </Menu.ItemGroup>
        </Menu>
      }
    >
      <Button className='sendbox-model-btn agent-mode-compact-pill' shape='round' size='small' loading={isApplying}>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
          <span className='min-w-0 truncate'>
            {t('acp.config.reasoning_effort')}: {currentEffort}
          </span>
          <Down size={12} className='text-t-tertiary shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AionrsEffortSelector;
