/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentLogo } from '@/renderer/utils/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import type { AvailableAgent, MentionOption } from '../types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type GuidMentionResult = {
  mentionQuery: string | null;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  mentionOpen: boolean;
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mentionSelectorVisible: boolean;
  setMentionSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  mentionSelectorOpen: boolean;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mentionActiveIndex: number;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionOptions: MentionOption[];
  filteredMentionOptions: MentionOption[];
  selectMentionAgent: (key: string) => void;
  mentionMenuRef: React.RefObject<HTMLDivElement>;
  mentionMatchRegex: RegExp;
  selectedAgentLabel: string;
  mentionMenuSelectedKey: string;
};

type UseGuidMentionOptions = {
  availableAgents: AvailableAgent[] | undefined;
  customAgentAvatarMap: Map<string, string | undefined>;
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  selectedAgentInfo: AvailableAgent | undefined;
};

/**
 * Hook that manages the @ mention system for agent selection.
 */
export const useGuidMention = ({ availableAgents, customAgentAvatarMap, selectedAgentKey, setSelectedAgentKey, setInput, selectedAgentInfo }: UseGuidMentionOptions): GuidMentionResult => {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSelectorVisible, setMentionSelectorVisible] = useState(false);
  const [mentionSelectorOpen, setMentionSelectorOpen] = useState(false);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const mentionMatchRegex = useMemo(() => /(?:^|\s)@([^\s@]*)$/, []);

  const mentionOptions = useMemo(() => {
    const agents = availableAgents || [];
    return agents.map((agent) => {
      const key = agent.backend === 'custom' && agent.customAgentId ? `custom:${agent.customAgentId}` : agent.backend;
      const label = agent.name || agent.backend;
      const avatarValue = agent.backend === 'custom' ? agent.avatar || customAgentAvatarMap.get(agent.customAgentId || '') : undefined;
      const avatar = avatarValue ? avatarValue.trim() : undefined;
      const tokens = new Set<string>();
      const normalizedLabel = label.toLowerCase();
      tokens.add(normalizedLabel);
      tokens.add(normalizedLabel.replace(/\s+/g, '-'));
      tokens.add(normalizedLabel.replace(/\s+/g, ''));
      tokens.add(agent.backend.toLowerCase());
      if (agent.customAgentId) {
        tokens.add(agent.customAgentId.toLowerCase());
      }
      return {
        key,
        label,
        tokens,
        avatar,
        avatarImage: avatar ? CUSTOM_AVATAR_IMAGE_MAP[avatar] : undefined,
        logo: getAgentLogo(agent.backend) || undefined,
      };
    });
  }, [availableAgents, customAgentAvatarMap]);

  const filteredMentionOptions = useMemo(() => {
    if (!mentionQuery) return mentionOptions;
    const query = mentionQuery.toLowerCase();
    return mentionOptions.filter((option) => Array.from(option.tokens).some((token) => token.startsWith(query)));
  }, [mentionOptions, mentionQuery]);

  const stripMentionToken = useCallback(
    (value: string) => {
      if (!mentionMatchRegex.test(value)) return value;
      return value.replace(mentionMatchRegex, (_match, _query) => '').trimEnd();
    },
    [mentionMatchRegex]
  );

  const selectMentionAgent = useCallback(
    (key: string) => {
      setSelectedAgentKey(key);
      setInput((prev) => stripMentionToken(prev));
      setMentionOpen(false);
      setMentionSelectorOpen(false);
      setMentionSelectorVisible(true);
      setMentionQuery(null);
      setMentionActiveIndex(0);
    },
    [stripMentionToken, setSelectedAgentKey, setInput]
  );

  const selectedAgentLabel = selectedAgentInfo?.name || selectedAgentKey;
  const mentionMenuActiveOption = filteredMentionOptions[mentionActiveIndex] || filteredMentionOptions[0];
  const mentionMenuSelectedKey = mentionOpen || mentionSelectorOpen ? mentionMenuActiveOption?.key || selectedAgentKey : selectedAgentKey;

  // Reset active index on open/query change
  useEffect(() => {
    if (mentionOpen) {
      setMentionActiveIndex(0);
      return;
    }
    if (mentionSelectorOpen) {
      const selectedIndex = filteredMentionOptions.findIndex((option) => option.key === selectedAgentKey);
      setMentionActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [filteredMentionOptions, mentionOpen, mentionQuery, mentionSelectorOpen, selectedAgentKey]);

  // Scroll active mention item into view
  useEffect(() => {
    if (!mentionOpen && !mentionSelectorOpen) return;
    const container = mentionMenuRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-mention-index="${mentionActiveIndex}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest' });
  }, [mentionActiveIndex, mentionOpen, mentionSelectorOpen]);

  return {
    mentionQuery,
    setMentionQuery,
    mentionOpen,
    setMentionOpen,
    mentionSelectorVisible,
    setMentionSelectorVisible,
    mentionSelectorOpen,
    setMentionSelectorOpen,
    mentionActiveIndex,
    setMentionActiveIndex,
    mentionOptions,
    filteredMentionOptions,
    selectMentionAgent,
    mentionMenuRef,
    mentionMatchRegex,
    selectedAgentLabel,
    mentionMenuSelectedKey,
  };
};
