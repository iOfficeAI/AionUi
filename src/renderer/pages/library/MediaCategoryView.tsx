/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Button,
  Input,
  Modal,
  Message,
  Dropdown,
  Menu,
  Spin,
  Tooltip,
} from '@arco-design/web-react';
import {
  Plus,
  Delete,
  Edit,
  FolderOpen,
  Folder as FolderIcon,
  UploadOne,
  More,
  Picture,
  Video as VideoIcon,
  FilePdf,
  FileWord,
  FileText,
  Right as ChevronRight,
} from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ILibraryFolder, ILibraryItem, LibraryFilter } from '@/common/types/library';

// ── Helpers ────────────────────────────────────────────────────────────────

function getAcceptStr(category: LibraryFilter): string {
  switch (category) {
    case 'images':
      return 'image/*';
    case 'videos':
      return 'video/*';
    case 'pdfs':
      return '.pdf';
    case 'docs':
      return '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp';
    default:
      return '*/*';
  }
}

function extToFileType(ext: string): string {
  const e = ext.toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(e)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v'].includes(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt'].includes(e)) return 'document';
  if (['xls', 'xlsx', 'ods'].includes(e)) return 'spreadsheet';
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'presentation';
  return 'other';
}

function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── File Card ──────────────────────────────────────────────────────────────

interface FileCardProps {
  item: ILibraryItem;
  folders: ILibraryFolder[];
  onDelete: (item: ILibraryItem) => void;
  onRename: (item: ILibraryItem) => void;
  onMove: (item: ILibraryItem, folderId: string | null) => void;
}

const FileCard: React.FC<FileCardProps> = ({ item, folders, onDelete, onRename, onMove }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (item.fileType === 'image' && item.filePath) {
      setImgSrc(`file://${item.filePath}`);
    }
  }, [item]);

  const fileIcon = () => {
    switch (item.fileType) {
      case 'image':   return <Picture theme="outline" size="28" fill="#52C41A" />;
      case 'video':   return <VideoIcon theme="outline" size="28" fill="#722ED1" />;
      case 'pdf':     return <FilePdf theme="outline" size="28" fill="#FF4D4F" />;
      case 'document':   return <FileWord theme="outline" size="28" fill="#1890FF" />;
      case 'spreadsheet': return <FileText theme="outline" size="28" fill="#389E0D" />;
      case 'presentation': return <FileText theme="outline" size="28" fill="#D4380D" />;
      default:        return <FileText theme="outline" size="28" fill="#8c8c8c" />;
    }
  };

  const otherFolders = folders.filter((f) => f.id !== item.folderId);

  const dropdownMenu = (
    <Menu className="media-context-menu">
      <Menu.Item key="rename" onClick={() => onRename(item)}>
        <div className="flex items-center gap-8px text-13px">
          <Edit theme="outline" size="13" />
          Rename
        </div>
      </Menu.Item>
      {otherFolders.length > 0 && (
        <Menu.SubMenu
          key="move"
          title={
            <div className="flex items-center gap-8px text-13px">
              <FolderOpen theme="outline" size="13" />
              Move to folder
            </div>
          }
        >
          {item.folderId && (
            <Menu.Item key="move-root" onClick={() => onMove(item, null)}>
              <span className="text-12px text-[#8c8c8c]">↑ Move to root</span>
            </Menu.Item>
          )}
          {otherFolders.map((f) => (
            <Menu.Item key={`move-${f.id}`} onClick={() => onMove(item, f.id)}>
              <span className="text-12px">{f.name}</span>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
      <Menu.Item key="delete" onClick={() => onDelete(item)}>
        <div className="flex items-center gap-8px text-13px text-red-400">
          <Delete theme="outline" size="13" />
          Delete
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <div className="media-file-card group relative flex flex-col rounded-10px overflow-hidden bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-all duration-200 cursor-default">
      {/* Thumbnail */}
      <div className="h-120px bg-[#161616] flex items-center justify-center overflow-hidden flex-shrink-0">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setImgSrc(null)}
          />
        ) : (
          <div className="flex flex-col items-center gap-6px opacity-60">
            {fileIcon()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-10px flex flex-col gap-2px flex-1">
        <p className="text-12px font-medium text-[#e3e3e3] truncate m-0 leading-18px" title={item.name}>
          {item.name}
        </p>
        <p className="text-10px text-[#666] m-0">{formatDate(item.createdAt)}</p>
      </div>

      {/* Hover actions overlay */}
      <div className="absolute top-6px right-6px opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <Dropdown droplist={dropdownMenu} trigger="click" position="bl">
          <button
            className="w-24px h-24px rounded-6px bg-[#000]/70 backdrop-blur-sm border border-[#3a3a3a] flex items-center justify-center text-[#ccc] hover:text-white hover:bg-[#007fff]/80 transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <More theme="outline" size="13" />
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

// ── Folder Card ─────────────────────────────────────────────────────────────

interface FolderCardProps {
  folder: ILibraryFolder;
  itemCount: number;
  onOpen: (folder: ILibraryFolder) => void;
  onRename: (folder: ILibraryFolder) => void;
  onDelete: (folder: ILibraryFolder) => void;
}

const FolderCard: React.FC<FolderCardProps> = ({ folder, itemCount, onOpen, onRename, onDelete }) => {
  const dropdownMenu = (
    <Menu className="media-context-menu">
      <Menu.Item key="rename" onClick={(e) => { onRename(folder); }}>
        <div className="flex items-center gap-8px text-13px">
          <Edit theme="outline" size="13" />
          Rename
        </div>
      </Menu.Item>
      <Menu.Item key="delete" onClick={() => onDelete(folder)}>
        <div className="flex items-center gap-8px text-13px text-red-400">
          <Delete theme="outline" size="13" />
          Delete folder
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <div
      className="media-folder-card group relative flex flex-col items-start p-14px rounded-10px bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#007fff]/40 hover:bg-[#1a1a2e] transition-all duration-200 cursor-pointer"
      onClick={() => onOpen(folder)}
    >
      <div className="flex items-center gap-10px w-full mb-8px">
        <div className="w-38px h-38px rounded-8px bg-[#007fff]/10 flex items-center justify-center flex-shrink-0">
          <FolderIcon theme="outline" size="20" fill="#007fff" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-13px font-semibold text-[#e3e3e3] truncate m-0 leading-18px" title={folder.name}>
            {folder.name}
          </p>
          <p className="text-11px text-[#666] m-0">
            {itemCount} {itemCount === 1 ? 'file' : 'files'}
          </p>
        </div>
      </div>

      {/* Hover action */}
      <div className="absolute top-8px right-8px opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <Dropdown droplist={dropdownMenu} trigger="click" position="bl">
          <button
            className="w-22px h-22px rounded-6px bg-[#2a2a2a] flex items-center justify-center text-[#8c8c8c] hover:text-white hover:bg-[#3a3a3a] transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <More theme="outline" size="12" />
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

interface MediaCategoryViewProps {
  category: LibraryFilter;
  searchKeyword: string;
}

const categoryLabel: Record<LibraryFilter, string> = {
  images: 'Images',
  videos: 'Videos',
  pdfs: 'PDFs',
  docs: 'Documents',
  others: 'Other Files',
  recents: 'Recent',
  favorites: 'Favorites',
  notes: 'Notes',
};

const categoryIcon: Record<string, React.ReactNode> = {
  images: <Picture theme="outline" size="16" fill="#52C41A" />,
  videos: <VideoIcon theme="outline" size="16" fill="#722ED1" />,
  pdfs: <FilePdf theme="outline" size="16" fill="#FF4D4F" />,
  docs: <FileWord theme="outline" size="16" fill="#1890FF" />,
  others: <FileText theme="outline" size="16" fill="#8c8c8c" />,
};

const MediaCategoryView: React.FC<MediaCategoryViewProps> = ({ category, searchKeyword }) => {
  const [folders, setFolders] = useState<ILibraryFolder[]>([]);
  const [items, setItems] = useState<ILibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<ILibraryFolder | null>(null);

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ── Data Loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [foldersResult, itemsResult] = await Promise.all([
        ipcBridge.library.listFolders.invoke({ category }),
        ipcBridge.library.listItems.invoke({ filter: category, keyword: searchKeyword }),
      ]);
      setFolders(foldersResult);
      setItems(itemsResult);
    } catch (err) {
      console.error('[MediaCategoryView] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [category, searchKeyword]);

  useEffect(() => {
    setActiveFolderId(null);
    setActiveFolder(null);
    void loadData();
  }, [category]);

  useEffect(() => {
    void loadData();
  }, [searchKeyword]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const visibleItems = activeFolderId
    ? items.filter((i) => i.folderId === activeFolderId)
    : items.filter((i) => !i.folderId);

  const folderItemCounts = folders.reduce<Record<string, number>>((acc, folder) => {
    acc[folder.id] = items.filter((i) => i.folderId === folder.id).length;
    return acc;
  }, {});

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleOpenFolder = (folder: ILibraryFolder) => {
    setActiveFolderId(folder.id);
    setActiveFolder(folder);
  };

  const handleGoBack = () => {
    setActiveFolderId(null);
    setActiveFolder(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await ipcBridge.library.createFolder.invoke({ name: newFolderName.trim(), category });
      setShowNewFolderModal(false);
      setNewFolderName('');
      Message.success('Folder created');
      void loadData();
    } catch (err) {
      Message.error('Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = (folder: ILibraryFolder) => {
    Modal.confirm({
      title: 'Delete Folder?',
      content: `Delete "${folder.name}"? Files inside will be moved to root.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        await ipcBridge.library.deleteFolder.invoke({ id: folder.id });
        if (activeFolderId === folder.id) handleGoBack();
        Message.success('Folder deleted');
        void loadData();
      },
    });
  };

  const handleRenameFolder = (folder: ILibraryFolder) => {
    setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
    setRenameName(folder.name);
  };

  const handleDeleteFile = (item: ILibraryItem) => {
    Modal.confirm({
      title: 'Delete File?',
      content: `Delete "${item.name}"? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        await ipcBridge.library.deleteItem.invoke({ id: item.id });
        Message.success('File deleted');
        void loadData();
      },
    });
  };

  const handleRenameFile = (item: ILibraryItem) => {
    setRenameTarget({ type: 'file', id: item.id, name: item.name });
    setRenameName(item.name);
  };

  const handleMoveFile = async (item: ILibraryItem, folderId: string | null) => {
    await ipcBridge.library.moveItem.invoke({ id: item.id, folderId });
    Message.success(folderId ? 'Moved to folder' : 'Moved to root');
    void loadData();
  };

  const handleConfirmRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    try {
      if (renameTarget.type === 'folder') {
        await ipcBridge.library.renameFolder.invoke({ id: renameTarget.id, name: renameName.trim() });
        if (activeFolder?.id === renameTarget.id) {
          setActiveFolder((prev) => prev ? { ...prev, name: renameName.trim() } : prev);
        }
      } else {
        await ipcBridge.library.updateItem.invoke({ id: renameTarget.id, updates: { name: renameName.trim() } });
      }
      Message.success('Renamed successfully');
      setRenameTarget(null);
      void loadData();
    } catch {
      Message.error('Rename failed');
    }
  };

  // ── File Upload ──────────────────────────────────────────────────────────

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    let successCount = 0;
    for (const file of files) {
      try {
        // Electron exposes `path` on File objects in the renderer
        const filePath = (file as any).path as string;
        const ext = file.name.lastIndexOf('.') !== -1 ? file.name.slice(file.name.lastIndexOf('.')) : '';
        const fileType = extToFileType(ext);

        await ipcBridge.library.addItem.invoke({
          name: file.name,
          fileType,
          sourcePath: filePath,
          folderId: activeFolderId ?? undefined,
        });
        successCount++;
      } catch (err) {
        console.error('[MediaCategoryView] Upload failed for', file.name, err);
      }
    }

    if (successCount > 0) {
      Message.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
      void loadData();
    }

    // Reset input so same file can be re-selected
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spin size={28} />
      </div>
    );
  }

  const isInsideFolder = !!activeFolderId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-24px pt-16px pb-12px shrink-0 flex items-center justify-between border-b border-[#242424]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-8px">
          {categoryIcon[category]}
          <span
            className={`text-14px font-semibold ${isInsideFolder ? 'text-[#8c8c8c] cursor-pointer hover:text-[#e3e3e3] transition-colors' : 'text-[#e3e3e3]'}`}
            onClick={isInsideFolder ? handleGoBack : undefined}
          >
            {categoryLabel[category]}
          </span>
          {isInsideFolder && activeFolder && (
            <>
              <ChevronRight theme="outline" size="12" fill="#555" />
              <span className="text-14px font-semibold text-[#e3e3e3]">{activeFolder.name}</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-8px">
          {!isInsideFolder && (
            <Tooltip content="New folder">
              <Button
                size="small"
                type="outline"
                className="!border-[#2d2d2d] !text-[#a0a0a0] hover:!border-[#007fff] hover:!text-[#007fff] rd-8px !h-30px !px-10px"
                icon={<FolderIcon theme="outline" size="13" />}
                onClick={() => setShowNewFolderModal(true)}
              >
                New folder
              </Button>
            </Tooltip>
          )}
          <Button
            size="small"
            type="primary"
            className="!bg-[#007fff] hover:!bg-[#0066cc] rd-8px !h-30px !px-12px font-semibold"
            icon={<UploadOne theme="outline" size="13" />}
            onClick={handleUploadClick}
          >
            Upload
          </Button>
        </div>
      </div>

      {/* Hidden upload input */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={getAcceptStr(category)}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-24px py-16px media-scrollbar">
        {/* Folders section (only at root level) */}
        {!isInsideFolder && folders.length > 0 && (
          <div className="mb-24px">
            <p className="text-11px font-semibold text-[#666] uppercase tracking-wider mb-12px m-0">
              Folders · {folders.length}
            </p>
            <div className="grid gap-12px" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  itemCount={folderItemCounts[folder.id] || 0}
                  onOpen={handleOpenFolder}
                  onRename={handleRenameFolder}
                  onDelete={handleDeleteFolder}
                />
              ))}
            </div>
          </div>
        )}

        {/* Files section */}
        {visibleItems.length > 0 ? (
          <div>
            <p className="text-11px font-semibold text-[#666] uppercase tracking-wider mb-12px m-0">
              {isInsideFolder ? `Files · ${visibleItems.length}` : `Uncategorized · ${visibleItems.length}`}
            </p>
            <div className="grid gap-12px" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {visibleItems.map((item) => (
                <FileCard
                  key={item.id}
                  item={item}
                  folders={folders}
                  onDelete={handleDeleteFile}
                  onRename={handleRenameFile}
                  onMove={handleMoveFile}
                />
              ))}
            </div>
          </div>
        ) : (
          !isInsideFolder && folders.length === 0 ? (
            /* Completely empty state */
            <div className="flex flex-col items-center justify-center h-full min-h-300px gap-16px text-[#555]">
              <div className="w-72px h-72px rounded-16px bg-[#1e1e1e] border border-dashed border-[#2d2d2d] flex items-center justify-center opacity-60">
                {category === 'images' && <Picture theme="outline" size="32" fill="#52C41A" />}
                {category === 'videos' && <VideoIcon theme="outline" size="32" fill="#722ED1" />}
                {category === 'pdfs' && <FilePdf theme="outline" size="32" fill="#FF4D4F" />}
                {category === 'docs' && <FileWord theme="outline" size="32" fill="#1890FF" />}
                {category === 'others' && <FileText theme="outline" size="32" fill="#8c8c8c" />}
              </div>
              <div className="text-center">
                <p className="text-14px font-semibold text-[#8c8c8c] m-0 mb-4px">No {categoryLabel[category]} yet</p>
                <p className="text-12px text-[#555] m-0">Upload files or create folders to organize your content</p>
              </div>
              <div className="flex items-center gap-10px mt-4px">
                <Button
                  size="small"
                  type="outline"
                  className="!border-[#2d2d2d] !text-[#8c8c8c] hover:!border-[#007fff] hover:!text-[#007fff] rd-8px"
                  icon={<FolderIcon theme="outline" size="13" />}
                  onClick={() => setShowNewFolderModal(true)}
                >
                  New folder
                </Button>
                <Button
                  size="small"
                  type="primary"
                  className="!bg-[#007fff] hover:!bg-[#0066cc] rd-8px"
                  icon={<UploadOne theme="outline" size="13" />}
                  onClick={handleUploadClick}
                >
                  Upload files
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40px gap-10px text-[#555]">
              <UploadOne theme="outline" size="28" fill="currentColor" />
              <p className="text-13px m-0">
                {isInsideFolder ? 'This folder is empty' : 'No uncategorized files'}
              </p>
              <Button
                size="small"
                type="text"
                className="!text-[#007fff] hover:!text-[#0066cc] text-12px"
                onClick={handleUploadClick}
              >
                Upload files here
              </Button>
            </div>
          )
        )}
      </div>

      {/* New Folder Modal */}
      <Modal
        title="New Folder"
        visible={showNewFolderModal}
        onOk={handleCreateFolder}
        onCancel={() => { setShowNewFolderModal(false); setNewFolderName(''); }}
        confirmLoading={creatingFolder}
        okText="Create"
        autoFocus={false}
        focusLock
        className="arco-dark"
        style={{ width: 360 }}
      >
        <div className="py-4px">
          <p className="text-12px text-[#8c8c8c] mb-12px m-0">Enter a name for the new folder</p>
          <Input
            placeholder="e.g. Vacation Photos"
            value={newFolderName}
            onChange={setNewFolderName}
            autoFocus
            onPressEnter={handleCreateFolder}
            className="!bg-[#1e1e1e] !border-[#2d2d2d] text-[#e3e3e3]"
            maxLength={64}
            showWordLimit
          />
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        title={renameTarget?.type === 'folder' ? 'Rename Folder' : 'Rename File'}
        visible={!!renameTarget}
        onOk={handleConfirmRename}
        onCancel={() => setRenameTarget(null)}
        okText="Rename"
        autoFocus={false}
        focusLock
        className="arco-dark"
        style={{ width: 360 }}
      >
        <div className="py-4px">
          <Input
            value={renameName}
            onChange={setRenameName}
            autoFocus
            onPressEnter={handleConfirmRename}
            className="!bg-[#1e1e1e] !border-[#2d2d2d] text-[#e3e3e3]"
            maxLength={128}
          />
        </div>
      </Modal>

      {/* Styles */}
      <style>{`
        .media-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .media-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .media-scrollbar::-webkit-scrollbar-thumb {
          background: #2d2d2d;
          border-radius: 4px;
        }
        .media-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3d3d3d;
        }
        .media-context-menu {
          background: #1e1e1e !important;
          border: 1px solid #2d2d2d !important;
          border-radius: 10px !important;
          padding: 4px !important;
          min-width: 160px !important;
        }
        .media-context-menu .arco-menu-item {
          border-radius: 6px !important;
          padding: 6px 10px !important;
          color: #e3e3e3 !important;
        }
        .media-context-menu .arco-menu-item:hover {
          background: #2a2a2a !important;
        }
        .media-file-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .media-folder-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(0, 127, 255, 0.1);
        }
      `}</style>
    </div>
  );
};

export default MediaCategoryView;
