/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

/** A single conversation in a workspace (not a team child) */
export type ConversationNode = {
  kind: 'conversation';
  conversation: TChatConversation;
};

/** An agent-team parent with its nested child conversations */
export type TeamNode = {
  kind: 'team';
  teamConversation: TChatConversation;
  children: TChatConversation[];
};

/** A node inside a workspace group — either a standalone conversation or a team with children */
export type WorkspaceNode = ConversationNode | TeamNode;

/** A single conversation in a workspace (not a team child) */
export type ConversationNode = {
  kind: 'conversation';
  conversation: TChatConversation;
};

/** An agent-team parent with its nested child conversations */
export type TeamNode = {
  kind: 'team';
  teamConversation: TChatConversation;
  children: TChatConversation[];
};

/** A node inside a workspace group — either a standalone conversation or a team with children */
export type WorkspaceNode = ConversationNode | TeamNode;

export type WorkspaceGroup = {
  workspace: string;
  displayName: string;
  conversations: TChatConversation[];
  /** Structured nodes: standalone conversations + team parents with nested children */
  nodes: WorkspaceNode[];
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

export type ExportTask =
  | { mode: 'single'; conversation: TChatConversation }
  | { mode: 'batch'; conversationIds: string[] }
  | null;

export type ConversationRowProps = {
  conversation: TChatConversation;
  isGenerating: boolean;
  hasCompletionUnread: boolean;
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
  getJobStatus: (conversationId: string) => 'none' | 'active' | 'paused' | 'error' | 'unread';
};

export type WorkspaceGroupedHistoryProps = {
  onSessionClick?: () => void;
  collapsed?: boolean;
  tooltipEnabled?: boolean;
  batchMode?: boolean;
  onBatchModeChange?: (value: boolean) => void;
};

export type DragItemType = 'conversation' | 'workspace';

export type DragItem = {
  type: DragItemType;
  id: string;
  conversation?: TChatConversation;
  workspaceGroup?: WorkspaceGroup;
  sourceSection: 'pinned' | string;
  sourceWorkspace?: string;
};
