/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage, ModelQuotaBucket, ModelQuotaData, ModelQuotaGroup } from '@/common/adapter/ipcBridge';
import type { TokenUsageBreakdown, TokenUsageCost, TokenUsageData } from '@/common/config/storage';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { tokenUsageFromAcpUsage } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

type ConversationUsageExtra = {
  current_model_id?: string;
  agent_name?: string;
  backend?: string;
  cli_path?: string;
  last_token_usage?: TokenUsageData;
  last_context_limit?: number;
  codexModel?: string;
};

export type ModelQuotaEntry = {
  key: string;
  name: string;
  groupName: string;
  agentName?: string;
  fiveHourPct?: number;
  weeklyPct?: number;
  fiveHourResetTime?: string;
  weeklyResetTime?: string;
  primaryPct: number;
  isWarning: boolean;
  isDanger: boolean;
  isActive: boolean;
};

export type ActiveModelUsage = {
  modelName: string;
  agentName: string | null;
  totalTokens: number;
  contextLimit: number;
  percentage: number;
  hasLimit: boolean;
  isWarning: boolean;
  isDanger: boolean;
  cost?: TokenUsageCost;
  breakdown?: TokenUsageBreakdown;
  quotaData?: ModelQuotaData | null;
  quotaEntries: ModelQuotaEntry[];
  activeGroup?: ModelQuotaGroup | null;
  primaryBucket?: ModelQuotaBucket | null;
  quotaType?: 'account_quota' | 'context_window';
};

export function formatQuotaDisplayName(groupName: string, agentName?: string): string {
  const lower = groupName.toLowerCase();
  const baseAgent = agentName || 'Antigravity';
  if (lower.includes('gemini')) {
    return `${baseAgent} (Gemini)`;
  }
  if (lower.includes('claude')) {
    return `${baseAgent} (Claude)`;
  }
  if (agentName && !groupName.toLowerCase().includes(agentName.toLowerCase())) {
    return `${agentName} (${groupName})`;
  }
  return groupName;
}

export function useActiveModelUsage(): ActiveModelUsage {
  const currentConversationId = useCurrentConversation();
  const location = useLocation();
  const routeConversationId = location.pathname.startsWith('/conversation/') ? location.pathname.split('/')[2] : null;

  const conversationId = currentConversationId || routeConversationId;

  const { conversations } = useConversationHistoryContext();

  const conversation = useMemo(() => {
    if (conversationId) {
      const match = conversations.find((c) => c.id === conversationId);
      if (match) return match;
    }
    return conversations.length > 0 ? conversations[0] : null;
  }, [conversationId, conversations]);

  const [liveUsage, setLiveUsage] = useState<TokenUsageData | null>(null);
  const [liveContextLimit, setLiveContextLimit] = useState<number>(0);
  const [liveModelId, setLiveModelId] = useState<string | null>(null);
  const [quotaData, setQuotaData] = useState<ModelQuotaData | null>(null);

  // Sync with conversation data when conversation changes
  useEffect(() => {
    const extra = conversation?.extra as ConversationUsageExtra | undefined;
    setLiveModelId(extra?.current_model_id || extra?.codexModel || null);
    setLiveUsage(extra?.last_token_usage ?? null);
    setLiveContextLimit(extra?.last_context_limit ?? 0);

    const activeId = conversation?.id;
    if (!activeId) return;

    let cancelled = false;

    // Fetch latest usage snapshot from backend
    void ipcBridge.conversation.getUsage
      .invoke({ conversation_id: activeId })
      .then((usage) => {
        if (cancelled || !usage || typeof usage.used !== 'number' || usage.used < 0) return;
        setLiveUsage(tokenUsageFromAcpUsage(usage));
        if (usage.size > 0) {
          setLiveContextLimit(usage.size);
        }
      })
      .catch(() => {});

    // Listen to live stream events for context usage and model info
    const unsubscribe = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (message.conversation_id !== activeId) return;

      if (message.type === 'acp_context_usage' && message.data) {
        const usageData = message.data as {
          used: number;
          size: number;
          cost?: { amount: number; currency: string };
          _meta?: Record<string, unknown>;
        };
        if (typeof usageData.used === 'number') {
          setLiveUsage(tokenUsageFromAcpUsage(usageData));
          if (usageData.size > 0) {
            setLiveContextLimit(usageData.size);
          }
        }
      } else if (message.type === 'acp_model_info' && message.data) {
        const data = message.data as { model?: string };
        if (typeof data.model === 'string' && data.model) {
          setLiveModelId(data.model);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversation?.id]);

  const extra = conversation?.extra as ConversationUsageExtra | undefined;
  const agentName =
    extra?.agent_name || extra?.backend || (conversation?.type === 'antigravity' ? 'antigravity' : null);

  const modelName = useMemo(() => {
    if (liveModelId) return liveModelId;
    if (extra?.current_model_id) return extra.current_model_id;
    if (extra?.codexModel) return extra.codexModel;
    if (extra?.agent_name) return extra.agent_name;
    if (extra?.backend) return extra.backend;
    if (conversation?.type === 'antigravity') return 'Antigravity';
    return '';
  }, [conversation?.extra, conversation?.type, extra, liveModelId]);

  // Fetch quota data (e.g. from agy CLI) for Antigravity or general quota providers
  useEffect(() => {
    let cancelled = false;

    const fetchQuota = () => {
      void ipcBridge.application.getModelQuota
        .invoke({
          agentName: 'antigravity',
          cliPath: extra?.cli_path,
        })
        .then((res) => {
          if (cancelled || !res || !res.success || !res.data) return;
          setQuotaData(res.data);
        })
        .catch(() => {});
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [extra?.cli_path]);

  const quotaEntries = useMemo<ModelQuotaEntry[]>(() => {
    if (!quotaData || !Array.isArray(quotaData.groups) || quotaData.groups.length === 0) {
      return [];
    }

    const lowerModel = modelName.toLowerCase();

    return quotaData.groups.map((group, idx) => {
      const fiveBucket = group.buckets.find(
        (b) => b.window === '5h' || b.id.includes('5h') || b.name.toLowerCase().includes('five hour')
      );
      const weeklyBucket = group.buckets.find(
        (b) => b.window === 'weekly' || b.id.includes('weekly') || b.name.toLowerCase().includes('weekly')
      );

      const fiveHourPct =
        fiveBucket && typeof fiveBucket.remainingFraction === 'number'
          ? Math.round(fiveBucket.remainingFraction * 1000) / 10
          : undefined;

      const weeklyPct =
        weeklyBucket && typeof weeklyBucket.remainingFraction === 'number'
          ? Math.round(weeklyBucket.remainingFraction * 1000) / 10
          : undefined;

      const primaryPct = fiveHourPct ?? weeklyPct ?? 100;
      const minPct = Math.min(fiveHourPct ?? 100, weeklyPct ?? 100);
      const isDanger = minPct <= 10;
      const isWarning = minPct <= 30;

      const lowerGroup = group.name.toLowerCase();
      let isActive = false;
      if (lowerGroup.includes('gemini') && lowerModel.includes('gemini')) {
        isActive = true;
      } else if (
        (lowerGroup.includes('claude') || lowerGroup.includes('gpt')) &&
        (lowerModel.includes('claude') ||
          lowerModel.includes('gpt') ||
          lowerModel.includes('sonnet') ||
          lowerModel.includes('opus'))
      ) {
        isActive = true;
      }

      const displayName = formatQuotaDisplayName(group.name, group.agentName);

      return {
        key: `quota-group-${idx}-${group.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: displayName,
        groupName: group.name,
        agentName: group.agentName,
        fiveHourPct,
        weeklyPct,
        fiveHourResetTime: fiveBucket?.resetTime,
        weeklyResetTime: weeklyBucket?.resetTime,
        primaryPct,
        isWarning,
        isDanger,
        isActive,
      };
    });
  }, [quotaData, modelName]);

  const activeGroup = useMemo(() => {
    if (!quotaData || quotaData.groups.length === 0) return null;
    const activeEntry = quotaEntries.find((e) => e.isActive);
    if (activeEntry) {
      return quotaData.groups.find((g) => g.name === activeEntry.groupName) || quotaData.groups[0];
    }
    const lower = modelName.toLowerCase();
    if (lower.includes('claude') || lower.includes('gpt')) {
      return (
        quotaData.groups.find((g) => g.name.toLowerCase().includes('claude') || g.name.toLowerCase().includes('gpt')) ||
        quotaData.groups[0]
      );
    }
    return quotaData.groups.find((g) => g.name.toLowerCase().includes('gemini')) || quotaData.groups[0];
  }, [quotaData, quotaEntries, modelName]);

  const primaryBucket = useMemo(() => {
    if (!activeGroup || activeGroup.buckets.length === 0) return null;
    return activeGroup.buckets.find((b) => b.window === '5h' || b.id.includes('5h')) || activeGroup.buckets[0];
  }, [activeGroup]);

  const totalTokens = liveUsage?.total_tokens ?? 0;
  const contextLimit = liveContextLimit > 0 ? liveContextLimit : 0;

  let quotaType: 'account_quota' | 'context_window' | undefined;
  let percentage = 0;
  let hasLimit = false;
  let isWarning = false;
  let isDanger = false;

  if (quotaEntries.length > 0) {
    quotaType = 'account_quota';
    hasLimit = true;
    const activeEntry = quotaEntries.find((e) => e.isActive) || quotaEntries[0];
    percentage = activeEntry.primaryPct;
    isWarning = activeEntry.isWarning;
    isDanger = activeEntry.isDanger;
  } else if (contextLimit > 0) {
    quotaType = 'context_window';
    hasLimit = true;
    percentage = Math.min(100, Math.round((totalTokens / contextLimit) * 1000) / 10);
    isWarning = percentage > 70;
    isDanger = percentage > 90;
  }

  return {
    modelName,
    agentName,
    totalTokens,
    contextLimit,
    percentage,
    hasLimit,
    isWarning,
    isDanger,
    cost: liveUsage?.cost,
    breakdown: liveUsage?.breakdown,
    quotaData,
    quotaEntries,
    activeGroup,
    primaryBucket,
    quotaType,
  };
}

/**
 * Resolves a model's context quota limit in tokens.
 * Returns the reported limit if positive, or the known window size for the model family if recognized.
 */
export function resolveModelContextLimit(modelName?: string, reportedLimit?: number): number {
  if (reportedLimit && reportedLimit > 0) return reportedLimit;
  if (!modelName) return 128_000;

  const lower = modelName.toLowerCase();
  if (lower.includes('gemini')) {
    return 1_000_000;
  }
  if (lower.includes('claude')) {
    return 200_000;
  }
  if (lower.includes('gpt-4') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) {
    return 128_000;
  }
  if (lower.includes('deepseek')) {
    return 64_000;
  }
  if (lower.includes('qwen')) {
    return 128_000;
  }
  return 128_000;
}
