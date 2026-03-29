/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import { getAgentModes, supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getCleanFileNames, FileService, MAX_UPLOAD_SIZE_MB } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { AcpBackend, AcpBackendConfig, AvailableAgent } from '../types';
import PresetAgentTag from './PresetAgentTag';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { ArrowUp, FolderOpen, Plus, Shield, UploadOne } from '@icon-park/react';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;
  onSelectWorkspace: (dir: string) => void;

  // Model selector node (rendered by parent)
  modelSelectorNode: React.ReactNode;

  // Agent mode
  selectedAgent: AcpBackend | 'custom';
  effectiveModeAgent?: string;
  selectedMode: string;
  onModeSelect: (mode: string) => void;

  // Preset agent tag
  isPresetAgent: boolean;
  selectedAgentInfo: AvailableAgent | undefined;
  customAgents: AcpBackendConfig[];
  localeKey: string;
  onClosePresetTag: () => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  onSelectWorkspace,
  modelSelectorNode,
  selectedAgent,
  effectiveModeAgent,
  selectedMode,
  onModeSelect,
  isPresetAgent,
  selectedAgentInfo,
  customAgents,
  localeKey,
  onClosePresetTag,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const modeBackend = effectiveModeAgent || selectedAgent;
  const modeOptions = getAgentModes(modeBackend);
  const currentModeOption = modeOptions.find((mode) => mode.value === selectedMode);
  const showModeSwitch = supportsModeSwitch(modeBackend);
  const configOptionCount = (modelSelectorNode ? 1 : 0) + (showModeSwitch ? 1 : 0);

  // Browser file picker ref (WebUI only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList);
        if (processed.length > 0) {
          onFilesUploaded(processed.map((f) => f.path));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'FILE_TOO_LARGE') {
          Message.error(t('common.fileAttach.tooLarge', { max: MAX_UPLOAD_SIZE_MB }));
        } else {
          Message.error(t('common.fileAttach.failed'));
        }
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onFilesUploaded, t]
  );

  const getModeDisplayLabel = (mode: AgentModeOption): string =>
    t(`agentMode.${mode.value}`, { defaultValue: mode.label });

  const permissionLabel = currentModeOption
    ? isMobile
      ? getModeDisplayLabel(currentModeOption)
      : `${t('agentMode.permission')} · ${getModeDisplayLabel(currentModeOption)}`
    : t('agentMode.permission');

  const isWebUI = !isElectronDesktop();

  const menuContent = (
    <Menu
      className='min-w-200px'
      onClickMenuItem={(key) => {
        if (key === 'file') {
          ipcBridge.dialog.showOpen
            .invoke({ properties: ['openFile', 'multiSelections'] })
            .then((uploadedFiles) => {
              if (uploadedFiles && uploadedFiles.length > 0) {
                onFilesUploaded(uploadedFiles);
              }
            })
            .catch((error) => {
              console.error('Failed to open file dialog:', error);
            });
        } else if (key === 'device') {
          fileInputRef.current?.click();
        } else if (key === 'workspace') {
          ipcBridge.dialog.showOpen
            .invoke({ properties: ['openDirectory'] })
            .then((dirs) => {
              if (dirs && dirs[0]) {
                onSelectWorkspace(dirs[0]);
              }
            })
            .catch((error) => {
              console.error('Failed to open directory dialog:', error);
            });
        }
      }}
    >
      {isWebUI ? (
        <>
          <Menu.Item key='file'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.hostFiles')}</span>
            </div>
          </Menu.Item>
          <Menu.Item key='device'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.myDevice')}</span>
            </div>
          </Menu.Item>
        </>
      ) : (
        <Menu.Item key='file'>
          <div className='flex items-center gap-8px'>
            <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <span>{t('conversation.welcome.uploadFile')}</span>
          </div>
        </Menu.Item>
      )}
      <Menu.Item key='workspace'>
        <div className='flex items-center gap-8px'>
          <FolderOpen theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
          <span>{t('conversation.welcome.specifyWorkspace')}</span>
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          <Dropdown trigger='hover' onVisibleChange={setIsPlusDropdownOpen} droplist={menuContent}>
            <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
              <Button
                type='text'
                shape='circle'
                className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
                icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                loading={uploading}
                disabled={uploading}
              ></Button>
              {files.length > 0 && (
                <Tooltip
                  className={'!max-w-max'}
                  content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                >
                  <span className='text-t-primary'>File({files.length})</span>
                </Tooltip>
              )}
            </span>
          </Dropdown>
          {isWebUI && (
            <input
              ref={fileInputRef}
              type='file'
              multiple
              style={{ display: 'none' }}
              onChange={handleLocalFileChange}
            />
          )}
        </div>

        <div
          className={`${styles.actionConfigGroup} ${configOptionCount > 1 ? styles.actionConfigGroupWithDivider : ''}`}
        >
          {modelSelectorNode}

          {showModeSwitch && (
            <AgentModeSelector
              backend={modeBackend}
              compact
              initialMode={selectedMode}
              onModeSelect={onModeSelect}
              compactLabelOverride={permissionLabel}
              compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
              modeLabelFormatter={getModeDisplayLabel}
            />
          )}
        </div>

        {isPresetAgent && selectedAgentInfo && (
          <PresetAgentTag
            agentInfo={selectedAgentInfo}
            customAgents={customAgents}
            localeKey={localeKey}
            onClose={onClosePresetTag}
          />
        )}
      </div>
      <div className={styles.actionSubmit}>
        {speechInputNode}
        <Button
          shape='circle'
          type='primary'
          loading={loading}
          disabled={isButtonDisabled}
          className='send-button-custom'
          style={{
            backgroundColor: isButtonDisabled ? undefined : '#000000',
            borderColor: isButtonDisabled ? undefined : '#000000',
          }}
          icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
          onClick={onSend}
        />
      </div>
    </div>
  );
};

export default GuidActionRow;
