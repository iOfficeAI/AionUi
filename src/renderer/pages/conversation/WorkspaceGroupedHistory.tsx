/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import type { IDirOrFile } from '@/common/ipcBridge';
import type { TChatConversation } from '@/common/storage';
import { getAgentLogo } from '@/renderer/utils/agentLogo';
import DirectorySelectionModal from '@/renderer/components/DirectorySelectionModal';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { usePresetAssistantInfo } from '@/renderer/hooks/usePresetAssistantInfo';
import { CronJobIndicator, useCronJobsMap } from '@/renderer/pages/cron';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { getActivityTime, getTimelineLabel } from '@/renderer/utils/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspaceHistory';
import { Button, Checkbox, Dropdown, Empty, Input, Menu, Message, Modal, Tooltip } from '@arco-design/web-react';
import { DeleteOne, EditOne, Export, FolderOpen, MessageOne, Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useConversationTabs } from './context/ConversationTabsContext';
import WorkspaceCollapse from './WorkspaceCollapse';

interface WorkspaceGroup {
  workspace: string;
  displayName: string;
  conversations: TChatConversation[];
}

interface TimelineItem {
  type: 'workspace' | 'conversation';
  time: number;
  workspaceGroup?: WorkspaceGroup;
  conversation?: TChatConversation;
}

interface TimelineSection {
  timeline: string;
  items: TimelineItem[];
}

interface GroupedHistoryResult {
  pinnedConversations: TChatConversation[];
  timelineSections: TimelineSection[];
}

interface ExportZipFile {
  name: string;
  content?: string;
  sourcePath?: string;
}

type ExportTask = { mode: 'single'; conversation: TChatConversation } | { mode: 'batch'; conversationIds: string[] } | null;

const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const EXPORT_IO_TIMEOUT_MS = 15000;

const getConversationTimelineLabel = (conversation: TChatConversation, t: (key: string) => string): string => {
  const time = getActivityTime(conversation);
  return getTimelineLabel(time, Date.now(), t);
};

const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinnedAt?: number } | undefined;
  if (typeof extra?.pinnedAt === 'number') {
    return extra.pinnedAt;
  }
  return getActivityTime(conversation);
};

const groupConversationsByTimelineAndWorkspace = (conversations: TChatConversation[], t: (key: string) => string): TimelineSection[] => {
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

  const workspaceGroupsByTimeline = new Map<string, WorkspaceGroup[]>();

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].sort((a, b) => getActivityTime(b) - getActivityTime(a));
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

  const withoutWorkspaceByTimeline = new Map<string, TChatConversation[]>();

  withoutWorkspaceConvs.forEach((conv) => {
    const timeline = getConversationTimelineLabel(conv, t);
    if (!withoutWorkspaceByTimeline.has(timeline)) {
      withoutWorkspaceByTimeline.set(timeline, []);
    }
    withoutWorkspaceByTimeline.get(timeline)!.push(conv);
  });

  const timelineOrder = ['conversation.history.today', 'conversation.history.yesterday', 'conversation.history.recent7Days', 'conversation.history.earlier'];
  const sections: TimelineSection[] = [];

  timelineOrder.forEach((timelineKey) => {
    const timeline = t(timelineKey);
    const withWorkspace = workspaceGroupsByTimeline.get(timeline) || [];
    const withoutWorkspace = withoutWorkspaceByTimeline.get(timeline) || [];

    if (withWorkspace.length === 0 && withoutWorkspace.length === 0) return;

    const items: TimelineItem[] = [];

    withWorkspace.forEach((group) => {
      const updateTime = getWorkspaceUpdateTime(group.workspace);
      const time = updateTime > 0 ? updateTime : getActivityTime(group.conversations[0]);
      items.push({
        type: 'workspace',
        time,
        workspaceGroup: group,
      });
    });

    withoutWorkspace.forEach((conv) => {
      items.push({
        type: 'conversation',
        time: getActivityTime(conv),
        conversation: conv,
      });
    });

    items.sort((a, b) => b.time - a.time);

    sections.push({
      timeline,
      items,
    });
  });

  return sections;
};

const buildGroupedHistory = (conversations: TChatConversation[], t: (key: string) => string): GroupedHistoryResult => {
  const pinnedConversations = conversations.filter((conversation) => isConversationPinned(conversation)).sort((a, b) => getConversationPinnedAt(b) - getConversationPinnedAt(a));

  const normalConversations = conversations.filter((conversation) => !isConversationPinned(conversation));

  return {
    pinnedConversations,
    timelineSections: groupConversationsByTimelineAndWorkspace(normalConversations, t),
  };
};

const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(INVALID_FILENAME_CHARS_RE, '_').trim();
  return (cleaned || 'conversation').slice(0, 80);
};

const joinFilePath = (dir: string, fileName: string): string => {
  const separator = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${fileName}` : `${dir}${separator}${fileName}`;
};

const formatTimestamp = (time = Date.now()): string => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const normalizeZipPath = (value: string): string => value.replace(/\\/g, '/').replace(/^\/+/, '');

const buildTopicFolderName = (conversation: TChatConversation): string => {
  const safeName = sanitizeFileName(conversation.name || conversation.id);
  return `${safeName}__${conversation.id}`;
};

const appendWorkspaceFilesToZip = (files: ExportZipFile[], root: IDirOrFile | undefined, prefix: string): void => {
  if (!root?.children || root.children.length === 0) {
    return;
  }

  const walk = (node: IDirOrFile) => {
    if (node.isFile) {
      const relativePath = normalizeZipPath(node.relativePath || node.name);
      if (relativePath) {
        files.push({
          name: `${prefix}/workspace/${relativePath}`,
          sourcePath: node.fullPath,
        });
      }
      return;
    }
    node.children?.forEach((child) => walk(child));
  };

  root.children.forEach((child) => walk(child));
};

const getBackendKeyFromConversation = (conversation: TChatConversation): string | undefined => {
  if (conversation.type === 'acp') {
    return conversation.extra?.backend;
  }
  if (conversation.type === 'openclaw-gateway') {
    return conversation.extra?.backend || 'openclaw-gateway';
  }
  return conversation.type;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timeout`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const readMessageContent = (message: TMessage): string => {
  const content = message.content as Record<string, unknown> | string | undefined;

  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object' && typeof content.content === 'string') {
    return content.content;
  }

  try {
    return JSON.stringify(content ?? {}, null, 2);
  } catch {
    return String(content ?? '');
  }
};

const getMessageRoleLabel = (message: TMessage): string => {
  if (message.position === 'right') return 'User';
  if (message.position === 'left') return 'Assistant';
  return 'System';
};

const buildConversationMarkdown = (conversation: TChatConversation, messages: TMessage[]): string => {
  const lines: string[] = [];
  lines.push(`# ${conversation.name || 'Conversation'}`);
  lines.push('');
  lines.push(`- Conversation ID: ${conversation.id}`);
  lines.push(`- Exported At: ${new Date().toISOString()}`);
  lines.push(`- Type: ${conversation.type}`);
  lines.push('');
  lines.push('## Messages');
  lines.push('');

  messages.forEach((message, index) => {
    lines.push(`### ${index + 1}. ${getMessageRoleLabel(message)} (${message.type})`);
    lines.push('');
    lines.push('```text');
    lines.push(readMessageContent(message));
    lines.push('```');
    lines.push('');
  });

  return lines.join('\n');
};

const buildConversationJson = (conversation: TChatConversation, messages: TMessage[]): string => {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversation,
      messages,
    },
    null,
    2
  );
};

interface ConversationRowProps {
  conversation: TChatConversation;
  collapsed: boolean;
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
}

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { conversation, collapsed, batchMode, checked, selected, menuVisible } = props;
  const { onToggleChecked, onConversationClick, onOpenMenu, onMenuVisibleChange, onEditStart, onDelete, onExport, onTogglePin } = props;
  const { t } = useTranslation();
  const { getJobStatus } = useCronJobsMap();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);
  const isPinned = isConversationPinned(conversation);
  const cronStatus = getJobStatus(conversation.id);

  const renderLeadingIcon = () => {
    if (cronStatus !== 'none') {
      return <CronJobIndicator status={cronStatus} size={20} className='flex-shrink-0' />;
    }

    if (assistantInfo) {
      if (assistantInfo.isEmoji) {
        return <span className='text-18px leading-none flex-shrink-0'>{assistantInfo.logo}</span>;
      }
      return <img src={assistantInfo.logo} alt={assistantInfo.name} className='w-20px h-20px rounded-50% flex-shrink-0' />;
    }

    const backendKey = getBackendKeyFromConversation(conversation);
    const logo = getAgentLogo(backendKey);
    if (logo) {
      return <img src={logo} alt={`${backendKey || 'agent'} logo`} className='w-20px h-20px rounded-50% flex-shrink-0' />;
    }

    return <MessageOne theme='outline' size='20' className='line-height-0 flex-shrink-0' />;
  };

  const handleRowClick = () => {
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  return (
    <Tooltip key={conversation.id} disabled={!collapsed} content={conversation.name || t('conversation.welcome.newConversation')} position='right'>
      <div
        id={'c-' + conversation.id}
        className={classNames('chat-history__item px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors', {
          'hover:bg-[rgba(var(--primary-6),0.14)]': !batchMode,
          '!bg-active': selected,
          'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
        })}
        onClick={handleRowClick}
      >
        {batchMode && (
          <span
            className='mr-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        {renderLeadingIcon()}
        <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden ml-10px'>
          <Tooltip content={conversation.name} disabled={collapsed || !conversation.name} position='top'>
            <div className={classNames('chat-history__item-name overflow-hidden text-ellipsis block w-full text-14px lh-24px whitespace-nowrap min-w-0 group-hover:text-1', selected && !batchMode ? 'text-1 font-medium' : 'text-2')}>{conversation.name}</div>
          </Tooltip>
        </FlexFullContainer>

        {!batchMode && (
          <div
            className={classNames('absolute right-0px top-0px h-full items-center justify-end !collapsed-hidden pr-8px', {
              flex: isPinned || menuVisible,
              'hidden group-hover:flex': !isPinned && !menuVisible,
            })}
            style={{
              backgroundImage: selected ? `linear-gradient(to right, transparent, var(--aou-2) 50%)` : `linear-gradient(to right, transparent, var(--aou-1) 50%)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {isPinned && !menuVisible && (
              <span className='flex-center text-t-secondary group-hover:hidden pr-4px'>
                <Pushpin theme='outline' size='16' />
              </span>
            )}
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    if (key === 'pin') {
                      onTogglePin(conversation);
                      return;
                    }
                    if (key === 'rename') {
                      onEditStart(conversation);
                      return;
                    }
                    if (key === 'export') {
                      onExport(conversation);
                      return;
                    }
                    if (key === 'delete') {
                      onDelete(conversation.id);
                    }
                  }}
                >
                  <Menu.Item key='pin'>
                    <div className='flex items-center gap-8px'>
                      <Pushpin theme='outline' size='14' />
                      <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='rename'>
                    <div className='flex items-center gap-8px'>
                      <EditOne theme='outline' size='14' />
                      <span>{t('conversation.history.rename')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='export'>
                    <div className='flex items-center gap-8px'>
                      <Export theme='outline' size='14' />
                      <span>{t('conversation.history.export')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='delete'>
                    <div className='flex items-center gap-8px text-[rgb(var(--warning-6))]'>
                      <DeleteOne theme='outline' size='14' />
                      <span>{t('conversation.history.deleteTitle')}</span>
                    </div>
                  </Menu.Item>
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                className={classNames('flex-center cursor-pointer hover:bg-fill-2 rd-4px p-4px transition-colors relative text-t-primary', {
                  flex: menuVisible,
                  'hidden group-hover:flex': !menuVisible,
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
              >
                <div className='flex flex-col gap-2px items-center justify-center' style={{ width: '16px', height: '16px' }}>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                </div>
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

const EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';

interface WorkspaceGroupedHistoryProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
  batchMode?: boolean;
  onBatchModeChange?: (value: boolean) => void;
}

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({ onSessionClick, collapsed = false, batchMode = false, onBatchModeChange }) => {
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(EXPANSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState<string>('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [exportTask, setExportTask] = useState<ExportTask>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportTargetPath, setExportTargetPath] = useState('');
  const [exportModalLoading, setExportModalLoading] = useState(false);
  const [showExportDirectorySelector, setShowExportDirectorySelector] = useState(false);
  const [currentExportRequestId, setCurrentExportRequestId] = useState<string | null>(null);
  const exportCanceledRef = useRef(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab, closeAllTabs, activeTab, updateTabName } = useConversationTabs();
  const { markAsRead } = useCronJobsMap();

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

  useEffect(() => {
    if (!id) return;
    const rafId = requestAnimationFrame(() => {
      const element = document.getElementById('c-' + id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [id]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(expandedWorkspaces));
    } catch {
      // ignore
    }
  }, [expandedWorkspaces]);

  const groupedHistory = useMemo(() => {
    return buildGroupedHistory(conversations, t);
  }, [conversations, t]);

  const { pinnedConversations, timelineSections } = groupedHistory;

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

  useEffect(() => {
    if (!batchMode) {
      setSelectedConversationIds(new Set());
    }
  }, [batchMode]);

  useEffect(() => {
    if (!batchMode || selectedConversationIds.size === 0) return;
    const existingIds = new Set(conversations.map((conversation) => conversation.id));
    setSelectedConversationIds((prev) => {
      const next = new Set<string>();
      prev.forEach((conversationId) => {
        if (existingIds.has(conversationId)) {
          next.add(conversationId);
        }
      });
      return next;
    });
  }, [batchMode, conversations, selectedConversationIds.size]);

  useEffect(() => {
    if (batchMode) {
      setDropdownVisibleId(null);
    }
  }, [batchMode]);

  const allConversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations]);
  const selectedCount = selectedConversationIds.size;
  const allSelected = allConversationIds.length > 0 && selectedCount === allConversationIds.length;

  const toggleSelectedConversation = useCallback((conversation: TChatConversation) => {
    setSelectedConversationIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversation.id)) {
        next.delete(conversation.id);
      } else {
        next.add(conversation.id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedConversationIds((prev) => {
      if (prev.size === allConversationIds.length) {
        return new Set();
      }
      return new Set(allConversationIds);
    });
  }, [allConversationIds]);

  const handleConversationClick = useCallback(
    (conversation: TChatConversation) => {
      if (batchMode) {
        toggleSelectedConversation(conversation);
        return;
      }

      const customWorkspace = conversation.extra?.customWorkspace;
      const newWorkspace = conversation.extra?.workspace;

      markAsRead(conversation.id);

      if (!customWorkspace) {
        closeAllTabs();
        void navigate(`/conversation/${conversation.id}`);
        if (onSessionClick) {
          onSessionClick();
        }
        return;
      }

      const currentWorkspace = activeTab?.workspace;
      if (!currentWorkspace || currentWorkspace !== newWorkspace) {
        closeAllTabs();
      }

      openTab(conversation);
      void navigate(`/conversation/${conversation.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [batchMode, toggleSelectedConversation, markAsRead, closeAllTabs, navigate, onSessionClick, activeTab, openTab]
  );

  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((item) => item !== workspace);
      }
      return [...prev, workspace];
    });
  }, []);

  const removeConversation = useCallback(
    async (conversationId: string) => {
      const success = await ipcBridge.conversation.remove.invoke({ id: conversationId });
      if (!success) {
        return false;
      }

      emitter.emit('conversation.deleted', conversationId);
      if (id === conversationId) {
        void navigate('/');
      }
      return true;
    },
    [id, navigate]
  );

  const handleDeleteClick = useCallback(
    (conversationId: string) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await removeConversation(conversationId);
            if (success) {
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.deleteSuccess'));
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (error) {
            console.error('Failed to remove conversation:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [removeConversation, t]
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    Modal.confirm({
      title: t('conversation.history.batchDelete'),
      content: t('conversation.history.batchDeleteConfirm', { count: selectedConversationIds.size }),
      okText: t('conversation.history.confirmDelete'),
      cancelText: t('conversation.history.cancelDelete'),
      okButtonProps: { status: 'warning' },
      onOk: async () => {
        const selectedIds = Array.from(selectedConversationIds);
        try {
          const results = await Promise.all(selectedIds.map((conversationId) => removeConversation(conversationId)));
          const successCount = results.filter(Boolean).length;
          emitter.emit('chat.history.refresh');
          if (successCount > 0) {
            Message.success(t('conversation.history.batchDeleteSuccess', { count: successCount }));
          } else {
            Message.error(t('conversation.history.deleteFailed'));
          }
        } catch (error) {
          console.error('Failed to batch delete conversations:', error);
          Message.error(t('conversation.history.deleteFailed'));
        } finally {
          setSelectedConversationIds(new Set());
          onBatchModeChange?.(false);
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [onBatchModeChange, removeConversation, selectedConversationIds, t]);

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setRenameModalId(conversation.id);
    setRenameModalName(conversation.name);
    setRenameModalVisible(true);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameModalId || !renameModalName.trim()) return;

    setRenameLoading(true);
    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: renameModalId,
        updates: { name: renameModalName.trim() },
      });

      if (success) {
        updateTabName(renameModalId, renameModalName.trim());
        emitter.emit('chat.history.refresh');
        setRenameModalVisible(false);
        setRenameModalId(null);
        setRenameModalName('');
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  }, [renameModalId, renameModalName, updateTabName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const fileExists = useCallback(async (filePath: string): Promise<boolean> => {
    try {
      await withTimeout(ipcBridge.fs.getFileMetadata.invoke({ path: filePath }), EXPORT_IO_TIMEOUT_MS, `getFileMetadata:${filePath}`);
      return true;
    } catch {
      return false;
    }
  }, []);

  const createUniqueFilePath = useCallback(
    async (directory: string, fileNameWithoutExt: string, ext: 'json' | 'md' | 'zip') => {
      const safeBaseName = sanitizeFileName(fileNameWithoutExt);
      const candidate = joinFilePath(directory, `${safeBaseName}.${ext}`);
      if (!(await fileExists(candidate))) {
        return candidate;
      }

      for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
        const nextCandidate = joinFilePath(directory, `${safeBaseName}-${Date.now()}-${index}.${ext}`);
        if (!(await fileExists(nextCandidate))) {
          return nextCandidate;
        }
      }

      return candidate;
    },
    [fileExists]
  );

  const getDesktopPath = useCallback(async (): Promise<string> => {
    try {
      const desktopPath = await ipcBridge.application.getPath.invoke({ name: 'desktop' });
      return desktopPath || '';
    } catch {
      return '';
    }
  }, []);

  const closeExportModal = useCallback(() => {
    if (exportModalLoading) {
      exportCanceledRef.current = true;
    }
    if (exportModalLoading && currentExportRequestId) {
      void ipcBridge.fs.cancelZip.invoke({ requestId: currentExportRequestId });
    }
    setExportModalVisible(false);
    setExportTask(null);
    setExportTargetPath('');
    setExportModalLoading(false);
    setCurrentExportRequestId(null);
  }, [currentExportRequestId, exportModalLoading]);

  const openExportModal = useCallback(
    async (task: NonNullable<ExportTask>) => {
      exportCanceledRef.current = false;
      setExportTask(task);
      setExportModalVisible(true);
      const desktopPath = await getDesktopPath();
      setExportTargetPath(desktopPath);
    },
    [getDesktopPath]
  );

  const handleSelectExportDirectoryFromModal = useCallback((paths: string[] | undefined) => {
    setShowExportDirectorySelector(false);
    if (paths && paths.length > 0) {
      setExportTargetPath(paths[0]);
    }
  }, []);

  const handleSelectExportFolder = useCallback(async () => {
    if (exportModalLoading) {
      return;
    }

    if (!isElectronDesktop()) {
      setShowExportDirectorySelector(true);
      return;
    }

    try {
      const desktopPath = exportTargetPath || (await getDesktopPath());
      const folders = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory'],
        defaultPath: desktopPath || undefined,
      });
      if (folders && folders.length > 0) {
        setExportTargetPath(folders[0]);
      }
    } catch (error) {
      console.error('Failed to open export directory dialog:', error);
      Message.error(t('conversation.history.exportFailed'));
    }
  }, [exportModalLoading, exportTargetPath, getDesktopPath, t]);

  const fetchConversationMessages = useCallback(async (conversationId: string): Promise<TMessage[]> => {
    try {
      return await withTimeout(
        ipcBridge.database.getConversationMessages.invoke({
          conversation_id: conversationId,
          page: 0,
          pageSize: 10000,
        }),
        EXPORT_IO_TIMEOUT_MS,
        `getConversationMessages:${conversationId}`
      );
    } catch (error) {
      console.warn('[WorkspaceGroupedHistory] Export message fetch timeout/failure:', conversationId, error);
      return [];
    }
  }, []);

  const fetchConversationWorkspaceTree = useCallback(async (conversation: TChatConversation): Promise<IDirOrFile | undefined> => {
    const workspace = conversation.extra?.workspace;
    if (!workspace) {
      return undefined;
    }

    try {
      const trees = await withTimeout(
        ipcBridge.conversation.getWorkspace.invoke({
          conversation_id: conversation.id,
          workspace,
          path: workspace,
        }),
        EXPORT_IO_TIMEOUT_MS,
        `getWorkspace:${conversation.id}`
      );
      return trees?.[0];
    } catch (error) {
      console.warn('[WorkspaceGroupedHistory] Failed to read workspace for export:', conversation.id, error);
      return undefined;
    }
  }, []);

  const buildConversationExportFiles = useCallback(
    async (conversation: TChatConversation, topicFolderName: string): Promise<ExportZipFile[]> => {
      const [messages, workspaceTree] = await Promise.all([fetchConversationMessages(conversation.id), fetchConversationWorkspaceTree(conversation)]);
      const files: ExportZipFile[] = [
        {
          name: `${topicFolderName}/conversation/conversation.json`,
          content: buildConversationJson(conversation, messages),
        },
        {
          name: `${topicFolderName}/conversation/conversation.md`,
          content: buildConversationMarkdown(conversation, messages),
        },
      ];

      appendWorkspaceFilesToZip(files, workspaceTree, topicFolderName);
      return files;
    },
    [fetchConversationMessages, fetchConversationWorkspaceTree]
  );

  const runCreateZip = useCallback(async (path: string, files: ExportZipFile[], requestId: string): Promise<boolean> => {
    try {
      return await withTimeout(ipcBridge.fs.createZip.invoke({ path, files, requestId }), EXPORT_IO_TIMEOUT_MS * 8, `createZip:${requestId}`);
    } catch (error) {
      // Ensure background zip task is stopped when renderer-side timeout/cancel happens.
      void ipcBridge.fs.cancelZip.invoke({ requestId });
      throw error;
    }
  }, []);

  const handleExportConversation = useCallback(
    (conversation: TChatConversation) => {
      void openExportModal({ mode: 'single', conversation });
    },
    [openExportModal]
  );

  const handleBatchExport = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }
    void openExportModal({
      mode: 'batch',
      conversationIds: Array.from(selectedConversationIds),
    });
  }, [openExportModal, selectedConversationIds, t]);

  const handleConfirmExport = useCallback(async () => {
    if (!exportTask) return;

    const directory = exportTargetPath.trim();
    if (!directory) {
      Message.warning(t('conversation.history.exportSelectFolder'));
      return;
    }

    setExportModalLoading(true);
    exportCanceledRef.current = false;
    const requestId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCurrentExportRequestId(requestId);

    const throwIfCanceled = () => {
      if (exportCanceledRef.current) {
        throw new Error('export canceled');
      }
    };

    try {
      if (exportTask.mode === 'single') {
        throwIfCanceled();
        const conversation = exportTask.conversation;
        const shortTopicName = sanitizeFileName(conversation.name || conversation.id).slice(0, 40) || 'topic';
        const zipFileName = `${shortTopicName}-${formatTimestamp()}`;
        const exportPath = await createUniqueFilePath(directory, zipFileName, 'zip');
        throwIfCanceled();
        const topicFolderName = buildTopicFolderName(conversation);
        const files = await buildConversationExportFiles(conversation, topicFolderName);
        throwIfCanceled();
        const success = await runCreateZip(exportPath, files, requestId);
        throwIfCanceled();

        if (success) {
          Message.success(t('conversation.history.exportSuccess'));
          setExportModalVisible(false);
          setExportTask(null);
          setExportTargetPath('');
          setCurrentExportRequestId(null);
        } else {
          Message.error(t('conversation.history.exportFailed'));
        }
        return;
      }

      const selectedConversations = conversations.filter((conversation) => exportTask.conversationIds.includes(conversation.id));
      if (selectedConversations.length === 0) {
        Message.warning(t('conversation.history.batchNoSelection'));
        return;
      }

      const files: ExportZipFile[] = [];
      for (const conversation of selectedConversations) {
        throwIfCanceled();
        const topicFiles = await buildConversationExportFiles(conversation, buildTopicFolderName(conversation));
        throwIfCanceled();
        files.push(...topicFiles);
      }
      const exportPath = await createUniqueFilePath(directory, `batch-export-${formatTimestamp()}`, 'zip');
      throwIfCanceled();
      const success = await runCreateZip(exportPath, files, requestId);
      throwIfCanceled();

      if (success) {
        Message.success(t('conversation.history.exportSuccess'));
        setSelectedConversationIds(new Set());
        onBatchModeChange?.(false);
        setExportModalVisible(false);
        setExportTask(null);
        setExportTargetPath('');
        setCurrentExportRequestId(null);
      } else {
        Message.error(t('conversation.history.exportFailed'));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('canceled')) {
        Message.warning(t('conversation.history.exportCanceled'));
      } else {
        console.error('Failed to export conversations:', error);
        Message.error(t('conversation.history.exportFailed'));
      }
    } finally {
      setExportModalLoading(false);
      setCurrentExportRequestId(null);
      exportCanceledRef.current = false;
    }
  }, [buildConversationExportFiles, conversations, createUniqueFilePath, exportTargetPath, exportTask, onBatchModeChange, runCreateZip, t]);

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);

      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinnedAt: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          mergeExtra: true,
        });

        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleMenuVisibleChange = useCallback((conversationId: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversationId : null);
  }, []);

  const handleOpenMenu = useCallback(
    (conversation: TChatConversation) => {
      if (id !== conversation.id) {
        handleConversationClick(conversation);
      }
      setDropdownVisibleId(conversation.id);
    },
    [handleConversationClick, id]
  );

  const renderConversation = (conversation: TChatConversation) => {
    const rowProps: ConversationRowProps = {
      conversation,
      collapsed,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onDelete: handleDeleteClick,
      onExport: handleExportConversation,
      onTogglePin: handleTogglePin,
    };

    return <ConversationRow key={conversation.id} {...rowProps} />;
  };

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
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
      <Modal title={t('conversation.history.renameTitle')} visible={renameModalVisible} onOk={handleRenameConfirm} onCancel={handleRenameCancel} okText={t('conversation.history.saveName')} cancelText={t('conversation.history.cancelEdit')} confirmLoading={renameLoading} okButtonProps={{ disabled: !renameModalName.trim() }} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
        <Input autoFocus value={renameModalName} onChange={setRenameModalName} onPressEnter={handleRenameConfirm} placeholder={t('conversation.history.renamePlaceholder')} allowClear />
      </Modal>

      <Modal visible={exportModalVisible} title={t('conversation.history.exportDialogTitle')} onCancel={closeExportModal} footer={null} style={{ borderRadius: '12px' }} className='conversation-export-modal' alignCenter getPopupContainer={() => document.body}>
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>{exportTask?.mode === 'batch' ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversationIds.length }) : t('conversation.history.exportDialogSingleDescription')}</div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span className='text-14px overflow-hidden text-ellipsis whitespace-nowrap' style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}>
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <span>💡</span>
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal visible={showExportDirectorySelector} onConfirm={handleSelectExportDirectoryFromModal} onCancel={() => setShowExportDirectorySelector(false)} />

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>{t('conversation.history.selectedCount', { count: selectedCount })}</div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' type='secondary' onClick={handleToggleSelectAll}>
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' type='secondary' onClick={handleBatchExport}>
                {t('conversation.history.batchExport')}
              </Button>
              <Button className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' status='warning' onClick={handleBatchDelete}>
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className='size-full overflow-y-auto overflow-x-hidden'>
        {pinnedConversations.length > 0 && (
          <div className='mb-8px min-w-0'>
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{t('conversation.history.pinnedSection')}</div>}
            <div className='min-w-0'>{pinnedConversations.map((conversation) => renderConversation(conversation))}</div>
          </div>
        )}

        {timelineSections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{section.timeline}</div>}

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
                      <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-4px': !collapsed })}>{group.conversations.map((conversation) => renderConversation(conversation))}</div>
                    </WorkspaceCollapse>
                  </div>
                );
              }

              if (item.type === 'conversation' && item.conversation) {
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
