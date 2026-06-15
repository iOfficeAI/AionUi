/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Input,
  Button,
  Message,
  Modal,
  Avatar,
  Tooltip,
  Form,
  Spin,
  Dropdown,
  Menu,
} from '@arco-design/web-react';
import {
  Plus,
  Search,
  Star,
  Delete,
  Edit,
  Share,
  Lock,
  FileText,
  Picture,
  Video as VideoIcon,
  FilePdf,
  FileWord,
  FileExcel,
  FilePpt,
  Folder as FolderIcon,
  Time,
  Right as ArrowRight,
  Down as ArrowDown,
  Close,
  More,
  Wifi,
  MoveOne,
  Exchange,
  SettingTwo,
} from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ILibraryItem, LibraryFileType, LibraryFilter } from '@/common/types/library';
import NotionEditor from './NotionEditor';
import MediaCategoryView from './MediaCategoryView';

// Map file types to appropriate icons matching the image style
const getFileTypeIcon = (type: LibraryFileType) => {
  const iconProps = { theme: 'outline' as const, size: '14', className: 'mr-8px shrink-0 text-[#8c8c8c]' };
  switch (type) {
    case 'markdown':
      return <FileText {...iconProps} fill='#e3e3e3' />;
    case 'pdf':
      return <FilePdf {...iconProps} fill='#FF4D4F' />;
    case 'image':
      return <Picture {...iconProps} fill='#52C41A' />;
    case 'video':
      return <VideoIcon {...iconProps} fill='#722ED1' />;
    case 'document':
      return <FileWord {...iconProps} fill='#1890FF' />;
    case 'spreadsheet':
      return <FileExcel {...iconProps} fill='#389E0D' />;
    case 'presentation':
      return <FilePpt {...iconProps} fill='#D4380D' />;
    default:
      return <FileText {...iconProps} fill='#e3e3e3' />;
  }
};

interface ITab {
  id: string; // 'dashboard' or the ILibraryItem's ID
  title: string;
  icon?: string;
  item?: ILibraryItem;
}

const LibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTabFilter, setActiveTabFilter] = useState<LibraryFilter>('recents');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [items, setItems] = useState<ILibraryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Tabs management (browser-style tabs)
  const [openTabs, setOpenTabs] = useState<ITab[]>([
    { id: 'dashboard', title: 'Library Dashboard' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('dashboard');

  // Per-page state tracked in the tab bar
  const [pageFavorites, setPageFavorites] = useState<Record<string, boolean>>({});
  const [pagePrivate, setPagePrivate] = useState<Record<string, boolean>>({});
  const [pageShared, setPageShared] = useState<Record<string, boolean>>({});
  const [pageOffline, setPageOffline] = useState<Record<string, boolean>>({});
  const [pageLocked, setPageLocked] = useState<Record<string, boolean>>({});

  // Expanded pages keys for hierarchy tree
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

  // Modals visibility
  const [isRenameModalVisible, setIsRenameModalVisible] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<ILibraryItem | null>(null);

  // Forms
  const [renameForm] = Form.useForm();

  // Load all library items (both root and nested to build tree hierarchy)
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const results = await ipcBridge.library.listItems.invoke({
        filter: activeTabFilter,
        keyword: searchKeyword,
      });
      setItems(results);
    } catch (err) {
      console.error('[LibraryPage] Failed to fetch items:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTabFilter, searchKeyword]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Construct Hierarchical Tree Data matching Notion's Pages/Subpages structure
  const treeData = useMemo(() => {
    const itemMap = new Map<string, any>();
    
    // Create node mapping
    items.forEach((item) => {
      itemMap.set(item.id, {
        ...item,
        key: item.id,
        isFolder: false,
        children: [],
      });
    });

    const rootNodes: any[] = [];

    // Link parent-children hierarchy
    items.forEach((item) => {
      const node = itemMap.get(item.id);
      if (item.parentId && itemMap.has(item.parentId)) {
        const parentNode = itemMap.get(item.parentId);
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // Cleanup empty children arrays so Arco Table doesn't show expand arrow needlessly
    const cleanEmptyChildren = (nodes: any[]) => {
      nodes.forEach((node) => {
        if (node.children.length === 0) {
          delete node.children;
        } else {
          cleanEmptyChildren(node.children);
        }
      });
    };
    cleanEmptyChildren(rootNodes);

    return rootNodes;
  }, [items]);

  // Tab Action Handlers
  const handleOpenItemInTab = (item: ILibraryItem) => {
    // Check if tab already open
    const isAlreadyOpen = openTabs.some((tab) => tab.id === item.id);
    if (!isAlreadyOpen) {
      const pageIcon = localStorage.getItem(`note_icon_${item.id}`) || '📝';
      setOpenTabs((prev) => [
        ...prev,
        { id: item.id, title: item.name, icon: pageIcon, item },
      ]);
    }
    setActiveTabId(item.id);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Cannot close dashboard if it's the last one
    if (tabId === 'dashboard' && openTabs.length === 1) return;

    const activeIndex = openTabs.findIndex((t) => t.id === activeTabId);
    const tabIndex = openTabs.findIndex((t) => t.id === tabId);
    
    const nextTabs = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(nextTabs);

    if (activeTabId === tabId) {
      // Switch active tab to adjacent or dashboard
      if (nextTabs.length > 0) {
        const nextActiveIndex = Math.max(0, tabIndex - 1);
        setActiveTabId(nextTabs[nextActiveIndex].id);
      } else {
        setOpenTabs([{ id: 'dashboard', title: 'Library Dashboard' }]);
        setActiveTabId('dashboard');
      }
    }
  };

  const handleCreateNewPage = async (parentId?: string): Promise<ILibraryItem | null> => {
    try {
      const newItem = await ipcBridge.library.addItem.invoke({
        name: 'Untitled Page',
        fileType: 'markdown',
        content: '# Untitled Page\n\nStart writing...',
        parentId: parentId,
      });
      void loadItems();
      handleOpenItemInTab(newItem);
      return newItem;
    } catch (err) {
      console.error('[LibraryPage] New page creation failed:', err);
      return null;
    }
  };

  const handleDeleteItem = (record: any) => {
    Modal.confirm({
      title: 'Delete Page?',
      content: `Are you sure you want to delete "${record.name}"? This will delete all subpages.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await ipcBridge.library.deleteItem.invoke({ id: record.id });
          
          // Close corresponding tab if open
          setOpenTabs((prev) => prev.filter((t) => t.id !== record.id));
          if (activeTabId === record.id) {
            setActiveTabId('dashboard');
          }
          
          void loadItems();
          Message.success('Deleted successfully');
        } catch (err) {
          console.error('[LibraryPage] Deletion failed:', err);
        }
      },
    });
  };

  const handleRenameItem = async () => {
    if (!selectedItem) return;
    try {
      const values = await renameForm.validate();
      const success = await ipcBridge.library.updateItem.invoke({
        id: selectedItem.id,
        updates: { name: values.name },
      });
      if (success) {
        setIsRenameModalVisible(false);
        setSelectedItem(null);
        renameForm.resetFields();
        Message.success('Item renamed successfully');
        
        // Update tab title dynamically if open
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === selectedItem.id ? { ...t, title: values.name } : t))
        );

        void loadItems();
      }
    } catch (err) {
      console.error('[LibraryPage] Rename failed:', err);
    }
  };

  // Table Columns
  const columns = [
    {
      title: 'Page name',
      dataIndex: 'name',
      render: (name: string, record: any) => {
        const pageIcon = localStorage.getItem(`note_icon_${record.id}`) || '';
        const icon = pageIcon ? (
          <span className="mr-8px shrink-0 text-14px">{pageIcon}</span>
        ) : (
          getFileTypeIcon(record.fileType)
        );

        return (
          <div
            className='flex items-center group/cell select-none cursor-pointer'
            onClick={() => handleOpenItemInTab(record)}
          >
            {icon}
            <span className="text-13px text-[#e3e3e3] hover:text-[#007fff] transition-colors truncate max-w-320px font-medium">
              {name}
            </span>

            {/* Hover Actions */}
            <div className='opacity-0 group-hover/cell:opacity-100 flex items-center gap-6px ml-12px transition-opacity duration-150'>
              <Tooltip content='Create Subpage'>
                <Button
                  type='text'
                  size='mini'
                  shape='circle'
                  icon={<Plus theme='outline' size='12' />}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCreateNewPage(record.id);
                  }}
                />
              </Tooltip>
              <Tooltip content='Rename'>
                <Button
                  type='text'
                  size='mini'
                  shape='circle'
                  icon={<Edit theme='outline' size='12' />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(record);
                    renameForm.setFieldsValue({ name: record.name });
                    setIsRenameModalVisible(true);
                  }}
                />
              </Tooltip>
              <Tooltip content='Delete'>
                <Button
                  type='text'
                  size='mini'
                  shape='circle'
                  status='danger'
                  icon={<Delete theme='outline' size='12' />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(record);
                  }}
                />
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Created by',
      dataIndex: 'createdBy',
      width: 160,
      render: () => (
        <div className='flex items-center gap-6px'>
          <Avatar size={20} className='bg-[#007fff] text-white shrink-0'>
            V
          </Avatar>
          <span className='text-12px text-[#a0a0a0] font-medium'>vasi catalin</span>
        </div>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 180,
      render: (source: string, record: any) => {
        let displaySource = source || 'Private';
        let isPrivate = record.private;
        let isShared = record.shared;

        if (isPrivate) {
          return (
            <div className='inline-flex items-center gap-6px px-8px py-2px rd-12px bg-[#2d2d2d] text-[#a0a0a0] text-11px font-medium'>
              <Lock theme='outline' size='10' />
              <span>Private</span>
            </div>
          );
        }

        if (isShared) {
          return (
            <div className='inline-flex items-center gap-6px px-8px py-2px rd-12px bg-[#007fff]/10 text-[#007fff] text-11px font-medium'>
              <Share theme='outline' size='10' />
              <span>Shared</span>
            </div>
          );
        }

        return (
          <div className='inline-flex items-center gap-6px px-8px py-2px rd-12px bg-[#262626] text-[#e3e3e3] text-11px font-medium'>
            <FileText theme='outline' size='10' />
            <span>{displaySource}</span>
          </div>
        );
      },
    },
    {
      title: 'Last edited time',
      dataIndex: 'lastOpenedAt',
      width: 160,
      render: (time: number) => {
        if (!time) return 'Just now';
        const date = new Date(time);
        return <span className='text-12px text-[#8c8c8c]'>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>;
      },
    },
    {
      title: 'Last view',
      dataIndex: 'createdAt',
      width: 140,
      render: () => {
        return <span className='text-12px text-[#8c8c8c]'>Just now</span>;
      },
    },
  ];

  // Find active tab item
  const currentActiveTab = openTabs.find((t) => t.id === activeTabId);

  // ── Tab-bar page actions ──────────────────────────────────────────────────
  const handleTabFavoriteToggle = async (pageId: string) => {
    try {
      const success = await ipcBridge.library.toggleFavorite.invoke({ id: pageId });
      if (success) {
        setPageFavorites((prev) => {
          const next = !prev[pageId];
          Message.success(next ? 'Added to favorites' : 'Removed from favorites');
          return { ...prev, [pageId]: next };
        });
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleTabMenuAction = async (key: string, pageId: string) => {
    switch (key) {
      case 'private': {
        const success = await ipcBridge.library.togglePrivate.invoke({ id: pageId });
        if (success) {
          setPagePrivate((prev) => ({ ...prev, [pageId]: true }));
          setPageShared((prev) => ({ ...prev, [pageId]: false }));
          Message.success('Page set to Private');
        }
        break;
      }
      case 'offline':
        setPageOffline((prev) => {
          const next = !prev[pageId];
          Message.success(next ? 'Offline mode enabled' : 'Online mode enabled');
          return { ...prev, [pageId]: next };
        });
        break;
      case 'share': {
        const success = await ipcBridge.library.toggleShared.invoke({ id: pageId });
        if (success) {
          setPageShared((prev) => ({ ...prev, [pageId]: true }));
          setPagePrivate((prev) => ({ ...prev, [pageId]: false }));
          Message.success('Page is now Shared');
        }
        break;
      }
      case 'delete': {
        const tab = openTabs.find((t) => t.id === pageId);
        if (tab?.item) handleDeleteItem(tab.item);
        break;
      }
      case 'move':
        Message.info('Move — coming soon');
        break;
      case 'transfer':
        Message.info('Transfer — coming soon');
        break;
      case 'lock':
        // Dispatch event to the NotionEditor instance
        window.dispatchEvent(new Event(`notion-lock-toggle-${pageId}`));
        setPageLocked((prev) => ({ ...prev, [pageId]: !prev[pageId] }));
        break;
      case 'option':
        Message.info('Options — coming soon');
        break;
      default:
        break;
    }
  };

  return (
    <div className='w-full h-full flex flex-col bg-[#191919] text-[#e3e3e3] select-none box-border overflow-hidden'>
      {/* ── Tab bar (browser-style) ─────────────────────────────────── */}
      <div className="h-44px shrink-0 flex items-center bg-[#141414] border-b border-[#2d2d2d] px-8px overflow-hidden">
        {/* Tabs list — scrollable, takes remaining space */}
        <div className="flex items-center gap-4px overflow-x-auto no-scrollbar flex-1 h-full">
          {openTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-8px px-12px h-34px rounded-t-8px cursor-pointer border-r border-[#242424] transition-all relative shrink-0 ${
                  isActive
                    ? 'bg-[#191919] text-[#e3e3e3] border-t-2 border-t-[#007fff] font-medium'
                    : 'text-[#8c8c8c] hover:bg-[#202020] hover:text-[#e3e3e3]'
                }`}
                style={{ minWidth: '120px', maxWidth: '180px' }}
              >
                {tab.icon && <span className="text-12px">{tab.icon}</span>}
                <span className="text-12px truncate flex-1">{tab.title}</span>
                {(openTabs.length > 1 || tab.id !== 'dashboard') && (
                  <Close
                    theme="outline"
                    size="10"
                    className="p-2px rounded-full hover:bg-[#2d2d2d] hover:text-white shrink-0"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                  />
                )}
              </div>
            );
          })}

          {/* New tab/page dropdown button */}
          <Dropdown
            droplist={
              <Menu
                className="notion-dots-menu"
                onClickMenuItem={(key) => {
                  if (key === 'new-root') void handleCreateNewPage();
                  else if (key === 'new-sub' && activeTabId !== 'dashboard') void handleCreateNewPage(activeTabId);
                  else if (key === 'dashboard') {
                    const isDashOpen = openTabs.some((t) => t.id === 'dashboard');
                    if (!isDashOpen) setOpenTabs((prev) => [...prev, { id: 'dashboard', title: 'Library Dashboard' }]);
                    setActiveTabId('dashboard');
                  }
                }}
              >
                <Menu.Item key='new-root'>
                  <span className="flex items-center gap-6px text-12px">
                    <Plus theme="outline" size="12" /><span>New Page</span>
                  </span>
                </Menu.Item>
                {activeTabId !== 'dashboard' && (
                  <Menu.Item key='new-sub'>
                    <span className="flex items-center gap-6px text-12px">
                      <Plus theme="outline" size="12" /><span>New Subpage</span>
                    </span>
                  </Menu.Item>
                )}
                <Menu.Item key='dashboard'><span className="text-12px">Go to Dashboard</span></Menu.Item>
              </Menu>
            }
            trigger='click'
            position='bottom'
          >
            <Tooltip content="New page">
              <Button
                type="text"
                size="mini"
                shape="circle"
                className="ml-4px text-[#8c8c8c] hover:text-white"
                icon={<Plus theme="outline" size="14" />}
              />
            </Tooltip>
          </Dropdown>
        </div>

        {/* Right side: Star + Three-dots — shown only when a page is open */}
        {activeTabId !== 'dashboard' && (
          <div className="flex items-center gap-4px pl-8px border-l border-[#2d2d2d] ml-4px shrink-0">
            {/* Favorite star */}
            <Tooltip content={pageFavorites[activeTabId] ? 'Remove from favorites' : 'Add to favorites'}>
              <Button
                type="text"
                shape="circle"
                size="mini"
                className="text-[#707070] hover:text-[#e3e3e3] hover:bg-[#2d2d2d] transition-colors"
                icon={
                  <Star
                    theme={pageFavorites[activeTabId] ? 'filled' : 'outline'}
                    fill={pageFavorites[activeTabId] ? '#FFC72C' : 'currentColor'}
                    size="14"
                  />
                }
                onClick={() => void handleTabFavoriteToggle(activeTabId)}
              />
            </Tooltip>

            {/* Three-dots menu */}
            <Dropdown
              droplist={
                <Menu
                  className="notion-dots-menu"
                  onClickMenuItem={(key) => void handleTabMenuAction(key, activeTabId)}
                >
                  <Menu.Item key="private">
                    <span className="flex items-center gap-8px text-12px">
                      <Lock theme={pagePrivate[activeTabId] ? 'filled' : 'outline'} size="13"
                        fill={pagePrivate[activeTabId] ? '#FFC72C' : 'currentColor'} />
                      <span>Private</span>
                      {pagePrivate[activeTabId] && <span className="ml-auto text-10px opacity-60">✓</span>}
                    </span>
                  </Menu.Item>
                  <Menu.Item key="offline">
                    <span className="flex items-center gap-8px text-12px">
                      <Wifi theme={pageOffline[activeTabId] ? 'filled' : 'outline'} size="13"
                        fill={pageOffline[activeTabId] ? '#52C41A' : 'currentColor'} />
                      <span>Offline</span>
                      {pageOffline[activeTabId] && <span className="ml-auto text-10px opacity-60">✓</span>}
                    </span>
                  </Menu.Item>
                  <Menu.Item key="share">
                    <span className="flex items-center gap-8px text-12px">
                      <Share theme={pageShared[activeTabId] ? 'filled' : 'outline'} size="13"
                        fill={pageShared[activeTabId] ? '#007fff' : 'currentColor'} />
                      <span>Share</span>
                      {pageShared[activeTabId] && <span className="ml-auto text-10px opacity-60">✓</span>}
                    </span>
                  </Menu.Item>
                  <hr style={{ borderColor: '#2d2d2d', margin: '4px 8px' }} />
                  <Menu.Item key="lock">
                    <span className="flex items-center gap-8px text-12px">
                      <Lock theme={pageLocked[activeTabId] ? 'filled' : 'outline'} size="13"
                        fill={pageLocked[activeTabId] ? '#FF6B35' : 'currentColor'} />
                      <span>{pageLocked[activeTabId] ? 'Unlock page' : 'Lock page'}</span>
                    </span>
                  </Menu.Item>
                  <hr style={{ borderColor: '#2d2d2d', margin: '4px 8px' }} />
                  <Menu.Item key="move">
                    <span className="flex items-center gap-8px text-12px">
                      <MoveOne theme="outline" size="13" /><span>Move</span>
                    </span>
                  </Menu.Item>
                  <Menu.Item key="transfer">
                    <span className="flex items-center gap-8px text-12px">
                      <Exchange theme="outline" size="13" /><span>Transfer</span>
                    </span>
                  </Menu.Item>
                  <hr style={{ borderColor: '#2d2d2d', margin: '4px 8px' }} />
                  <Menu.Item key="delete">
                    <span className="flex items-center gap-8px text-12px text-[#ff4d4f]">
                      <Delete theme="outline" size="13" /><span>Delete</span>
                    </span>
                  </Menu.Item>
                  <Menu.Item key="option">
                    <span className="flex items-center gap-8px text-12px">
                      <SettingTwo theme="outline" size="13" /><span>Options</span>
                    </span>
                  </Menu.Item>
                </Menu>
              }
              trigger="click"
              position="bottomRight"
            >
              <Tooltip content="More actions">
                <Button
                  type="text"
                  shape="circle"
                  size="mini"
                  className="text-[#707070] hover:text-[#e3e3e3] hover:bg-[#2d2d2d] transition-colors"
                  icon={<More size="14" />}
                />
              </Tooltip>
            </Dropdown>
          </div>
        )}
      </div>

      {/* 2. Main Page Render Area depending on active tab */}
      {currentActiveTab && currentActiveTab.id !== 'dashboard' && currentActiveTab.item ? (
        <div className="flex-1 overflow-hidden">
          <NotionEditor
            item={currentActiveTab.item}
            onBack={() => {
              setActiveTabId('dashboard');
              void loadItems();
            }}
            onRename={(newName) => {
              setOpenTabs((prev) =>
                prev.map((t) => (t.id === currentActiveTab.id ? { ...t, title: newName } : t))
              );
              void loadItems();
            }}
            onDelete={() => {
              handleDeleteItem(currentActiveTab.item);
            }}
            onCreateSubpage={async (parentId) => {
              try {
                const newItem = await ipcBridge.library.addItem.invoke({
                  name: 'Untitled Page',
                  fileType: 'markdown',
                  content: '# Untitled Page\n\nStart writing...',
                  parentId: parentId,
                });
                void loadItems();
                // Add tab but don't switch to it — user stays on current page
                const isAlreadyOpen = openTabs.some((tab) => tab.id === newItem.id);
                if (!isAlreadyOpen) {
                  const pageIcon = localStorage.getItem(`note_icon_${newItem.id}`) || '📝';
                  setOpenTabs((prev) => [
                    ...prev,
                    { id: newItem.id, title: newItem.name, icon: pageIcon, item: newItem },
                  ]);
                }
                return newItem;
              } catch (err) {
                console.error('[LibraryPage] Subpage creation failed:', err);
                return null;
              }
            }}
            onOpenSubpage={(subItem) => {
              handleOpenItemInTab(subItem);
            }}
          />
        </div>
      ) : (
        /* Library Dashboard View */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Title Section */}
          <div className='px-24px pt-20px pb-12px shrink-0 flex items-center justify-between'>
            <h1 className='text-32px font-bold text-[#e3e3e3] m-0 leading-40px'>Library</h1>
            <div className='flex items-center gap-12px'>
              {(activeTabFilter === 'recents' || activeTabFilter === 'favorites' || activeTabFilter === 'artifacts') && (
                <Button
                  type='primary'
                  className='!bg-[#007fff] !hover:bg-[#0066cc] rd-6px font-semibold text-13px !h-32px'
                  icon={<Plus theme='outline' size='14' />}
                  onClick={() => void handleCreateNewPage()}
                >
                  New page
                </Button>
              )}
            </div>
          </div>

          {/* Sub-header Filter Pills & Search */}
          <div className='px-24px py-8px shrink-0 flex items-center justify-between border-b border-[#2d2d2d] bg-[#191919]'>
            <div className='flex items-center gap-8px overflow-x-auto no-scrollbar py-2px'>
              <Button
                type={activeTabFilter === 'recents' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'recents' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<Time theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('recents')}
              >
                Recent
              </Button>
              <Button
                type={activeTabFilter === 'artifacts' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'artifacts' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<FileText theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('artifacts')}
              >
                Artifact
              </Button>
              <Button
                type={activeTabFilter === 'favorites' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'favorites' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<Star theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('favorites')}
              >
                Favorite
              </Button>
              <Button
                type={activeTabFilter === 'images' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'images' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<Picture theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('images')}
              >
                Images
              </Button>
              <Button
                type={activeTabFilter === 'videos' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'videos' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<VideoIcon theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('videos')}
              >
                Videos
              </Button>
              <Button
                type={activeTabFilter === 'pdfs' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'pdfs' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<FilePdf theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('pdfs')}
              >
                PDFs
              </Button>
              <Button
                type={activeTabFilter === 'docs' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'docs' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<FileWord theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('docs')}
              >
                Documents
              </Button>
              <Button
                type={activeTabFilter === 'others' ? 'primary' : 'text'}
                size='small'
                className={`rd-16px font-semibold text-13px !px-12px !h-28px flex items-center gap-6px ${
                  activeTabFilter === 'others' ? '!bg-[#2d2d2d] !text-[#e3e3e3] border-none' : 'text-[#8c8c8c] hover:text-[#e3e3e3]'
                }`}
                icon={<Lock theme='outline' size='13' />}
                onClick={() => setActiveTabFilter('others')}
              >
                Other
              </Button>
            </div>

            <div className='flex items-center gap-12px'>
              <Input
                className='w-200px rd-6px !bg-[#1c1c1c] !border-[#2d2d2d] text-[#e3e3e3] placeholder-[#555]'
                placeholder='Search...'
                suffix={<Search theme='outline' size='12' fill='#8c8c8c' />}
                value={searchKeyword}
                onChange={setSearchKeyword}
                allowClear
              />
            </div>
          </div>

          {/* Content area — switches between table (recents/favorites) and media grid */}
          <div className='flex-1 overflow-hidden bg-[#191919]'>
            {(activeTabFilter === 'images' || activeTabFilter === 'videos' || activeTabFilter === 'pdfs' || activeTabFilter === 'docs' || activeTabFilter === 'others') ? (
              <MediaCategoryView
                key={activeTabFilter}
                category={activeTabFilter}
                searchKeyword={searchKeyword}
              />
            ) : (
              /* Recents / Favorites — hierarchical tree table */
              <div className='p-24px box-border h-full overflow-auto'>
                {loading ? (
                  <div className='w-full h-full flex items-center justify-center'>
                    <Spin size={24} />
                  </div>
                ) : (
                  <Table
                    rowKey='id'
                    columns={columns}
                    data={treeData}
                    pagination={false}
                    border={false}
                    expandedRowKeys={expandedRowKeys}
                    onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
                    className='custom-tree-table'
                    scroll={{ y: true }}
                    noDataElement={
                      <div className='py-60px flex flex-col items-center justify-center text-[#8c8c8c] gap-12px'>
                        <FolderIcon theme='outline' size='40' fill='currentColor' />
                        <span className='text-13px font-medium'>No pages found</span>
                      </div>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      <Modal
        title='Rename Item'
        visible={isRenameModalVisible}
        onOk={handleRenameItem}
        onCancel={() => {
          setIsRenameModalVisible(false);
          setSelectedItem(null);
          renameForm.resetFields();
        }}
        autoFocus={false}
        focusLock={true}
        className='arco-dark'
      >
        <Form form={renameForm} layout='vertical'>
          <Form.Item
            label='New Name'
            field='name'
            rules={[{ required: true, message: 'Please input a name' }]}
          >
            <Input allowClear />
          </Form.Item>
        </Form>
      </Modal>

      {/* Styling Overrides */}
      <style>{`
        /* Premium Dark Table Styles */
        .custom-tree-table .arco-table-header {
          background-color: transparent !important;
          border-bottom: 1px solid #2d2d2d !important;
        }
        .custom-tree-table .arco-table-th {
          background-color: transparent !important;
          color: #8c8c8c !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 1px solid #2d2d2d !important;
          padding: 10px 16px !important;
        }
        .custom-tree-table .arco-table-tr {
          background-color: transparent !important;
        }
        .custom-tree-table .arco-table-td {
          background-color: transparent !important;
          color: #e3e3e3 !important;
          border-bottom: 1px solid #222222 !important;
          padding: 8px 16px !important;
        }
        .custom-tree-table .arco-table-tr:hover .arco-table-td {
          background-color: #222222 !important;
        }
        .custom-tree-table .arco-table-cell-expand-icon {
          color: #8c8c8c !important;
          margin-right: 8px !important;
          border: none !important;
          background: transparent !important;
        }
        .custom-tree-table .arco-table-cell-expand-icon:hover {
          color: #e3e3e3 !important;
          background-color: #2d2d2d !important;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Three-dots / dots menu styling */
        .notion-dots-menu {
          background: #242424 !important;
          border: 1px solid #333 !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3) !important;
          padding: 4px 0 !important;
          min-width: 200px !important;
        }
        .notion-dots-menu .arco-menu-item {
          color: #e3e3e3 !important;
          border-radius: 4px !important;
          margin: 2px 6px !important;
          padding: 6px 10px !important;
          transition: background 0.15s ease !important;
        }
        .notion-dots-menu .arco-menu-item:hover {
          background: #333 !important;
        }
      `}</style>
    </div>
  );
};

export default LibraryPage;
