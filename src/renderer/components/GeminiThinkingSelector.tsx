/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Thinking level options for Gemini models.
 * Maps to thinkingBudget token counts in GeminiAgent.
 */
const THINKING_LEVELS = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

interface GeminiThinkingSelectorProps {
  conversationId: string;
}

/**
 * Thinking level selector for Gemini conversations.
 * Uses the same pill-button dropdown style as AgentModeSelector compact mode.
 *
 * Gemini 对话的思考深度选择器。
 * 使用与 AgentModeSelector compact 模式相同的 pill 按钮下拉样式。
 */
const GeminiThinkingSelector: React.FC<GeminiThinkingSelectorProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const [currentLevel, setCurrentLevel] = useState<string>('medium');
  const [loading, setLoading] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  // Fetch current thinking level on mount / conversation change
  useEffect(() => {
    void ipcBridge.geminiConversation.getThinkingLevel.invoke({ conversationId }).then((res) => {
      if (res?.success && res.data?.level) {
        setCurrentLevel(res.data.level);
      }
    });
  }, [conversationId]);

  const handleSelect = useCallback(
    async (level: string) => {
      setDropdownVisible(false);
      if (level === currentLevel) return;
      setLoading(true);
      try {
        const result = await ipcBridge.geminiConversation.setThinkingLevel.invoke({
          conversationId,
          level,
        });
        if (result?.success && result.data?.level) {
          setCurrentLevel(result.data.level);
        }
      } finally {
        setLoading(false);
      }
    },
    [conversationId, currentLevel]
  );

  const currentOption = THINKING_LEVELS.find((l) => l.value === currentLevel) || THINKING_LEVELS[2];

  const menu = (
    <Menu onClickMenuItem={(key) => void handleSelect(key)}>
      <Menu.ItemGroup title={t('agentMode.thinkingLevel', { defaultValue: 'Thinking Level' })}>
        {THINKING_LEVELS.map((level) => (
          <Menu.Item key={level.value} className={currentLevel === level.value ? '!bg-2' : ''}>
            <div className='flex items-center gap-8px'>
              {currentLevel === level.value && <span className='text-primary'>✓</span>}
              <span className={currentLevel !== level.value ? 'ml-16px' : ''}>{level.label}</span>
            </div>
          </Menu.Item>
        ))}
      </Menu.ItemGroup>
    </Menu>
  );

  return (
    <Dropdown trigger='click' popupVisible={dropdownVisible} onVisibleChange={(visible) => !loading && setDropdownVisible(visible)} droplist={menu}>
      <Button
        className='sendbox-model-btn agent-mode-compact-pill'
        shape='round'
        size='small'
        onClick={() => !loading && setDropdownVisible((v) => !v)}
        style={{
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          <span className='block truncate leading-none'>{currentOption.label}</span>
          <Down size={12} className='text-t-tertiary shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default GeminiThinkingSelector;
