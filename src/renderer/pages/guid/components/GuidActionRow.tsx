/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AgentModeSelector from '@/renderer/components/AgentModeSelector';
import { supportsModeSwitch } from '@/renderer/constants/agentModes';
import { getCleanFileNames } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import type { AcpBackend, AcpBackendConfig, AvailableAgent } from '../types';
import PresetAgentTag from './PresetAgentTag';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { ArrowUp, FolderOpen, Plus, UploadOne } from '@icon-park/react';
import React, { useState } from 'react';
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
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({ files, onFilesUploaded, onSelectWorkspace, modelSelectorNode, selectedAgent, selectedMode, onModeSelect, isPresetAgent, selectedAgentInfo, customAgents, localeKey, onClosePresetTag, loading, isButtonDisabled, onSend }) => {
  const { t } = useTranslation();
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <Dropdown
          trigger='hover'
          onVisibleChange={setIsPlusDropdownOpen}
          droplist={
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
              <Menu.Item key='file'>
                <div className='flex items-center gap-8px'>
                  <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
                  <span>{t('conversation.welcome.uploadFile')}</span>
                </div>
              </Menu.Item>
              <Menu.Item key='workspace'>
                <div className='flex items-center gap-8px'>
                  <FolderOpen theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
                  <span>{t('conversation.welcome.specifyWorkspace')}</span>
                </div>
              </Menu.Item>
            </Menu>
          }
        >
          <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
            <Button type='text' shape='circle' className={isPlusDropdownOpen ? styles.plusButtonRotate : ''} icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}></Button>
            {files.length > 0 && (
              <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}>
                <span className='text-t-primary'>File({files.length})</span>
              </Tooltip>
            )}
          </span>
        </Dropdown>

        {modelSelectorNode}

        {supportsModeSwitch(selectedAgent) && <AgentModeSelector backend={selectedAgent} compact initialMode={selectedMode} onModeSelect={onModeSelect} />}

        {isPresetAgent && selectedAgentInfo && <PresetAgentTag agentInfo={selectedAgentInfo} customAgents={customAgents} localeKey={localeKey} onClose={onClosePresetTag} />}
      </div>
      <div className={styles.actionSubmit}>
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
