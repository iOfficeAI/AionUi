/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpBackendAll } from '@/types/acpTypes';
import { Modal, Progress, Button } from '@arco-design/web-react';
import { CheckOne, CloseOne, Loading } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

interface AgentCheckResult {
  backend: AcpBackendAll;
  name: string;
  available: boolean;
  latency?: number; // ms
  error?: string;
  checking: boolean;
}

interface AgentHealthCheckModalProps {
  visible: boolean;
  currentAgent: AcpBackendAll | 'gemini';
  errorMessage: string;
  excludedAgents: AcpBackendAll[];
  onClose: () => void;
  onSelectAgent: (agent: AcpBackendAll) => void;
}

const AgentHealthCheckModal: React.FC<AgentHealthCheckModalProps> = ({ visible, currentAgent, errorMessage, excludedAgents, onClose, onSelectAgent }) => {
  const { t } = useTranslation();
  const [checkResults, setCheckResults] = useState<AgentCheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bestAgent, setBestAgent] = useState<AgentCheckResult | null>(null);

  // Start health check when modal opens
  useEffect(() => {
    if (visible) {
      void startHealthCheck();
    }
  }, [visible]);

  const startHealthCheck = useCallback(async () => {
    setChecking(true);
    setProgress(0);
    setCheckResults([]);
    setBestAgent(null);

    try {
      // Get available agents
      const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
      if (!result.success || !result.data) {
        return;
      }

      // Filter agents: exclude failed ones and current one
      const agentsToCheck = result.data
        .filter((agent) => agent.backend !== 'custom' && !excludedAgents.includes(agent.backend) && agent.backend !== currentAgent && AGENT_LOGOS[agent.backend])
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

      // Check each agent
      const total = agentsToCheck.length;
      let completed = 0;
      const results: AgentCheckResult[] = [];

      for (const agent of agentsToCheck) {
        const startTime = Date.now();

        try {
          // Check agent health
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

      // Find best agent (available + lowest latency)
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
  }, [excludedAgents, currentAgent]);

  const handleSelectAgent = useCallback(
    (agent: AgentCheckResult) => {
      if (agent.available) {
        onSelectAgent(agent.backend);
      }
    },
    [onSelectAgent]
  );

  const getLatencyLabel = (latency?: number): string => {
    if (!latency) return '';
    if (latency < 1000) return t('agent.health.lowLatency', { defaultValue: 'Low Latency' });
    if (latency < 3000) return t('agent.health.mediumLatency', { defaultValue: 'Medium Latency' });
    return t('agent.health.highLatency', { defaultValue: 'High Latency' });
  };

  const currentAgentName = AGENT_NAMES[currentAgent as AcpBackendAll] || currentAgent;

  return (
    <Modal visible={visible} onCancel={onClose} footer={null} closable={!checking} maskClosable={!checking} className='w-[90vw] md:w-[560px]' wrapStyle={{ zIndex: 10000 }} maskStyle={{ zIndex: 9999 }}>
      {/* Header */}
      <div className='mb-24px'>
        <div className='flex items-center gap-8px mb-8px'>
          <span className='text-24px'>⚠️</span>
          <h3 className='text-18px font-semibold m-0'>{t('agent.health.detectedError', { defaultValue: '检测到当前 Agent ({{agent}}) 响应异常', agent: currentAgentName })}</h3>
        </div>
        <p className='text-14px text-t-secondary m-0'>
          {errorMessage}
          {t('agent.health.autoSwitching', { defaultValue: '。系统将自动尝试切换线路。' })}
        </p>
      </div>

      {/* Checking Phase */}
      {checking && (
        <div className='mb-24px'>
          <div className='flex items-center gap-8px mb-12px'>
            <Loading theme='outline' size={16} className='animate-spin' />
            <span className='text-14px text-t-secondary'>{t('agent.health.evaluating', { defaultValue: '正在评估网络延迟与模型可用性...' })}</span>
          </div>

          {/* Check results list */}
          <div className='space-y-8px mb-16px'>
            {checkResults.map((result) => (
              <div key={result.backend} className='flex items-center gap-8px text-13px'>
                {result.checking ? <Loading theme='outline' size={14} className='animate-spin text-t-tertiary' /> : result.available ? <CheckOne theme='filled' size={14} fill='var(--color-success-6)' /> : <CloseOne theme='filled' size={14} fill='var(--color-danger-6)' />}
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
          <div className='flex items-center gap-8px mb-16px'>
            <span className='text-20px'>⚡</span>
            <h4 className='text-16px font-semibold m-0'>{t('agent.health.foundBest', { defaultValue: '已找到最佳替代方案' })}</h4>
          </div>

          <div className='text-13px text-t-secondary mb-12px'>{t('agent.health.recommendSwitch', { defaultValue: '推荐切换' })}</div>

          {/* Best agent card */}
          <div className='bg-primary-1 border-2 border-primary-3 rounded-lg p-16px mb-12px cursor-pointer hover:bg-primary-2 transition-colors' onClick={() => handleSelectAgent(bestAgent)}>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-12px'>
                {AGENT_LOGOS[bestAgent.backend] && <img src={AGENT_LOGOS[bestAgent.backend]} alt={bestAgent.name} className='w-24px h-24px' />}
                <div>
                  <div className='text-15px font-medium text-t-primary mb-4px'>{bestAgent.name}</div>
                  <div className='flex items-center gap-8px'>
                    <span className='flex items-center gap-4px text-13px text-success'>
                      <span className='w-6px h-6px rounded-full bg-success'></span>
                      {t('agent.health.available', { defaultValue: 'Available' })}
                    </span>
                    {bestAgent.latency && (
                      <>
                        <span className='text-t-tertiary'>·</span>
                        <span className='text-13px text-t-secondary'>{getLatencyLabel(bestAgent.latency)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className='px-12px py-4px bg-primary text-white text-12px font-medium rounded-full'>{t('agent.health.bestMatch', { defaultValue: 'Best Match' })}</span>
            </div>
          </div>

          {/* Other available agents */}
          {checkResults
            .filter((r) => r.available && r.backend !== bestAgent.backend)
            .map((result) => (
              <div key={result.backend} className='bg-fill-2 rounded-lg p-12px mb-8px cursor-pointer hover:bg-fill-3 transition-colors' onClick={() => handleSelectAgent(result)}>
                <div className='flex items-center gap-12px'>
                  {AGENT_LOGOS[result.backend] && <img src={AGENT_LOGOS[result.backend]} alt={result.name} className='w-20px h-20px' />}
                  <div>
                    <div className='text-14px font-medium text-t-primary mb-2px'>{result.name}</div>
                    <div className='flex items-center gap-8px'>
                      <span className='text-12px text-t-secondary'>{t('agent.health.available', { defaultValue: 'Available' })}</span>
                      {result.latency && (
                        <>
                          <span className='text-t-tertiary'>·</span>
                          <span className='text-12px text-t-tertiary'>{result.latency}ms</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* No available agents */}
      {!checking && !bestAgent && checkResults.length > 0 && (
        <div className='text-center py-24px'>
          <div className='text-48px mb-8px'>😔</div>
          <div className='text-16px font-medium text-t-primary mb-8px'>{t('agent.health.noAvailable', { defaultValue: '当前环境没有可用 agent' })}</div>
          <div className='text-14px text-t-secondary mb-16px'>{t('agent.health.checkConfig', { defaultValue: '请检查配置或稍后重试' })}</div>
          <Button type='primary' onClick={onClose}>
            {t('common.close', { defaultValue: '关闭' })}
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default AgentHealthCheckModal;
