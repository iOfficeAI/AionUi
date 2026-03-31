import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function PointerSensor(): null {
  return null;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.defaultValue as string | undefined) ?? key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  CornerDownRight: () => <span>CornerDownRight</span>,
  Delete: () => <span>Delete</span>,
  Drag: () => <span>Drag</span>,
  MoreOne: () => <span>MoreOne</span>,
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');

  return {
    Button: ({
      children,
      onClick,
      disabled,
      'aria-label': ariaLabel,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      'aria-label'?: string;
    }) => (
      <button type='button' aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Dropdown: ({
      children,
      droplist,
    }: {
      children: React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
      droplist: React.ReactNode;
    }) => {
      const [open, setOpen] = ReactModule.useState(false);
      return (
        <div>
          {ReactModule.cloneElement(children, {
            onClick: (event: React.MouseEvent) => {
              children.props.onClick?.(event);
              setOpen((visible) => !visible);
            },
          })}
          {open ? <div>{droplist}</div> : null}
        </div>
      );
    },
    Input: {
      TextArea: ({
        children,
        ...props
      }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
        children?: React.ReactNode;
      }) => <textarea {...props}>{children}</textarea>,
    },
    Menu: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
      Item: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
        <button type='button' onClick={onClick}>
          {children}
        </button>
      ),
    }),
    Typography: {
      Ellipsis: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
      Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    },
  };
});

vi.mock('@dnd-kit/core', () => ({
  closestCenter: vi.fn(),
  DndContext: ({
    children,
    onDragStart,
    onDragCancel,
  }: {
    children: React.ReactNode;
    onDragStart?: (event: { active: { id: string } }) => void;
    onDragCancel?: () => void;
  }) => (
    <div>
      <button type='button' onClick={() => onDragStart?.({ active: { id: '1' } })}>
        mock-drag-start
      </button>
      <button type='button' onClick={() => onDragCancel?.()}>
        mock-drag-cancel
      </button>
      {children}
    </div>
  ),
  PointerSensor,
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

const baseItems: ConversationCommandQueueItem[] = [
  {
    id: '1',
    input: 'first command',
    files: [],
    createdAt: 1,
  },
];

describe('CommandQueuePanel drag state guards', () => {
  it('locks and unlocks queue interaction during drag lifecycle', () => {
    const onInteractionLock = vi.fn();
    const onInteractionUnlock = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={onInteractionLock}
        onInteractionUnlock={onInteractionUnlock}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock-drag-start' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-drag-cancel' }));

    expect(onInteractionLock).toHaveBeenCalledTimes(1);
    expect(onInteractionUnlock).toHaveBeenCalledTimes(1);
  });

  it('ignores drag start when queue interaction is already locked', () => {
    const onInteractionLock = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={true}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={onInteractionLock}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock-drag-start' }));

    expect(onInteractionLock).not.toHaveBeenCalled();
  });
});
