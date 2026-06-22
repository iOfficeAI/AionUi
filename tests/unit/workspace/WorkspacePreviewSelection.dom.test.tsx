/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import type { NodeInstance } from '@arco-design/web-react/es/Tree/interface';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TreeProps = {
  onSelect?: (_keys: string[], extra: { node: NodeInstance }) => void;
};

const mocks = vi.hoisted(() => ({
  ensureNodeSelected: vi.fn(),
  handlePreviewFile: vi.fn(),
  writeRendererLogInvoke: vi.fn(),
}));
let latestTreeProps: TreeProps | null = null;

const selectedFile: IDirOrFile = {
  name: 'financial-wechat-miniapp.html',
  relativePath: 'financial-wechat-miniapp.html',
  fullPath: '/workspace/financial-wechat-miniapp.html',
  isFile: true,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getWorkspace: { invoke: vi.fn() },
    },
    application: {
      writeRendererLog: { invoke: mocks.writeRendererLogInvoke },
    },
  },
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@arco-design/web-react', () => ({
  Empty: () => <div data-testid='empty' />,
  Message: {
    useMessage: () => [{ error: vi.fn(), success: vi.fn(), info: vi.fn() }, null],
  },
  Tree: (props: TreeProps) => {
    latestTreeProps = props;
    return <div data-testid='workspace-tree' />;
  },
}));

vi.mock('@icon-park/react', () => ({
  Right: () => <span />,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceCollapse', () => ({
  useWorkspaceCollapse: () => ({
    isWorkspaceCollapsed: false,
    setIsWorkspaceCollapsed: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceTree', () => ({
  useWorkspaceTree: () => ({
    files: [{ name: 'workspace', relativePath: '', fullPath: '/workspace', isFile: false, children: [selectedFile] }],
    loading: false,
    treeKey: 1,
    expandedKeys: [],
    selected: [selectedFile.relativePath],
    selectedKeysRef: { current: [selectedFile.relativePath] },
    selectedNodeRef: { current: null },
    setFiles: vi.fn(),
    setLoading: vi.fn(),
    setExpandedKeys: vi.fn(),
    setSelected: vi.fn(),
    setTreeKey: vi.fn(),
    refreshWorkspace: vi.fn(),
    loadWorkspace: vi.fn(),
    ensureNodeSelected: mocks.ensureNodeSelected,
    clearSelection: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps', () => ({
  useWorkspaceFileOps: () => ({
    handlePreviewFile: mocks.handlePreviewFile,
    handleAddToChat: vi.fn(),
    handleDownloadFile: vi.fn(),
    handleOpenNode: vi.fn(),
    handleRevealNode: vi.fn(),
    handleRenameNode: vi.fn(),
    handleDeleteNode: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useFileChanges', () => ({
  useFileChanges: () => ({
    staged: [],
    unstaged: [],
    loading: false,
    snapshotInfo: null,
    refreshChanges: vi.fn(),
    stageFile: vi.fn(),
    stageAll: vi.fn(),
    unstageFile: vi.fn(),
    unstageAll: vi.fn(),
    discardFile: vi.fn(),
    resetFile: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspacePaste', () => ({
  useWorkspacePaste: () => ({
    pasteTargetFolder: null,
    pasteConfirm: { visible: false },
    onFocusPaste: vi.fn(),
    handleFilesToAdd: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceDragImport', () => ({
  useWorkspaceDragImport: () => ({
    isDragging: false,
    dragHandlers: {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch', () => ({
  useWorkspaceSearch: () => ({
    showSearch: false,
    searchText: '',
    setShowSearch: vi.fn(),
    setSearchText: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceModals', () => ({
  useWorkspaceModals: () => ({
    contextMenu: { visible: false, x: 0, y: 0, node: null },
    renameModal: { visible: false, value: '', target: null },
    deleteModal: { visible: false, target: null, loading: false },
    pasteConfirm: { visible: false, file_name: '', filesToPaste: [], doNotAsk: false, targetFolder: null },
    renameLoading: false,
    setContextMenu: vi.fn(),
    setRenameModal: vi.fn(),
    setDeleteModal: vi.fn(),
    setPasteConfirm: vi.fn(),
    setRenameLoading: vi.fn(),
    closeContextMenu: vi.fn(),
    closeRenameModal: vi.fn(),
    closeDeleteModal: vi.fn(),
    closePasteConfirm: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceEvents', () => ({
  useWorkspaceEvents: vi.fn(),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceToolbar', () => ({
  default: () => <div data-testid='workspace-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceTabBar', () => ({
  default: () => <div data-testid='workspace-tabbar' />,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceContextMenu', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceDialogs', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/PasteConfirmModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/FileChangeList', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/FileTypeIcon', () => ({
  default: () => <span data-testid='file-type-icon' />,
}));

describe('ChatWorkspace preview selection', () => {
  beforeEach(() => {
    latestTreeProps = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens preview when the already highlighted file is clicked again', () => {
    render(<ChatWorkspace conversation_id='conversation-1' workspace='/workspace' />);

    expect(screen.getByTestId('workspace-tree')).toBeInTheDocument();

    const node = {
      key: selectedFile.relativePath,
      props: {
        dataRef: selectedFile,
      },
    } as unknown as NodeInstance;

    act(() => {
      latestTreeProps?.onSelect?.([], { node });
    });

    expect(mocks.ensureNodeSelected).toHaveBeenCalledWith(selectedFile);
    expect(mocks.writeRendererLogInvoke).toHaveBeenCalledWith({
      level: 'debug',
      tag: 'Workspace',
      message: 'workspace_file_preview_requested',
      data: {
        fileName: selectedFile.name,
        wasSelected: true,
        hasKey: true,
      },
    });
    expect(mocks.handlePreviewFile).toHaveBeenCalledWith(selectedFile);
  });
});
