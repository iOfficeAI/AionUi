/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AgentScanningOverlay - An overlay component that displays agent scanning
 * progress when auto-switching to an available agent. Shows scanning animation,
 * agent detection status, and connection progress.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@arco-design/web-react';
import { Loading, CloseOne, CheckOne } from '@icon-park/react';
import type { AcpBackendAll } from '@/types/acpTypes';

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
  gemini: 'Gemini Pro',
  qwen: 'Qwen Max',
  iflow: 'iFlow',
  droid: 'Droid',
  goose: 'Goose',
  auggie: 'Auggie',
  kimi: 'Kimi',
};

export type AgentScanStatus = 'queued' | 'checking' | 'unreachable' | 'available';

export type ScannedAgent = {
  backend: AcpBackendAll;
  name?: string;
  status: AgentScanStatus;
  latency?: number;
};

export type ScanningPhase = 'initial' | 'scanning' | 'connecting' | 'done';

type AgentScanningOverlayProps = {
  /** Current scanning phase */
  phase: ScanningPhase;
  /** List of agents being scanned */
  agents: ScannedAgent[];
  /** The selected best agent (when in connecting phase) */
  selectedAgent?: ScannedAgent;
  /** Connection progress (0-100) */
  connectionProgress?: number;
  /** Whether the overlay is visible */
  visible: boolean;
};

/**
 * Get display name for an agent
 */
const getAgentDisplayName = (agent: ScannedAgent): string => {
  return agent.name || AGENT_NAMES[agent.backend] || agent.backend;
};

/**
 * Get status text for an agent
 */
const getStatusText = (status: AgentScanStatus, t: (key: string, options?: Record<string, unknown>) => string): string => {
  switch (status) {
    case 'queued':
      return t('guid.scanning.statusQueued', { defaultValue: 'Queued' });
    case 'checking':
      return t('guid.scanning.statusTesting', { defaultValue: 'Testing latency...' });
    case 'unreachable':
      return t('guid.scanning.statusUnreachable', { defaultValue: 'Unreachable' });
    case 'available':
      return t('guid.scanning.statusAvailable', { defaultValue: 'Available' });
  }
};

/**
 * Agent card component displaying scan status
 */
const AgentCard: React.FC<{
  agent: ScannedAgent;
  isSelected?: boolean;
  showProgress?: boolean;
  progress?: number;
}> = ({ agent, isSelected, showProgress, progress }) => {
  const { t } = useTranslation();
  const logo = AGENT_LOGOS[agent.backend];
  const displayName = getAgentDisplayName(agent);
  const statusText = getStatusText(agent.status, t);

  // Status colors and icons
  const getStatusStyle = () => {
    switch (agent.status) {
      case 'unreachable':
        return { color: 'var(--color-danger-6)', icon: <CloseOne theme='filled' size={12} fill='var(--color-danger-6)' /> };
      case 'checking':
        return { color: 'var(--color-warning-6)', icon: <Loading theme='outline' size={12} className='animate-spin' style={{ color: 'var(--color-warning-6)' }} /> };
      case 'available':
        return { color: 'var(--color-success-6)', icon: <CheckOne theme='filled' size={12} fill='var(--color-success-6)' /> };
      case 'queued':
      default:
        return { color: 'var(--color-text-3)', icon: null };
    }
  };

  const { color, icon } = getStatusStyle();

  return (
    <div className={`flex flex-col items-center p-12px rounded-10px min-w-100px transition-all ${isSelected ? 'bg-primary-1 border-2 border-solid border-primary shadow-sm' : 'bg-white border-1 border-solid border-border-2'}`}>
      {/* Agent logo */}
      <div className='relative w-32px h-32px mb-6px'>
        {logo ? <img src={logo} alt={displayName} className='w-full h-full' /> : <div className='w-full h-full rounded-full bg-fill-2 flex items-center justify-center text-14px'>{displayName.charAt(0)}</div>}
        {/* Status indicator dot */}
        {agent.status === 'unreachable' && <CloseOne theme='filled' size={14} fill='var(--color-danger-6)' className='absolute -top-2px -right-2px' />}
      </div>

      {/* Agent name */}
      <div className='text-13px font-medium text-t-primary mb-2px'>{displayName}</div>

      {/* Status */}
      <div className='flex items-center gap-4px text-11px' style={{ color }}>
        {icon}
        <span>{statusText}</span>
      </div>

      {/* Progress bar for connecting state */}
      {showProgress && progress !== undefined && (
        <div className='w-full mt-8px'>
          <Progress percent={progress} size='small' showText={false} />
        </div>
      )}
    </div>
  );
};

/**
 * Main AgentScanningOverlay component
 */
const AgentScanningOverlay: React.FC<AgentScanningOverlayProps> = ({ phase, agents, selectedAgent, connectionProgress = 0, visible }) => {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className='border-1 border-solid border-primary-3 rounded-12px p-16px bg-primary-1 mb-12px'>
      {/* Initial phase - just showing that current agent is unavailable */}
      {phase === 'initial' && (
        <div className='flex items-center gap-8px'>
          <Loading theme='outline' size={16} className='animate-spin text-primary' />
          <span className='text-13px text-t-secondary'>{t('guid.scanning.initialMessage', { defaultValue: 'Current Agent is unavailable, detecting other available agents...' })}</span>
        </div>
      )}

      {/* Scanning phase - showing agent cards with status */}
      {phase === 'scanning' && (
        <>
          <div className='flex items-center gap-8px mb-12px'>
            <Loading theme='outline' size={16} className='animate-spin text-primary' />
            <span className='text-13px text-t-secondary'>{t('guid.scanning.scanningMessage', { defaultValue: 'Scanning local available agents...' })}</span>
          </div>

          {/* Agent cards */}
          <div className='flex gap-10px overflow-x-auto pb-4px'>
            {agents.map((agent) => (
              <AgentCard key={agent.backend} agent={agent} />
            ))}
          </div>
        </>
      )}

      {/* Connecting phase - showing selected agent with progress */}
      {phase === 'connecting' && selectedAgent && (
        <>
          {/* Success message */}
          <div className='bg-success-1 border-1 border-solid border-success-3 rounded-8px p-10px mb-12px flex items-center gap-8px'>
            <CheckOne theme='filled' size={16} fill='var(--color-success-6)' />
            <span className='text-13px text-success-6 font-medium'>{t('guid.scanning.connectingMessage', { defaultValue: 'Connected successfully, please wait...' })}</span>
          </div>

          {/* Selected agent card with progress */}
          <AgentCard agent={{ ...selectedAgent, status: 'checking' }} isSelected showProgress progress={connectionProgress} />
          <div className='text-11px text-t-tertiary mt-8px text-center'>{t('guid.scanning.establishingConnection', { defaultValue: 'Establishing connection...' })}</div>
        </>
      )}
    </div>
  );
};

export default AgentScanningOverlay;
