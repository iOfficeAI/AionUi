/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ColumnHeaderDragHandle } from '@/renderer/pages/conversation/hooks/chatColumnContext';
import { Button } from '@arco-design/web-react';
import { Drag } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';

/**
 * The part of a column's header you grab to reorder the columns: the title
 * area, with a grip glyph beside whatever it holds. The grip shows under the
 * pointer (pinned visible where nothing hovers) and takes Alt+Arrow; the
 * area itself only turns a pointer-down into a drag after a small move or a
 * hold, so a click inside it (the title's click-to-rename) still works. The
 * same activator sits over a live conversation's title and over the name a
 * column shows while its conversation is still loading or could not be
 * loaded — a column can be grabbed in every state.
 *
 * Without a handle it is a plain title area: a conversation on its own has
 * nothing to reorder.
 */
export const ColumnHeaderActivator: React.FC<
  React.PropsWithChildren<{ handle?: ColumnHeaderDragHandle; className?: string }>
> = ({ handle, className, children }) => (
  <div
    onPointerDown={handle?.onPointerDown}
    onClickCapture={handle?.onClickCapture}
    className={classNames('group/title h-full min-w-0 flex items-center gap-4px rd-4px transition-colors', className, {
      // A grab must not paint the title as selected text on its way out; the
      // rename field keeps its own selection.
      'select-none [&_input]:select-text': handle,
      'cursor-grab': handle && !handle.isDragging,
      // The lightest primary tint the theme offers: a wash, not an outline.
      'cursor-grabbing bg-primary-light-1': handle?.isDragging,
    })}
    style={{ flex: '0 1 auto', touchAction: handle ? 'manipulation' : undefined }}
    data-testid='chat-header-title'
    data-column-dragging={handle?.isDragging ? 'true' : undefined}
  >
    {handle && (
      <Button
        type='text'
        size='mini'
        aria-label={handle.label}
        data-testid='chat-header-grip'
        icon={<Drag theme='outline' size='14' fill='currentColor' />}
        className='!size-22px !min-w-22px !p-0 !rd-4px shrink-0 flex items-center justify-center !text-t-tertiary opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 [@media(any-hover:none)]:opacity-100 transition-opacity'
        onKeyDown={handle.onKeyDown}
      />
    )}
    {children}
  </div>
);
