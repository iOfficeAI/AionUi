/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { getLastDirectoryName } from '@/renderer/utils/workspace/workspace';
import { Modal } from '@arco-design/web-react';
import { AlarmClock, FolderOpen } from '@icon-park/react';
import React from 'react';
import type { TFunction } from 'i18next';

type MigrationModalProps = {
  workspace: string;
  t: TFunction;
  // Migration modal
  showMigrationModal: boolean;
  handleCloseMigrationModal: () => void;
  handleSelectFolder: () => void;
  selectedTargetPath: string;
  migrationLoading: boolean;
  handleMigrationConfirm: () => void;
  // Cron migration modal
  showCronMigrationPrompt: boolean;
  executeMigration: (withCron: boolean) => void;
  // Directory selection modal (WebUI)
  showDirectorySelector: boolean;
  handleSelectDirectoryFromModal: (paths: string[]) => void;
  closeDirectorySelector: () => void;
  // Host file selector (WebUI)
  showHostFileSelector: boolean;
  handleHostFileSelected: (
    paths: string[] | undefined,
    handler: (files: Array<{ name: string; path: string }>) => Promise<void>
  ) => void;
  setShowHostFileSelector: (v: boolean) => void;
  handleFilesToAdd: (files: Array<{ name: string; path: string }>) => Promise<void>;
};

/** Combined migration modals: workspace migration, cron migration prompt, and directory selection. */
const MigrationModal: React.FC<MigrationModalProps> = ({
  workspace,
  t,
  showMigrationModal,
  handleCloseMigrationModal,
  handleSelectFolder,
  selectedTargetPath,
  migrationLoading,
  handleMigrationConfirm,
  showCronMigrationPrompt,
  executeMigration,
  showDirectorySelector,
  handleSelectDirectoryFromModal,
  closeDirectorySelector,
  showHostFileSelector,
  handleHostFileSelected,
  setShowHostFileSelector,
  handleFilesToAdd,
}) => {
  return (
    <>
      {/* Workspace Migration Modal */}
      <Modal
        visible={showMigrationModal}
        title={t('conversation.workspace.migration.title')}
        onCancel={handleCloseMigrationModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='workspace-migration-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          {/* Current workspace info */}
          <div className='text-14px mb-16px' style={{ color: 'var(--color-text-3)' }}>
            {t('conversation.workspace.migration.currentWorkspaceLabel')}
            <span className='font-mono'>/{getLastDirectoryName(workspace)}</span>
          </div>

          {/* Target folder selection card */}
          <div className='mb-16px p-16px rounded-12px' style={{ backgroundColor: 'var(--color-fill-1)' }}>
            <div className='text-14px mb-8px' style={{ color: 'var(--color-text-1)' }}>
              {t('conversation.workspace.migration.moveToNewFolder')}
            </div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px cursor-pointer transition-colors hover:bg-[var(--color-fill-2)]'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
              }}
              onClick={handleSelectFolder}
            >
              <span
                className='text-14px'
                style={{ color: selectedTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
              >
                {selectedTargetPath || t('conversation.workspace.migration.selectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          {/* Hint */}
          <div className='flex items-center gap-8px mb-20px text-14px' style={{ color: 'var(--color-text-3)' }}>
            <span>💡</span>
            <span>{t('conversation.workspace.migration.hint')}</span>
          </div>

          {/* Button area */}
          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleCloseMigrationModal}
              disabled={migrationLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: migrationLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: migrationLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!migrationLoading) {
                  e.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(e) => {
                if (!migrationLoading) {
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onClick={handleMigrationConfirm}
              disabled={migrationLoading || !selectedTargetPath}
            >
              {migrationLoading ? t('conversation.workspace.migration.migrating') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cron Migration Modal */}
      <Modal
        visible={showCronMigrationPrompt}
        title={t('conversation.workspace.migration.cronMigrationTitle')}
        onCancel={handleCloseMigrationModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='cron-migration-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          <div
            className='flex items-center gap-12px p-16px rounded-12px mb-16px'
            style={{ backgroundColor: 'var(--color-fill-1)' }}
          >
            <div
              className='w-40px h-40px rounded-full flex items-center justify-center'
              style={{ backgroundColor: 'rgba(var(--primary-6), 0.1)' }}
            >
              <AlarmClock theme='outline' size='22' fill='rgb(var(--primary-6))' />
            </div>
            <div className='flex-1'>
              <div className='text-15px font-medium mb-4px'>
                {t('conversation.workspace.migration.cronMigrationTitle')}
              </div>
              <div className='text-13px text-t-secondary'>
                {t('conversation.workspace.migration.cronMigrationHint')}
              </div>
            </div>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-20px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onClick={() => executeMigration(false)}
              disabled={migrationLoading}
            >
              {t('conversation.workspace.migration.cronMigrationSkip')}
            </button>
            <button
              className='px-20px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: 'pointer',
              }}
              onClick={() => executeMigration(true)}
              disabled={migrationLoading}
            >
              {t('conversation.workspace.migration.cronMigrationConfirm')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Directory Selection Modal (for WebUI only) */}
      <DirectorySelectionModal
        visible={showDirectorySelector}
        onConfirm={handleSelectDirectoryFromModal}
        onCancel={closeDirectorySelector}
      />

      {/* Host File Selection Modal (for WebUI workspace + button) */}
      <DirectorySelectionModal
        visible={showHostFileSelector}
        isFileMode
        onConfirm={(paths) => handleHostFileSelected(paths, handleFilesToAdd)}
        onCancel={() => setShowHostFileSelector(false)}
      />
    </>
  );
};

export default MigrationModal;
