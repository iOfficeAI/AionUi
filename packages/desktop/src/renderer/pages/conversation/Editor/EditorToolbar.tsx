/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor toolbar. Hosts grouped actions for File, Edit, Find, Format, View,
 * and Pane operations. Each functional group is separated by a 1px vertical
 * rule so the toolbar reads as a real action surface instead of an
 * undifferentiated row of icons.
 */

import { Tooltip } from '@arco-design/web-react';
import {
  CloseSmall,
  Code,
  Comment,
  Exchange,
  FolderOpen,
  MapTwo,
  Navigation,
  Notes,
  Plus,
  Redo,
  Save,
  Search,
  TextWrapOverflow,
  Undo,
  UploadLogs,
} from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  saving: boolean;
  wordWrap: boolean;
  showMinimap: boolean;
  renderWhitespace: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onReplace: () => void;
  onGoToLine: () => void;
  onToggleComment: () => void;
  onFormatDocument: () => void;
  onToggleWordWrap: () => void;
  onToggleMinimap: () => void;
  onToggleWhitespace: () => void;
  onCollapse: () => void;
  onClose: () => void;
};

const BTN =
  'inline-flex items-center justify-center w-30px h-30px rd-4px text-t-secondary hover:text-t-primary hover:bg-bg-3 transition-colors duration-100 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed';

const BTN_ACTIVE =
  'inline-flex items-center justify-center w-30px h-30px rd-4px text-white bg-brand hover:bg-brand-hover transition-colors duration-100 cursor-pointer select-none';

const SEPARATOR = 'w-1px h-20px bg-bg-3 mx-4px flex-shrink-0';

type ToolButtonProps = {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  loading?: boolean;
  onClick: () => void;
};

const ToolButton: React.FC<ToolButtonProps> = ({ label, icon, active, loading, onClick }) => (
  <Tooltip content={label} position='bottom' mini>
    <button
      type='button'
      aria-label={label}
      aria-pressed={active}
      disabled={loading}
      className={active ? BTN_ACTIVE : BTN}
      onClick={onClick}
    >
      {icon}
    </button>
  </Tooltip>
);

const EditorToolbar: React.FC<Props> = ({
  saving,
  wordWrap,
  showMinimap,
  renderWhitespace,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onGoToLine,
  onToggleComment,
  onFormatDocument,
  onToggleWordWrap,
  onToggleMinimap,
  onToggleWhitespace,
  onCollapse,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role='toolbar'
      aria-label={t('conversation.editor.toolbarLabel')}
      className='flex items-center h-40px bg-bg-2 border-b border-b-1 px-8px gap-2px flex-shrink-0 overflow-x-auto overflow-y-hidden'
    >
      {/* File group */}
      <ToolButton label={t('conversation.editor.newFile')} icon={<Plus size={16} />} onClick={onNew} />
      <ToolButton label={t('conversation.editor.openFile')} icon={<FolderOpen size={16} />} onClick={onOpen} />
      <ToolButton label={t('common.save')} icon={<Save size={16} />} loading={saving} onClick={onSave} />
      <ToolButton
        label={t('conversation.editor.saveAs')}
        icon={<Save size={16} style={{ opacity: 0.6 }} />}
        onClick={onSaveAs}
      />

      <span className={SEPARATOR} aria-hidden />

      {/* Edit group */}
      <ToolButton label={t('conversation.editor.undo')} icon={<Undo size={16} />} onClick={onUndo} />
      <ToolButton label={t('conversation.editor.redo')} icon={<Redo size={16} />} onClick={onRedo} />

      <span className={SEPARATOR} aria-hidden />

      {/* Find / navigate group */}
      <ToolButton label={t('conversation.editor.findInFile')} icon={<Search size={16} />} onClick={onFind} />
      <ToolButton label={t('conversation.editor.replace')} icon={<Exchange size={16} />} onClick={onReplace} />
      <ToolButton
        label={t('conversation.editor.goToLine')}
        icon={<Navigation size={16} />}
        onClick={onGoToLine}
      />

      <span className={SEPARATOR} aria-hidden />

      {/* Code group */}
      <ToolButton
        label={t('conversation.editor.toggleComment')}
        icon={<Comment size={16} />}
        onClick={onToggleComment}
      />
      <ToolButton
        label={t('conversation.editor.formatDocument')}
        icon={<Code size={16} />}
        onClick={onFormatDocument}
      />

      {/* Spacer */}
      <div className='flex-1 min-w-8px' />

      {/* View group */}
      <ToolButton
        label={wordWrap ? t('conversation.editor.disableWordWrap') : t('conversation.editor.enableWordWrap')}
        icon={<TextWrapOverflow size={16} />}
        active={wordWrap}
        onClick={onToggleWordWrap}
      />
      <ToolButton
        label={t('conversation.editor.toggleMinimap')}
        icon={<MapTwo size={16} />}
        active={showMinimap}
        onClick={onToggleMinimap}
      />
      <ToolButton
        label={t('conversation.editor.toggleWhitespace')}
        icon={<Notes size={16} />}
        active={renderWhitespace}
        onClick={onToggleWhitespace}
      />

      <span className={SEPARATOR} aria-hidden />

      {/* Pane group */}
      <ToolButton
        label={t('conversation.editor.collapseEditor')}
        icon={<UploadLogs size={16} />}
        onClick={onCollapse}
      />
      <ToolButton label={t('common.close')} icon={<CloseSmall size={16} />} onClick={onClose} />
    </div>
  );
};

export default EditorToolbar;
