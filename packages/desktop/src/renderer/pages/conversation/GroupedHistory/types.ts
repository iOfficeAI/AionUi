/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SidebarItem, SidebarTeamItem } from '@/common/types/sidebar';
import type { ReactNode } from 'react';

export type WorkspaceGroup = {
  workspace: string;
  display_name: string;
  conversations: TChatConversation[];
  /**
   * The group's items in backend render order, as the union of conversation and
   * team rows (`conversations` above is the conversation-only projection kept for
   * drag / locate / removeProject, which are conversation-scoped). Present for
   * the sidebar read model; absent for legacy (client-grouped) callers.
   */
  rows?: SidebarItem[];
  /**
   * Backend paging token for this group (`project:<id>` | `dir:<key>`). When
   * `hasMore` is true the sidebar shows a "load more" affordance that pages via
   * `ipcBridge.sidebar.items`. Absent for legacy (client-grouped) callers.
   */
  scopeToken?: string;
  /** True when the group has items beyond the current window. */
  hasMore?: boolean;
};

export type TimelineItem = {
  type: 'workspace' | 'conversation' | 'team';
  time: number;
  workspaceGroup?: WorkspaceGroup;
  conversation?: TChatConversation;
  /** Set when `type === 'team'`: an aggregated team row folded into this group. */
  team?: SidebarTeamItem;
};

export type TimelineSection = {
  timeline: string;
  items: TimelineItem[];
};

/** Paging metadata for a fixed-token section (pinned / chats). */
export type SectionPaging = {
  token: string;
  hasMore: boolean;
};

export type GroupedHistoryResult = {
  pinnedConversations: TChatConversation[];
  /**
   * The pinned group's items in backend render order (conversation ∪ team). The
   * conversation-only `pinnedConversations` above still feeds drag ordering;
   * this carries team rows for rendering. Absent for legacy callers.
   */
  pinnedRows?: SidebarItem[];
  /** Paging for the pinned section (token `pinned`); absent when nothing to page. */
  pinnedPaging?: SectionPaging;
  timelineSections: TimelineSection[];
  /** Paging for the flat chats section (token `chats`); absent when nothing to page. */
  chatsPaging?: SectionPaging;
};

export type ExportZipFile = {
  name: string;
  content?: string;
  sourcePath?: string;
};

export type ExportTask =
  | { mode: 'single'; conversation: TChatConversation }
  | { mode: 'batch'; conversation_ids: string[] }
  | null;

/** One entry of the "move to group" submenu; `moveToGroup:<groupId>` | `moveToGroup:` (remove). */
export type MoveToGroupMenuItem = {
  key: string;
  icon?: ReactNode;
  label: string;
};

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
  onMenuVisibleChange: (conversation_id: string, visible: boolean) => void;
  onEditStart: (conversation: TChatConversation) => void;
  onCreateCronTask: (conversation: TChatConversation) => void;
  onDelete: (conversation_id: string) => void;
  onExport?: (conversation: TChatConversation) => void;
  onTogglePin: (conversation: TChatConversation) => void;
  getJobStatus: (conversation_id: string) => 'none' | 'active' | 'paused' | 'error' | 'unread';
  /** Resolve a loaded conversation's name by id (fork-lineage badge tooltip). */
  resolveConversationName?: (conversation_id: string) => string | undefined;
  /** When true, the agent icon is dimmed by default and only shows full color on hover. Used inside project folders to reduce visual weight. */
  dimIcon?: boolean;
  /** Hover-reveal drag handle overlaying the leading icon; supplied by the sortable wrapper for reorderable (pinned) rows. */
  dragHandle?: ReactNode;
  /** "Move to group" submenu entries (`moveToGroup:<id>` | `moveToGroup:` for remove); hidden when empty. */
  moveToGroupItems?: MoveToGroupMenuItem[];
  /** Fired when a "Move to group" submenu entry is picked; null means remove from group. */
  onMoveToGroup?: (targetGroupId: string | null) => void;
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
