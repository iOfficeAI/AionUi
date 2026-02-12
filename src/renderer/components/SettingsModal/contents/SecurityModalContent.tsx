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

type YoloSupportStatus = 'supported' | 'not-needed' | 'not-supported';

interface AgentItem {
  id: string;
  name: string;
  type: 'builtin' | 'acp';
  installed: boolean;
  yoloSupport: YoloSupportStatus;
  yoloSupportReason?: string;
}

// ==================== Constants ====================

// Built-in agents that are always shown (gemini is built-in, no CLI detection needed)
const BUILTIN_AGENTS: AgentItem[] = [{ id: 'gemini', name: 'Gemini CLI', type: 'builtin', installed: true, yoloSupport: 'supported' }];

// ACP backends to exclude from security settings UI
const EXCLUDED_ACP_BACKENDS: AcpBackendAll[] = ['gemini', 'custom'];

// Verified ACP backends that support yoloMode via session/set_mode
const YOLO_SUPPORTED_BACKENDS: AcpBackendAll[] = ['claude', 'qwen', 'goose', 'codex'];

// ACP backends without permission system (auto-approve by default, no config needed)
const YOLO_NOT_NEEDED_BACKENDS: AcpBackendAll[] = ['droid', 'kimi', 'openclaw-gateway'];

// ACP backends that do not support yoloMode (with specific reasons)
const YOLO_NOT_SUPPORTED_BACKENDS: Record<string, string> = {
  opencode: 'settings.yoloNotSupportedOpencode', // v1.1.39 does not support yolo mode
  auggie: 'settings.yoloNotSupportedAuggie', // Security-first design, no bypass option
  iflow: 'settings.yoloNotSupportedIflow', // Not verified, may require manual confirmation
};

// ACP backend IDs to display (excluding gemini, custom, openclaw-gateway)
const ACP_AGENT_IDS = (Object.keys(ACP_BACKENDS_ALL) as AcpBackendAll[]).filter((id) => !EXCLUDED_ACP_BACKENDS.includes(id));

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

      // Build agent list with yolo support status
      const agentList: AgentItem[] = [
        ...BUILTIN_AGENTS,
        ...ACP_AGENT_IDS.filter((id) => availableIds.has(id)).map((id) => {
          let yoloSupport: YoloSupportStatus = 'not-supported';
          let yoloSupportReason: string | undefined;

          if (YOLO_SUPPORTED_BACKENDS.includes(id)) {
            yoloSupport = 'supported';
          } else if (YOLO_NOT_NEEDED_BACKENDS.includes(id)) {
            yoloSupport = 'not-needed';
            yoloSupportReason = 'settings.yoloNotNeeded';
          } else if (id in YOLO_NOT_SUPPORTED_BACKENDS) {
            yoloSupport = 'not-supported';
            yoloSupportReason = YOLO_NOT_SUPPORTED_BACKENDS[id];
          } else {
            // Fallback for unclassified agents
            yoloSupport = 'not-supported';
            yoloSupportReason = 'settings.yoloNotSupportedUnknown';
          }

          return {
            id,
            name: ACP_BACKENDS_ALL[id]?.name || id,
            type: 'acp' as const,
            installed: true,
            yoloSupport,
            yoloSupportReason,
          };
        }),
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

      // Load ACP backend yoloModes (skip codex, it uses codex.config)
      for (const id of ACP_AGENT_IDS) {
        if (id === 'codex') continue;
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
              <Shield theme='outline' size='20' fill={iconColors.secondary} className='flex' />
              <span className='text-16px font-500 text-t-primary leading-20px'>{t('settings.autoApprove')}</span>
              <Tooltip content={t('settings.autoApproveDesc')}>
                <span className='inline-flex items-center cursor-help'>
                  <Help theme='outline' size='16' fill={iconColors.disabled} className='flex' />
                </span>
              </Tooltip>
            </div>

            {/* Description */}
            <p className='text-13px text-t-secondary mb-16px'>{t('settings.autoApproveDesc')}</p>

            {/* Agent List */}
            {loading ? (
              <div className='text-14px text-t-tertiary py-16px text-center'>{t('common.loading')}</div>
            ) : (
              <div>
                {/* Supported agents - can toggle yoloMode */}
                {(() => {
                  const supportedAgents = agents.filter((a) => a.yoloSupport === 'supported');
                  if (supportedAgents.length === 0) return null;
                  return (
                    <>
                      {supportedAgents.map((agent) => (
                        <div key={agent.id} className='flex items-center justify-between py-12px'>
                          <span className='text-14px text-t-primary'>{agent.name}</span>
                          <Switch size='small' checked={yoloModes[agent.id] ?? false} onChange={(checked) => handleYoloModeChange(agent.id, checked)} />
                        </div>
                      ))}
                    </>
                  );
                })()}

                {/* Auto-approve agents - no permission system */}
                {(() => {
                  const autoApproveAgents = agents.filter((a) => a.yoloSupport === 'not-needed');
                  if (autoApproveAgents.length === 0) return null;
                  const hasSupported = agents.some((a) => a.yoloSupport === 'supported');
                  return (
                    <>
                      {hasSupported && <Divider className='my-8px' />}
                      {autoApproveAgents.map((agent) => (
                        <div key={agent.id} className='flex items-center justify-between py-12px'>
                          <span className='text-14px text-t-tertiary'>{agent.name}</span>
                          <span className='text-12px text-t-tertiary'>{t('settings.yoloAlwaysOn')}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}

                {/* Unsupported agents - cannot toggle */}
                {(() => {
                  const unsupportedAgents = agents.filter((a) => a.yoloSupport === 'not-supported');
                  if (unsupportedAgents.length === 0) return null;
                  const hasPrevious = agents.some((a) => a.yoloSupport === 'supported' || a.yoloSupport === 'not-needed');
                  return (
                    <>
                      {hasPrevious && <Divider className='my-8px' />}
                      {unsupportedAgents.map((agent) => (
                        <div key={agent.id} className='flex items-center justify-between py-12px'>
                          <div className='flex flex-col gap-2px'>
                            <span className='text-14px text-t-tertiary'>{agent.name}</span>
                            {agent.yoloSupportReason && <span className='text-12px text-t-disabled'>{t(agent.yoloSupportReason)}</span>}
                          </div>
                          <Switch size='small' checked={false} disabled />
                        </div>
                      ))}
                    </>
                  );
                })()}

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
