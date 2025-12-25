/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { getActivityTime, getTimelineLabel } from '@/renderer/utils/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspaceHistory';
import { Empty, Popconfirm, Input, Tooltip } from '@arco-design/web-react';
import { DeleteOne, MessageOne, EditOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useConversationTabs } from './context/ConversationTabsContext';
import WorkspaceCollapse from './WorkspaceCollapse';

interface WorkspaceGroup {
  workspace: string; // 完整路径
  displayName: string; // 显示名称
  conversations: TChatConversation[];
}

// 统一的时间线项目，可以是 workspace 分组或独立会话
interface TimelineItem {
  type: 'workspace' | 'conversation';
  time: number; // 用于排序的时间
  workspaceGroup?: WorkspaceGroup; // type === 'workspace' 时有值
  conversation?: TChatConversation; // type === 'conversation' 时有值
}

interface TimelineSection {
  timeline: string; // 时间线标题
  items: TimelineItem[]; // 合并后按时间排序的项目
}

// Helper to get timeline label for a conversation
const getConversationTimelineLabel = (conversation: TChatConversation, t: (key: string) => string): string => {
  const time = getActivityTime(conversation);
  return getTimelineLabel(time, Date.now(), t);
};

// 按时间线和工作空间分组
const groupConversationsByTimelineAndWorkspace = (conversations: TChatConversation[], t: (key: string) => string): TimelineSection[] => {
  // 第一步：先按workspace分组所有会话
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const customWorkspace = conv.extra?.customWorkspace;

    if (customWorkspace && workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  // 第二步：为每个workspace组确定它应该出现在哪个时间线（使用组内最新会话的时间）
  const workspaceGroupsByTimeline = new Map<string, WorkspaceGroup[]>();

  allWorkspaceGroups.forEach((convList, workspace) => {
    // 按时间排序会话
    const sortedConvs = convList.sort((a, b) => getActivityTime(b) - getActivityTime(a));
    // 使用最新会话的时间线
    const latestConv = sortedConvs[0];
    const timeline = getConversationTimelineLabel(latestConv, t);

    if (!workspaceGroupsByTimeline.has(timeline)) {
      workspaceGroupsByTimeline.set(timeline, []);
    }

    workspaceGroupsByTimeline.get(timeline)!.push({
      workspace,
      displayName: getWorkspaceDisplayName(workspace),
      conversations: sortedConvs,
    });
  });

  // 第三步：将无workspace的会话按时间线分组
  const withoutWorkspaceByTimeline = new Map<string, TChatConversation[]>();

  withoutWorkspaceConvs.forEach((conv) => {
    const timeline = getConversationTimelineLabel(conv, t);
    if (!withoutWorkspaceByTimeline.has(timeline)) {
      withoutWorkspaceByTimeline.set(timeline, []);
    }
    withoutWorkspaceByTimeline.get(timeline)!.push(conv);
  });

  // 第四步：按时间线顺序构建sections
  const timelineOrder = ['conversation.history.today', 'conversation.history.yesterday', 'conversation.history.recent7Days', 'conversation.history.earlier'];
  const sections: TimelineSection[] = [];

  timelineOrder.forEach((timelineKey) => {
    const timeline = t(timelineKey);
    const withWorkspace = workspaceGroupsByTimeline.get(timeline) || [];
    const withoutWorkspace = withoutWorkspaceByTimeline.get(timeline) || [];

    // 只有当该时间线有会话时才添加section
    if (withWorkspace.length === 0 && withoutWorkspace.length === 0) return;

    // 将 workspace 分组和独立会话合并成统一的 items 数组
    const items: TimelineItem[] = [];

    // 添加 workspace 分组项目
    withWorkspace.forEach((group) => {
      const updateTime = getWorkspaceUpdateTime(group.workspace);
      const time = updateTime > 0 ? updateTime : getActivityTime(group.conversations[0]);
      items.push({
        type: 'workspace',
        time,
        workspaceGroup: group,
      });
    });

    // 添加独立会话项目
    withoutWorkspace.forEach((conv) => {
      items.push({
        type: 'conversation',
        time: getActivityTime(conv),
        conversation: conv,
      });
    });

    // 按时间统一排序（最近的在前）
    items.sort((a, b) => b.time - a.time);

    sections.push({
      timeline,
      items,
    });
  });

  return sections;
};

const EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';

const WorkspaceGroupedHistory: React.FC<{ onSessionClick?: () => void; collapsed?: boolean }> = ({ onSessionClick, collapsed = false }) => {
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => {
    // 从 localStorage 恢复展开状态
    try {
      const stored = localStorage.getItem(EXPANSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // 忽略错误
    }
    return [];
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab, closeAllTabs, activeTab, updateTabName } = useConversationTabs();

  // 加载会话列表
  useEffect(() => {
    const refresh = () => {
      ipcBridge.database.getUserConversations
        .invoke({ page: 0, pageSize: 10000 })
        .then((data) => {
          if (data && Array.isArray(data)) {
            setConversations(data);
          } else {
            setConversations([]);
          }
        })
        .catch((error) => {
          console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
          setConversations([]);
        });
    };
    refresh();
    return addEventListener('chat.history.refresh', refresh);
  }, []);

  // 持久化展开状态
  useEffect(() => {
    try {
      localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(expandedWorkspaces));
    } catch {
      // 忽略错误
    }
  }, [expandedWorkspaces]);

  // 按时间线和workspace分组
  const timelineSections = useMemo(() => {
    return groupConversationsByTimelineAndWorkspace(conversations, t);
  }, [conversations, t]);

  // 默认展开所有 workspace（仅在还未记录展开状态时执行一次）
  useEffect(() => {
    if (expandedWorkspaces.length > 0) return;
    const allWorkspaces: string[] = [];
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          allWorkspaces.push(item.workspaceGroup.workspace);
        }
      });
    });
    if (allWorkspaces.length > 0) {
      setExpandedWorkspaces(allWorkspaces);
    }
  }, [timelineSections, expandedWorkspaces.length]);

  const handleConversationClick = useCallback(
    (conv: TChatConversation) => {
      const customWorkspace = conv.extra?.customWorkspace;
      const newWorkspace = conv.extra?.workspace;

      // 如果点击的是非自定义工作空间的会话，关闭所有tabs
      if (!customWorkspace) {
        closeAllTabs();
        void navigate(`/conversation/${conv.id}`);
        if (onSessionClick) {
          onSessionClick();
        }
        return;
      }

      // 如果点击的是自定义工作空间的会话
      // 检查当前活动tab的workspace是否与新会话的workspace不同
      const currentWorkspace = activeTab?.workspace;

      // 如果当前没有活动tab，或者workspace不同，则关闭所有tabs后再打开新tab
      if (!currentWorkspace || currentWorkspace !== newWorkspace) {
        closeAllTabs();
      }

      // 打开新会话的tab
      openTab(conv);
      void navigate(`/conversation/${conv.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [openTab, closeAllTabs, activeTab, navigate, onSessionClick]
  );

  // 切换 workspace 展开/收起状态
  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((w) => w !== workspace);
      } else {
        return [...prev, workspace];
      }
    });
  }, []);

  const handleRemoveConversation = useCallback(
    (convId: string) => {
      void ipcBridge.conversation.remove
        .invoke({ id: convId })
        .then((success) => {
          if (success) {
            // 触发会话删除事件，用于关闭对应的 tab
            // Trigger conversation deletion event to close corresponding tab
            emitter.emit('conversation.deleted', convId);
            // 刷新会话列表
            emitter.emit('chat.history.refresh');
            if (id === convId) {
              void navigate('/');
            }
          }
        })
        .catch((error) => {
          console.error('Failed to remove conversation:', error);
        });
    },
    [id, navigate]
  );

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setEditingId(conversation.id);
    setEditingName(conversation.name);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingId || !editingName.trim()) return;

    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: editingId,
        updates: { name: editingName.trim() },
      });

      if (success) {
        updateTabName(editingId, editingName.trim());
        emitter.emit('chat.history.refresh');
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
    } finally {
      setEditingId(null);
      setEditingName('');
    }
  }, [editingId, editingName, updateTabName]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleEditSave();
      } else if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel]
  );

  const renderConversation = useCallback(
    (conversation: TChatConversation) => {
      const isSelected = id === conversation.id;
      const isEditing = editingId === conversation.id;

      return (
        <Tooltip key={conversation.id} disabled={!collapsed} content={conversation.name || t('conversation.welcome.newConversation')} position='right'>
          <div
            id={'c-' + conversation.id}
            className={classNames('chat-history__item hover:bg-hover px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0', {
              '!bg-active': isSelected,
            })}
            onClick={() => handleConversationClick(conversation)}
          >
            <MessageOne theme='outline' size='20' className='line-height-0 flex-shrink-0' />
            <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden ml-10px'>{isEditing ? <Input className='chat-history__item-editor text-14px lh-24px h-24px w-full' value={editingName} onChange={setEditingName} onKeyDown={handleEditKeyDown} onBlur={handleEditSave} autoFocus size='small' /> : <div className='chat-history__item-name overflow-hidden text-ellipsis inline-block w-full text-14px lh-24px whitespace-nowrap'>{conversation.name}</div>}</FlexFullContainer>
            {!isEditing && (
              <div
                className={classNames('absolute right-0px top-0px h-full w-70px items-center justify-end hidden group-hover:flex !collapsed-hidden pr-12px')}
                style={{
                  backgroundImage: isSelected ? `linear-gradient(to right, transparent, var(--aou-2) 50%)` : `linear-gradient(to right, transparent, var(--aou-1) 50%)`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <span
                  className='flex-center mr-8px'
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEditStart(conversation);
                  }}
                >
                  <EditOne theme='outline' size='20' className='flex' />
                </span>
                <Popconfirm
                  title={t('conversation.history.deleteTitle')}
                  content={t('conversation.history.deleteConfirm')}
                  okText={t('conversation.history.confirmDelete')}
                  cancelText={t('conversation.history.cancelDelete')}
                  onOk={(event) => {
                    event.stopPropagation();
                    handleRemoveConversation(conversation.id);
                  }}
                  onCancel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <span
                    className='flex-center'
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DeleteOne theme='outline' size='20' className='flex' />
                  </span>
                </Popconfirm>
              </div>
            )}
          </div>
        </Tooltip>
      );
    },
    [id, collapsed, editingId, editingName, t, handleConversationClick, handleEditStart, handleEditKeyDown, handleEditSave, handleRemoveConversation]
  );

  // 如果没有任何会话，显示空状态
  if (timelineSections.length === 0) {
    return (
      <FlexFullContainer>
        <div className='flex-center'>
          <Empty description={t('conversation.history.noHistory')} />
        </div>
      </FlexFullContainer>
    );
  }

  return (
    <FlexFullContainer>
      <div className='size-full overflow-y-auto overflow-x-hidden'>
        {timelineSections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {/* 时间线标题 */}
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{section.timeline}</div>}

            {/* 按时间统一排序渲染所有项目（workspace 分组和独立会话混合） */}
            {section.items.map((item) => {
              if (item.type === 'workspace' && item.workspaceGroup) {
                const group = item.workspaceGroup;
                return (
                  <div key={group.workspace} className={classNames('min-w-0', { 'px-8px': !collapsed })}>
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace)}
                      siderCollapsed={collapsed}
                      header={
                        <div className='flex items-center gap-8px text-14px min-w-0'>
                          <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{group.displayName}</span>
                        </div>
                      }
                    >
                      <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-4px': !collapsed })}>{group.conversations.map((conv) => renderConversation(conv))}</div>
                    </WorkspaceCollapse>
                  </div>
                );
              } else if (item.type === 'conversation' && item.conversation) {
                return renderConversation(item.conversation);
              }
              return null;
            })}
          </div>
        ))}
      </div>
    </FlexFullContainer>
  );
};

export default WorkspaceGroupedHistory;
