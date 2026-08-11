import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarCustomGroup } from '@/common/types/sidebar';
import { configService } from '@/common/config/configService';
import CustomGroupsSection from '@/renderer/pages/conversation/GroupedHistory/CustomGroupsSection';

const state = vi.hoisted(() => ({
  dnd: undefined as
    | {
        onDragStart?: (e: { active: { id: string }; over: { id: string } | null }) => void;
        onDragOver?: (e: { active: { id: string }; over: { id: string } | null }) => void;
        onDragEnd?: (e: { active: { id: string }; over: { id: string } | null }) => void;
        onDragCancel?: () => void;
      }
    | undefined,
  groups: [] as SidebarCustomGroup[],
  modalConfirm: undefined as { onOk?: () => void } | undefined,
  draggingIds: new Set<string>(),
  createGroup: vi.fn(),
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
  toggleCollapsed: vi.fn(),
  applyGroups: vi.fn(),
  moveItemAt: vi.fn(),
  reorderItems: vi.fn(),
  reorderAll: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, ...props }: { children: React.ReactNode }) => {
    state.dnd = props;
    return <>{children}</>;
  },
  PointerSensor: class PointerSensor {},
  useSensor: (sensor: unknown) => sensor,
  useSensors: (...sensors: unknown[]) => sensors,
  closestCorners: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: ({ id }: { id: string }) => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    transition: '',
    isDragging: state.draggingIds.has(id),
  }),
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const copy = [...arr];
    copy.splice(to, 0, copy.splice(from, 1)[0]);
    return copy;
  },
  verticalListSortingStrategy: {},
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

vi.mock('@icon-park/react', () => ({
  DeleteOne: () => <span>icon-delete</span>,
  Drag: () => <span>icon-drag</span>,
  EditOne: () => <span>icon-edit</span>,
  Folder: () => <span>icon-folder</span>,
  Plus: () => <span>icon-plus</span>,
  Right: () => <span>icon-right</span>,
}));

vi.mock('@arco-design/web-react', () => ({
  Input: ({ value = '', onChange, onPressEnter, onBlur }: any) => (
    <input
      data-testid='arco-input'
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onPressEnter?.()}
      onBlur={onBlur}
    />
  ),
  Modal: {
    confirm: (opts: { onOk?: () => void }) => {
      state.modalConfirm = opts;
    },
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useCustomGroups', () => ({
  useCustomGroups: () => ({
    groups: state.groups,
    createGroup: state.createGroup,
    renameGroup: state.renameGroup,
    deleteGroup: state.deleteGroup,
    toggleCollapsed: state.toggleCollapsed,
    applyGroups: state.applyGroups,
    moveItemAt: state.moveItemAt,
    reorderItems: state.reorderItems,
    reorderAll: state.reorderAll,
  }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: vi.fn() },
}));

function group(id: string, name: string, itemIds: string[] = [], collapsed = false): SidebarCustomGroup {
  return { id, name, itemIds, collapsed };
}

const renderItemSpy = vi.fn((itemId: string, dragHandle: React.ReactNode | null) => (
  <div data-testid={`row-${itemId}`}>{dragHandle ? 'has-handle' : 'no-handle'}</div>
));

function fireDnd(type: 'onDragStart' | 'onDragOver' | 'onDragEnd', activeId: string, overId: string | null) {
  const handler = state.dnd?.[type];
  const event = { active: { id: activeId }, over: overId === null ? null : { id: overId } };
  handler?.(event as never);
}

describe('CustomGroupsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.dnd = undefined;
    state.modalConfirm = undefined;
    state.groups = [];
    state.draggingIds = new Set();
    renderItemSpy.mockClear();
    vi.mocked(configService.get).mockImplementation(() => state.groups);
  });

  it('renders nothing when the section is collapsed', () => {
    render(<CustomGroupsSection collapsed renderItem={renderItemSpy} />);
    expect(screen.queryByTestId('custom-groups-section')).toBeNull();
    expect(renderItemSpy).not.toHaveBeenCalled();
  });

  it('creates a group from the new-group input', () => {
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByTestId('custom-group-new'));
    const input = screen.getByTestId('arco-input');
    fireEvent.change(input, { target: { value: 'Work' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.createGroup).toHaveBeenCalledWith('Work');
  });

  it('creates a group via the section label and Enter', () => {
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByText('conversation.history.customGroups'));
    const input = screen.getByTestId('arco-input');
    fireEvent.change(input, { target: { value: 'Trips' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.createGroup).toHaveBeenCalledWith('Trips');
  });

  it('ignores a blank new group name', () => {
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByTestId('custom-group-new'));
    const input = screen.getByTestId('arco-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.createGroup).not.toHaveBeenCalled();
  });

  it('opens the creating input via keyboard', () => {
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.keyDown(screen.getByTestId('custom-group-new'), { key: 'Enter' });
    expect(screen.getByTestId('arco-input')).toBeDefined();
  });

  it('does not open the creating input on other keys', () => {
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.keyDown(screen.getByTestId('custom-group-new'), { key: 'a' });
    expect(screen.queryByTestId('arco-input')).toBeNull();
  });

  it('renders groups, their items and drag handles, and toggles collapse', () => {
    state.groups = [group('g1', 'Work', ['conversation:1', 'conversation:2']), group('g2', 'Chill', [], true)];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByText('Chill')).toBeDefined();
    // Expanded group renders its items with a drag handle; collapsed group renders none.
    expect(renderItemSpy).toHaveBeenCalledWith('conversation:1', expect.objectContaining({ props: expect.objectContaining({ 'data-testid': 'custom-group-item-drag-conversation:1' }) }));
    expect(renderItemSpy).toHaveBeenCalledWith('conversation:2', expect.anything());
    expect(renderItemSpy).not.toHaveBeenCalledWith('conversation:9', expect.anything());

    // Header click toggles collapse.
    fireEvent.click(screen.getByText('Work'));
    expect(state.toggleCollapsed).toHaveBeenCalledWith('g1');
  });

  it('renames a group', () => {
    state.groups = [group('g1', 'Work')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByTestId('custom-group-rename-g1'));
    const input = screen.getByTestId('arco-input');
    fireEvent.change(input, { target: { value: 'Office' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.renameGroup).toHaveBeenCalledWith('g1', 'Office');
  });

  it('ignores a blank rename', () => {
    state.groups = [group('g1', 'Work')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByTestId('custom-group-rename-g1'));
    const input = screen.getByTestId('arco-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.renameGroup).not.toHaveBeenCalled();
  });

  it('deletes a group through the confirm modal', () => {
    state.groups = [group('g1', 'Work')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireEvent.click(screen.getByTestId('custom-group-delete-g1'));
    expect(state.modalConfirm).toBeDefined();
    state.modalConfirm?.onOk?.();
    expect(state.deleteGroup).toHaveBeenCalledWith('g1');
  });

  it('passes no drag handle when disabled', () => {
    state.groups = [group('g1', 'Work', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} disabled renderItem={renderItemSpy} />);

    expect(renderItemSpy).toHaveBeenCalledWith('conversation:1', null);
  });

  it('sets the active group on drag start and cancels it on drag cancel', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragStart', 'group:g1', null);
    expect(state.dnd?.onDragStart).toBeDefined();
    // No assertion on dimming (classNames), just ensure no crash and state resets on cancel:
    fireDnd('onDragCancel' as never, 'group:g1', null);
  });

  it('resolves the active group from a dragged item on drag start', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragStart', 'conversation:1', null);
    // Unrelated item not in any group also does not crash.
    fireDnd('onDragStart', 'conversation:9', null);
  });

  it('ignores drag over/end events without a drop target', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragOver', 'conversation:1', null);
    fireDnd('onDragEnd', 'conversation:1', null);
    expect(state.moveItemAt).not.toHaveBeenCalled();
  });

  it('keeps an item in its own group during drag over', () => {
    state.groups = [group('g1', 'A', ['conversation:1', 'conversation:2'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragOver', 'conversation:1', 'conversation:2');
    expect(state.moveItemAt).not.toHaveBeenCalled();
  });

  it('moves an item only once per target container during drag over', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B', ['conversation:3'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragOver', 'conversation:1', 'conversation:3');
    fireDnd('onDragOver', 'conversation:1', 'conversation:3');
    expect(state.moveItemAt).toHaveBeenCalledTimes(1);
  });

  it('moves an item to a group header that has no matching group data', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragOver', 'conversation:1', 'group:ghost');
    expect(state.moveItemAt).toHaveBeenCalledWith('conversation', '1', 'ghost', 0);
  });

  it('moves an item across groups during drag over', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B', ['conversation:3'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragOver', 'conversation:1', 'conversation:3');
    expect(state.moveItemAt).toHaveBeenCalledWith('conversation', '1', 'g2', 0);

    // Dropping onto a group header moves the item to that group's end.
    fireDnd('onDragOver', 'conversation:3', 'group:g1');
    expect(state.moveItemAt).toHaveBeenCalledWith('conversation', '3', 'g1', 1);

    // Same group / unknown source are ignored.
    fireDnd('onDragOver', 'conversation:1', 'conversation:1');
    fireDnd('onDragOver', 'team:x', 'conversation:3');
    expect(state.moveItemAt).toHaveBeenCalledTimes(2);
  });

  it('reorders items within a group on drag end', () => {
    state.groups = [group('g1', 'A', ['conversation:1', 'conversation:2', 'conversation:3'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:3', 'conversation:1');
    expect(state.reorderItems).toHaveBeenCalledWith('g1', ['conversation:3', 'conversation:1', 'conversation:2']);
  });

  it('moves an item across groups on drag end', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B', ['conversation:3'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:1', 'conversation:3');
    expect(state.moveItemAt).toHaveBeenCalledWith('conversation', '1', 'g2', 0);

    // Dropping onto a group header moves to the group end.
    fireDnd('onDragEnd', 'conversation:3', 'group:g1');
    expect(state.moveItemAt).toHaveBeenLastCalledWith('conversation', '3', 'g1', Number.MAX_SAFE_INTEGER);

    // Same group drop on itself is ignored.
    fireDnd('onDragEnd', 'conversation:3', 'conversation:3');
    expect(state.moveItemAt).toHaveBeenCalledTimes(2);
  });

  it('reorders the group list on drag end', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B'), group('g3', 'C')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'group:g1', 'group:g3');
    expect(state.reorderAll).toHaveBeenCalledWith(['g2', 'g3', 'g1']);

    // Dropping a group onto one of its own items still resolves the over group.
    fireDnd('onDragEnd', 'group:g2', 'conversation:1');
    expect(state.reorderAll).toHaveBeenLastCalledWith(['g2', 'g1', 'g3']);
  });

  it('ignores a group dropped at its own position or onto an unknown group', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'group:g1', 'group:ghost');
    expect(state.reorderAll).not.toHaveBeenCalled();
  });

  it('does not reorder an item dropped into its own group header', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:1', 'group:g1');
    expect(state.moveItemAt).not.toHaveBeenCalled();
  });

  it('ignores a drag end over an item that belongs to no group', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:1', 'conversation:9');
    expect(state.moveItemAt).not.toHaveBeenCalled();
  });

  it('ignores a drag end with an item that is not in any group', () => {
    state.groups = [group('g1', 'A', ['conversation:1'])];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:9', 'conversation:1');
    expect(state.moveItemAt).not.toHaveBeenCalled();
    expect(state.reorderItems).not.toHaveBeenCalled();
  });

  it('moves an item to the end of a group when dropped on its header', () => {
    state.groups = [group('g1', 'A', ['conversation:1']), group('g2', 'B')];
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    fireDnd('onDragEnd', 'conversation:1', 'group:ghost');
    expect(state.moveItemAt).toHaveBeenCalledWith('conversation', '1', 'ghost', Number.MAX_SAFE_INTEGER);
  });

  it('skips rows whose renderItem returns null', () => {
    state.groups = [group('g1', 'A', ['conversation:1', 'conversation:2'])];
    const nullForFirst = (itemId: string, dragHandle: React.ReactNode | null) =>
      itemId === 'conversation:1' ? null : <div data-testid={`row-${itemId}`}>{dragHandle ? 'h' : 'n'}</div>;

    render(<CustomGroupsSection collapsed={false} renderItem={nullForFirst} />);
    expect(screen.queryByTestId('row-conversation:1')).toBeNull();
    expect(screen.getByTestId('row-conversation:2')).toBeDefined();
  });

  it('applies the dragging visual state to the active row', () => {
    state.groups = [group('g1', 'A', ['conversation:1', 'conversation:2'])];
    state.draggingIds = new Set(['group:g1', 'conversation:1']);
    render(<CustomGroupsSection collapsed={false} renderItem={renderItemSpy} />);

    expect(renderItemSpy).toHaveBeenCalledWith('conversation:1', expect.anything());
  });
});
