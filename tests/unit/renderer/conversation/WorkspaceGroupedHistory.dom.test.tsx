import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn(() => ({ id: 'conversation-1' })));
const useConversationsMock = vi.hoisted(() => vi.fn());
const useConversationActionsMock = vi.hoisted(() => vi.fn());
const useBatchSelectionMock = vi.hoisted(() => vi.fn());
const useExportMock = vi.hoisted(() => vi.fn());
const useDragAndDropMock = vi.hoisted(() => vi.fn());
const useCronJobsMapMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => useParamsMock(),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Input: ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({ children, visible }: { children?: React.ReactNode; visible?: boolean }) =>
    visible ? <div>{children}</div> : null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>Down</span>,
  FolderOpen: () => <span>FolderOpen</span>,
  Plus: () => <span>Plus</span>,
  Right: () => <span>Right</span>,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => <span>Cron</span>,
  useCronJobsMap: () => useCronJobsMapMock(),
}));

vi.mock('@/renderer/components/settings/DirectorySelectionModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/components/WorkspaceCollapse', () => ({
  __esModule: true,
  default: ({
    header,
    headerExtra,
    children,
  }: {
    header: React.ReactNode;
    headerExtra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>
        {header}
        {headerExtra}
      </div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  __esModule: true,
  default: ({ conversation }: { conversation: { name: string } }) => <div>{conversation.name}</div>,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({
  __esModule: true,
  default: ({ conversation }: { conversation: { name: string } }) => <div>{conversation.name}</div>,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/DragOverlayContent', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useBatchSelection', () => ({
  useBatchSelection: (...args: unknown[]) => useBatchSelectionMock(...args),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions', () => ({
  useConversationActions: (...args: unknown[]) => useConversationActionsMock(...args),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: () => useConversationsMock(),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  useDragAndDrop: (...args: unknown[]) => useDragAndDropMock(...args),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useExport', () => ({
  useExport: (...args: unknown[]) => useExportMock(...args),
}));

import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

describe('WorkspaceGroupedHistory', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useParamsMock.mockReturnValue({ id: 'conversation-1' });
    useCronJobsMapMock.mockReturnValue({
      getJobStatus: vi.fn(() => 'none'),
      markAsRead: vi.fn(),
      setActiveConversation: vi.fn(),
    });
    useConversationsMock.mockReturnValue({
      conversations: [],
      isConversationGenerating: vi.fn(() => false),
      hasCompletionUnread: vi.fn(() => false),
      expandedWorkspaces: ['/workspace/project'],
      pinnedConversations: [],
      timelineSections: [
        {
          timeline: 'Today',
          items: [
            {
              type: 'workspace',
              workspaceGroup: {
                workspace: '/workspace/project',
                displayName: 'project',
                conversations: [
                  {
                    id: 'conversation-1',
                    name: 'Existing Conversation',
                  },
                ],
              },
            },
          ],
        },
      ],
      handleToggleWorkspace: vi.fn(),
    });
    useBatchSelectionMock.mockReturnValue({
      selectedConversationIds: new Set<string>(),
      setSelectedConversationIds: vi.fn(),
      selectedCount: 0,
      allSelected: false,
      toggleSelectedConversation: vi.fn(),
      handleToggleSelectAll: vi.fn(),
    });
    useConversationActionsMock.mockReturnValue({
      renameModalVisible: false,
      renameModalName: '',
      setRenameModalName: vi.fn(),
      renameLoading: false,
      dropdownVisibleId: null,
      handleConversationClick: vi.fn(),
      handleDeleteClick: vi.fn(),
      handleBatchDelete: vi.fn(),
      handleEditStart: vi.fn(),
      handleRenameConfirm: vi.fn(),
      handleRenameCancel: vi.fn(),
      handleTogglePin: vi.fn(),
      handleMenuVisibleChange: vi.fn(),
      handleOpenMenu: vi.fn(),
    });
    useExportMock.mockReturnValue({
      exportTask: null,
      exportModalVisible: false,
      exportTargetPath: '',
      exportModalLoading: false,
      showExportDirectorySelector: false,
      setShowExportDirectorySelector: vi.fn(),
      closeExportModal: vi.fn(),
      handleSelectExportDirectoryFromModal: vi.fn(),
      handleSelectExportFolder: vi.fn(),
      handleExportConversation: vi.fn(),
      handleBatchExport: vi.fn(),
      handleConfirmExport: vi.fn(),
    });
    useDragAndDropMock.mockReturnValue({
      sensors: [],
      activeId: null,
      activeConversation: null,
      handleDragStart: vi.fn(),
      handleDragEnd: vi.fn(),
      handleDragCancel: vi.fn(),
      isDragEnabled: false,
    });
  });

  it('navigates to the guid page with the workspace preselected when the workspace add button is clicked', () => {
    render(<WorkspaceGroupedHistory />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.workspace.createNewConversation' }));

    expect(navigateMock).toHaveBeenCalledWith('/guid', {
      state: { workspace: '/workspace/project' },
    });
  });
});
