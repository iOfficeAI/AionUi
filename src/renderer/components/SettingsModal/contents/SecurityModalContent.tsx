/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpConversation } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/theme/colors';
import { ACP_BACKENDS_ALL, type AcpBackend, type AcpBackendAll } from '@/types/acpTypes';
import { Divider, Switch, Tooltip } from '@arco-design/web-react';
import { Help, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ==================== Types ====================

interface AgentItem {
  id: string;
  name: string;
  type: 'builtin' | 'acp';
  installed: boolean;
}

// ==================== Constants ====================

// Built-in agents that are always shown
const BUILTIN_AGENTS: AgentItem[] = [
  { id: 'gemini', name: 'Gemini CLI', type: 'builtin', installed: true },
  { id: 'codex', name: 'Codex', type: 'builtin', installed: true },
];

// ACP backend IDs to display (excluding gemini, codex, and custom)
const ACP_AGENT_IDS: AcpBackendAll[] = ['claude', 'qwen', 'goose', 'auggie', 'kimi', 'opencode', 'droid', 'copilot', 'qoder', 'iflow'];

// ==================== Component ====================

/**
 * Security settings content component
 * Manages execution authorization (yoloMode) settings for all AI agents
 */
const SecurityModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [yoloModes, setYoloModes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  /**
   * Load available agents and their yoloMode configurations
   */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load available ACP agents
      const response = await acpConversation.getAvailableAgents.invoke();
      const availableIds = new Set(response.success && response.data ? response.data.map((a) => a.backend) : []);

      // Build agent list
      const agentList: AgentItem[] = [
        ...BUILTIN_AGENTS,
        ...ACP_AGENT_IDS.filter((id) => availableIds.has(id)).map((id) => ({
          id,
          name: ACP_BACKENDS_ALL[id]?.name || id,
          type: 'acp' as const,
          installed: true,
        })),
      ];
      setAgents(agentList);

      // Load yoloMode configs
      const geminiConfig = await ConfigStorage.get('gemini.config');
      const codexConfig = await ConfigStorage.get('codex.config');
      const acpConfig = await ConfigStorage.get('acp.config');

      const modes: Record<string, boolean> = {
        gemini: (geminiConfig as { yoloMode?: boolean })?.yoloMode ?? false,
        codex: (codexConfig as { yoloMode?: boolean })?.yoloMode ?? false,
      };

      // Load ACP backend yoloModes
      for (const id of ACP_AGENT_IDS) {
        const backendConfig = (acpConfig as Record<string, { yoloMode?: boolean }> | undefined)?.[id];
        modes[id] = backendConfig?.yoloMode ?? false;
      }

      setYoloModes(modes);
    } catch (error) {
      console.error('[SecurityModalContent] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /**
   * Handle yoloMode toggle change
   */
  const handleYoloModeChange = useCallback(async (agentId: string, enabled: boolean) => {
    try {
      // Optimistic update
      setYoloModes((prev) => ({ ...prev, [agentId]: enabled }));

      if (agentId === 'gemini') {
        const config = await ConfigStorage.get('gemini.config');
        // Create default config if not exists
        const baseConfig = config || { authType: '', proxy: '' };
        const newConfig = { ...baseConfig, yoloMode: enabled };
        await ConfigStorage.set('gemini.config', newConfig);
      } else if (agentId === 'codex') {
        const config = await ConfigStorage.get('codex.config');
        const newConfig = { ...config, yoloMode: enabled };
        await ConfigStorage.set('codex.config', newConfig);
      } else {
        // ACP backends
        const acpConfig = (await ConfigStorage.get('acp.config')) || {};
        const backendId = agentId as AcpBackend;
        await ConfigStorage.set('acp.config', {
          ...acpConfig,
          [backendId]: { ...(acpConfig[backendId] || {}), yoloMode: enabled },
        });
      }
    } catch (error) {
      console.error(`[SecurityModalContent] Failed to update yoloMode for ${agentId}:`, error);
      // Rollback on error
      setYoloModes((prev) => ({ ...prev, [agentId]: !enabled }));
    }
  }, []);

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea>
        <div className='space-y-16px'>
          {/* Auto-Approve Section */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px border border-border-2'>
            {/* Section Header */}
            <div className='flex items-center gap-8px mb-16px'>
              <Shield theme='outline' size='20' fill={iconColors.secondary} />
              <span className='text-16px font-500 text-t-primary'>{t('settings.autoApprove')}</span>
              <Tooltip content={t('settings.autoApproveDesc')}>
                <span className='inline-flex cursor-help'>
                  <Help theme='outline' size='16' fill={iconColors.disabled} />
                </span>
              </Tooltip>
            </div>

            {/* Description */}
            <p className='text-13px text-t-secondary mb-16px'>{t('settings.autoApproveDesc')}</p>

            {/* Agent List */}
            {loading ? (
              <div className='text-14px text-t-tertiary py-16px text-center'>{t('common.loading')}</div>
            ) : (
              <div className='space-y-0'>
                {agents.map((agent, index) => (
                  <React.Fragment key={agent.id}>
                    <div className='flex items-center justify-between py-12px'>
                      <span className='text-14px text-t-primary'>{agent.name}</span>
                      <Switch size='small' checked={yoloModes[agent.id] ?? false} onChange={(checked) => handleYoloModeChange(agent.id, checked)} />
                    </div>
                    {index < agents.length - 1 && <Divider className='my-0' />}
                  </React.Fragment>
                ))}

                {agents.length === 0 && <div className='text-14px text-t-tertiary py-16px text-center'>{t('settings.noAgentsFound')}</div>}
              </div>
            )}
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SecurityModalContent;
