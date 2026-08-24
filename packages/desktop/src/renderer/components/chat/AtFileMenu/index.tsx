import MentionMenuShell from '@/renderer/components/chat/MentionMenuShell';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import React from 'react';

/** Rows here are two lines tall, so the shell's single-line cap would only show
 *  a handful. */
const MAX_HEIGHT = 'min(40vh, 320px)';

type AtFileMenuProps = {
  activeIndex: number;
  emptyText: string;
  items: FileOrFolderItem[];
  label: string;
  loading: boolean;
  loadingText: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FileOrFolderItem) => void;
  /** Secondary line for an item. Defaults to its relative/absolute path; the
   *  project path passes `PE_NAME · REL` here to disambiguate multi-folder hits. */
  getSubtitle?: (item: FileOrFolderItem) => string;
};

/**
 * The `@` picker's dropdown. Scrolling and the height cap belong to
 * `MentionMenuShell` — a workspace search can return far more rows than fit
 * above the send box.
 */
const AtFileMenu: React.FC<AtFileMenuProps> = ({
  activeIndex,
  emptyText,
  items,
  label,
  loading,
  loadingText,
  onHoverItem,
  onSelectItem,
  getSubtitle,
}) => {
  return (
    <MentionMenuShell
      activeIndex={activeIndex}
      itemCount={items.length}
      label={label}
      loading={loading}
      maxHeight={MAX_HEIGHT}
      bodyClassName='flex flex-col gap-2px'
    >
      {items.length === 0 ? (
        <div className='px-12px py-10px text-12px text-t-secondary'>{loading ? loadingText : emptyText}</div>
      ) : (
        items.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={item.path}
              role='option'
              aria-selected={isActive}
              className='px-12px py-8px rounded-10px cursor-pointer transition-colors shrink-0'
              style={{
                background: isActive ? 'var(--color-fill-2)' : 'transparent',
              }}
              onMouseEnter={() => {
                onHoverItem(index);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectItem(item);
              }}
            >
              <div className='text-13px font-medium text-t-primary'>{item.name}</div>
              <div className='text-12px text-t-secondary break-all'>
                {getSubtitle ? getSubtitle(item) : item.relativePath || item.path}
              </div>
            </div>
          );
        })
      )}
    </MentionMenuShell>
  );
};

export default AtFileMenu;
