/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';

export type WorkspaceGroup = {
  workspace: string;
  displayName: string;
  conversations: TChatConversation[];
};

export type TimelineItem = {
  type: 'workspace' | 'conversation';
  time: number;
  workspaceGroup?: WorkspaceGroup;
  conversation?: TChatConversation;
};

export type TimelineSection = {
  timeline: string;
  items: TimelineItem[];
};

export type GroupedHistoryResult = {
  pinnedConversations: TChatConversation[];
  timelineSections: TimelineSection[];
};

export type ExportZipFile = {
  name: string;
  content?: string;
  sourcePath?: string;
};

export type ExportTask = { mode: 'single'; conversation: TChatConversation } | { mode: 'batch'; conversationIds: string[] } | null;

export type ConversationRowProps = {
  conversation: TChatConversation;
  collapsed: boolean;
  tooltipEnabled: boolean;
  batchMode: boolean;
  checked: boolean;
  selected: boolean;
  menuVisible: boolean;
  onToggleChecked: (conversation: TChatConversation) => void;
  onConversationClick: (conversation: TChatConversation) => void;
  onOpenMenu: (conversation: TChatConversation) => void;
  onMenuVisibleChange: (conversationId: string, visible: boolean) => void;
  onEditStart: (conversation: TChatConversation) => void;
  onDelete: (conversationId: string) => void;
  onExport: (conversation: TChatConversation) => void;
  onTogglePin: (conversation: TChatConversation) => void;
};

export type WorkspaceGroupedHistoryProps = {
  onSessionClick?: () => void;
  collapsed?: boolean;
  tooltipEnabled?: boolean;
  batchMode?: boolean;
  onBatchModeChange?: (value: boolean) => void;
};
