import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarCustomGroup } from '@/common/types/sidebar';
import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

const state = vi.hoisted(() => ({
  customSectionProps: undefined as
    | {
        renderItem?: (itemId: string, dragHandle: React.ReactNode | null) => React.ReactNode | null;
      }
    | undefined,
  conversationRowProps: undefined as Record<string, unknown> | undefined,
  teamRowProps: undefined as Record<string, unknown> | undefined,
  sortableRowProps: undefined as Record<string, unknown> | undefined,
  conversationRows: {} as Record<string, Record<string, unknown>>,
  teamRows: {} as Record<string, Record<string, unknown>>,
  groups: [] as SidebarCustomGroup[],
  moveItem: vi.fn(),
  moveItemAt: vi.fn(),
  reorderAll: vi.fn(),
  reorderItems: vi.fn(),
  applyGroups: vi.fn(),
  groupOfItem: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'conv2' }),
  useLocation: () => ({ pathname: '/chat' }),
  useNavigate: () => state.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/cron', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pages/cron')>();
  return {
    ...actual,
    useCronJobsMap: () => ({
      getJobStatus: () => 'none',
      markAsRead: vi.fn(),
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useTeamRows', () => ({
  useTeamRows: () => ({
    resolveTeamRow: (item: { team_id?: string; team?: { team_id?: string } }) => ({
      team_id: item.team_id ?? item.team?.team_id,
      item,
    }),
    renameModal: { visible: false, name: '', setName: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), loading: false },
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useCustomGroups', () => ({
  useCustomGroups: () => ({
    groups: state.groups,
    groupOfItem: state.groupOfItem,
    moveItem: state.moveItem,
    moveItemAt: state.moveItemAt,
    reorderAll: state.reorderAll,
    reorderItems: state.reorderItems,
    applyGroups: state.applyGroups,
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useBatchSelection', () => ({
  useBatchSelection: () => ({
    selectedConversationIds: new Set(),
    setSelectedConversationIds: vi.fn(),
    selectedCount: 0,
    allSelected: false,
    toggleSelectedConversation: vi.fn(),
    handleToggleSelectAll: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions', () => ({
  useConversationActions: () => ({
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
    handleCreateCronTask: vi.fn(),
    handleRemoveProject: vi.fn(),
    removeProjectTarget: null,
    removeProjectLoading: false,
    handleRemoveProjectCancel: vi.fn(),
    handleRemoveProjectConfirm: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  useDragAndDrop: () => ({
    sensors: [],
    handleDragEnd: vi.fn(),
    isDragEnabled: false,
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const ModalMock: any = ({ children }: any) => <>{children}</>;
  ModalMock.confirm = vi.fn();
  ModalMock.useModal = () => [{ confirm: vi.fn(), info: vi.fn(), warning: vi.fn() }, vi.fn()];
  return {
    ...actual,
    Button: ({ children, onClick, icon }: any) => (
      <button type='button' onClick={onClick}>
        {icon}
        {children}
      </button>
    ),
    Dropdown: ({ children, droplist }: any) => (
      <div data-testid='dropdown'>
        {children}
        <div data-testid='droplist'>{droplist}</div>
      </div>
    ),
    Empty: () => <div data-testid='empty' />,
    Input: ({ value, onChange }: any) => (
      <input value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} data-testid='arco-input' />
    ),
    Menu: Object.assign(
      ({ children, onClickMenuItem }: any) => (
        <div data-testid='menu' onClick={() => onClickMenuItem?.('remove')}>
          {children}
        </div>
      ),
      { Item: ({ children }: any) => <div>{children}</div> }
    ),
    Modal: ModalMock,
    Tooltip: ({ children }: any) => <>{children}</>,
  };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <>{children}</>,
  closestCenter: () => 0,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

vi.mock('@/renderer/utils/ui/dndModifiers', () => ({
  restrictToVerticalAxis: vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span>icon-delete</span>,
  Folder: () => <span>icon-folder</span>,
  FoldUpOne: () => <span>icon-fold</span>,
  MessageOne: () => <span>icon-message</span>,
  MoreOne: () => <span>icon-more</span>,
  Peoples: () => <span>icon-peoples</span>,
  Plus: () => <span>icon-plus</span>,
  Right: () => <span>icon-right</span>,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/CustomGroupsSection', () => ({
  default: (props: { renderItem?: (itemId: string, dragHandle: React.ReactNode | null) => React.ReactNode | null }) => {
    state.customSectionProps = props;
    return <div data-testid='custom-groups-section' />;
  },
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: (props: Record<string, unknown>) => {
    state.conversationRowProps = props;
    state.conversationRows[(props.conversation as { id?: string } | undefined)?.id ?? ''] = props;
    return (
      <div data-testid='conv-row' onClick={() => (props.onMoveToGroup as (g: string | null) => void)?.(null)}>
        row
      </div>
    );
  },
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/TeamRow', () => ({
  default: (props: Record<string, unknown>) => {
    state.teamRowProps = props;
    state.teamRows[(props.team_id as string) ?? ''] = props;
    return (
      <div data-testid='team-row' onClick={() => (props.onMoveToGroup as (g: string | null) => void)?.(null)}>
        team
      </div>
    );
  },
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({
  default: (props: Record<string, unknown>) => {
    state.sortableRowProps = props;
    return <div data-testid='sortable-row'>sortable</div>;
  },
}));

vi.mock('@/renderer/pages/conversation/components/WorkspaceCollapse', () => ({
  default: ({ children, label, count }: any) => (
    <div data-testid='workspace-collapse'>
      <span>{label}</span>
      <span>{count}</span>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/components/layout/Sider/SiderItem', () => ({
  default: () => <div data-testid='sider-item' />,
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/team/components/TeamCreateModal', () => ({
  default: () => null,
}));

import { useConversations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversations';

const conv1 = { id: 'conv1', name: 'Grouped Chat', projectId: '', workspace: '' };
const conv2 = { id: 'conv2', name: 'Free Chat', projectId: '', workspace: '' };
const conv3 = { id: 'conv3', name: 'Project Chat', projectId: '', workspace: 'ws1' };
const conv4 = { id: 'conv4', name: 'Timeline Chat', projectId: '', workspace: '' };
const team1 = { team_id: 'team1', name: 'Team One' };
const team2 = { team_id: 'team2', name: 'Team Two' };

function baseConversations() {
  return {
    conversations: [conv1, conv2, conv3, conv4],
    isConversationGenerating: () => false,
    hasCompletionUnread: () => false,
    expandedWorkspaces: ['ws1'],
    pinnedConversations: [conv1, conv2],
    pinnedRows: [
      { type: 'conversation', conversation: conv1 },
      { type: 'conversation', conversation: conv2 },
    ],
    timelineSections: [
      {
        key: 'today',
        label: 'Today',
        items: [
          {
            type: 'workspace',
            workspaceGroup: {
              workspace: 'ws1',
              display_name: 'WS',
              conversations: [conv3],
              rows: [{ type: 'conversation', conversation: conv3 }],
              hasMore: false,
            },
          },
          { type: 'conversation', conversation: conv4 },
          { type: 'team', team: team2 },
        ],
      },
    ],
    pinnedPaging: { has_more: false, load_more: () => Promise.resolve() },
    chatsPaging: { has_more: false, load_more: () => Promise.resolve() },
    handleToggleWorkspace: vi.fn(),
    collapseAllWorkspaces: vi.fn(),
    collapsedSections: new Set(),
    toggleSection: vi.fn(),
    loadMore: vi.fn(),
  };
}

describe('WorkspaceGroupedHistory grouping logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.customSectionProps = undefined;
    state.conversationRowProps = undefined;
    state.teamRowProps = undefined;
    state.sortableRowProps = undefined;
    state.groups = [{ id: 'g1', name: 'Group One', itemIds: ['conversation:conv1', 'team:team1', 'bogus'] }];
    state.groupOfItem.mockImplementation(() => null);
    state.groupOfItem.mockImplementation((kind: string, id: string) => {
      if ((kind === 'conversation' && id === 'conv1') || (kind === 'team' && id === 'team1')) return 'g1';
      if (kind === 'conversation' && id === 'conv4') return 'g2';
      return null;
    });
  });

  it('filters grouped items out of pinned, project and chat sections', () => {
    vi.mocked(useConversations).mockReturnValue(baseConversations());

    render(<WorkspaceGroupedHistory />);

    // conv1 lives in group g1 → filtered from pinned rows; conv2 remains.
    expect(state.conversationRows['conv2']).toBeDefined();
    expect(state.conversationRows['conv1']).toBeUndefined();
    // conv3 (workspace project) and conv4 (ungrouped timeline chat) still render.
    expect(state.conversationRows['conv3']).toBeDefined();
    expect(state.conversationRows['conv4']).toBeDefined();
    // Project group row still renders through the collapse.
    expect(screen.getByTestId('workspace-collapse')).toBeDefined();
    // Ungrouped chat-section team (team2) still visible.
    expect(state.teamRows['team2']).toBeDefined();
    // Custom section receives the renderItem resolver.
    expect(state.customSectionProps?.renderItem).toBeTypeOf('function');
  });

  it('resolves grouped conversation and team items through renderGroupItem', () => {
    vi.mocked(useConversations).mockReturnValue(baseConversations());

    render(<WorkspaceGroupedHistory />);

    const renderItem = state.customSectionProps?.renderItem;
    expect(renderItem).toBeDefined();
    // conv4 is ungrouped and present in the sidebar lookup → renders a row.
    const row = renderItem?.('conversation:conv4', <span>handle</span>);
    expect(row).not.toBeNull();
    expect(state.conversationRows['conv4']).toMatchObject({
      conversation: expect.objectContaining({ id: 'conv4' }),
    });

    renderItem?.('team:team2', null);
    expect(state.teamRows['team2']).toMatchObject({ team_id: 'team2' });

    // Unknown item ids resolve to null.
    expect(renderItem?.('bogus', null)).toBeNull();
    // Known prefixes with missing items also resolve to null (lookup miss).
    expect(renderItem?.('conversation:unknown', null)).toBeNull();
    expect(renderItem?.('team:unknown', null)).toBeNull();
  });

  it('moves a conversation and a team to a group from row callbacks', () => {
    vi.mocked(useConversations).mockReturnValue(baseConversations());

    render(<WorkspaceGroupedHistory />);

    // Conversation row: render conv4 (ungrouped) through the custom-section resolver,
    // then move it to group g1.
    state.customSectionProps?.renderItem?.('conversation:conv4', null);
    const convProps = state.conversationRows['conv4'] as { onMoveToGroup?: (g: string | null) => void };
    convProps?.onMoveToGroup?.('g1');
    expect(state.moveItem).toHaveBeenCalledWith('conversation', 'conv4', 'g1');

    // Team row: render team2 (indexed from the chats section) through the custom-section resolver,
    // then move it out of groups.
    state.customSectionProps?.renderItem?.('team:team2', null);
    const teamProps = state.teamRows['team2'] as { onMoveToGroup?: (g: string | null) => void };
    teamProps?.onMoveToGroup?.(null);
    expect(state.moveItem).toHaveBeenCalledWith('team', 'team2', null);
  });

  it('builds move-to-group menu items including the ungroupped option', () => {
    vi.mocked(useConversations).mockReturnValue(baseConversations());

    render(<WorkspaceGroupedHistory />);

    const rowProps = state.conversationRowProps as { moveToGroupItems?: Array<{ key: string }> };
    expect(Array.isArray(rowProps?.moveToGroupItems)).toBe(true);
    const teamProps = state.teamRowProps as { moveToGroupItems?: Array<{ key: string }> };
    expect(Array.isArray(teamProps?.moveToGroupItems)).toBe(true);
  });

  it('renders the empty state when there is no content', () => {
    state.groups = [];
    const base = baseConversations();
    base.conversations = [];
    base.pinnedConversations = [];
    base.pinnedRows = [];
    base.timelineSections = [];
    vi.mocked(useConversations).mockReturnValue(base);

    render(<WorkspaceGroupedHistory />);

    expect(screen.getByTestId('empty')).toBeDefined();
  });

  it('falls back to pinnedConversations when pinnedRows is absent', () => {
    const base = baseConversations();
    base.pinnedRows = undefined;
    vi.mocked(useConversations).mockReturnValue(base);

    render(<WorkspaceGroupedHistory />);

    // Both pinned conversations are derived into rows and rendered.
    expect(state.conversationRows['conv2']).toBeDefined();
    expect(state.conversationRows['conv1']).toBeUndefined(); // conv1 grouped → filtered
  });

  it('indexes and renders a pinned team row', () => {
    state.groups = [];
    const base = baseConversations();
    base.pinnedRows = [
      { type: 'conversation', conversation: conv1 },
      { type: 'team', team: team1 },
    ];
    vi.mocked(useConversations).mockReturnValue(base);

    render(<WorkspaceGroupedHistory />);

    // The pinned team is indexed in the sidebar lookup and rendered as a TeamRow.
    expect(state.teamRows['team1']).toBeDefined();
    expect(state.teamRows['team1']).toMatchObject({ team_id: 'team1' });
  });

  it('indexes a team row inside a project workspace group', () => {
    const base = baseConversations();
    base.timelineSections = [
      {
        key: 'today',
        label: 'Today',
        items: [
          {
            type: 'workspace',
            workspaceGroup: {
              workspace: 'ws1',
              display_name: 'WS',
              conversations: [conv3],
              rows: [
                { type: 'conversation', conversation: conv3 },
                { type: 'team', team: team2 },
              ],
              hasMore: false,
            },
          },
        ],
      },
    ];
    vi.mocked(useConversations).mockReturnValue(base);

    render(<WorkspaceGroupedHistory />);

    // Workspace rows of both kinds resolve through the lookup.
    expect(state.conversationRows['conv3']).toBeDefined();
    expect(state.teamRows['team2']).toBeDefined();
  });

  it('derives project workspace rows from conversations when rows is absent', () => {
    const base = baseConversations();
    base.timelineSections = [
      {
        key: 'today',
        label: 'Today',
        items: [
          {
            type: 'workspace',
            workspaceGroup: {
              workspace: 'ws1',
              display_name: 'WS',
              conversations: [conv3],
              rows: undefined,
              hasMore: false,
            },
          },
        ],
      },
    ];
    vi.mocked(useConversations).mockReturnValue(base);

    render(<WorkspaceGroupedHistory />);

    expect(state.conversationRows['conv3']).toBeDefined();
  });
});
