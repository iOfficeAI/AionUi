/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';
import { supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import type { AcpSessionConfigOption } from '@/common/types/acpTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { AcpBackend, AcpBackendConfig, AvailableAgent } from '../types';
import PresetAgentTag, { type AgentSwitcherItem } from './PresetAgentTag';
import { Button, Checkbox, Dropdown, Menu, Message, Tooltip, Modal, Input, List, Spin } from '@arco-design/web-react';
import {
  ArrowUp,
  Brain,
  FolderOpen,
  Lightning,
  Plus,
  Shield,
  UploadOne,
  FileText,
  FilePdf,
  Picture,
  Video as VideoIcon,
  FileWord,
  FileExcel,
  FilePpt,
} from '@icon-park/react';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';
import type { ILibraryItem, LibraryFileType } from '@/common/types/library';

const getFileTypeIcon = (type: LibraryFileType) => {
  const iconProps = { theme: 'outline' as const, size: '16', className: 'mr-8px shrink-0 text-[#8c8c8c]' };
  switch (type) {
    case 'markdown':
      return <FileText {...iconProps} fill='#e3e3e3' />;
    case 'pdf':
      return <FilePdf {...iconProps} fill='#FF4D4F' />;
    case 'image':
      return <Picture {...iconProps} fill='#52C41A' />;
    case 'video':
      return <VideoIcon {...iconProps} fill='#722ED1' />;
    case 'document':
      return <FileWord {...iconProps} fill='#1890FF' />;
    case 'spreadsheet':
      return <FileExcel {...iconProps} fill='#389E0D' />;
    case 'presentation':
      return <FilePpt {...iconProps} fill='#D4380D' />;
    default:
      return <FileText {...iconProps} fill='#e3e3e3' />;
  }
};


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
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
  hidePresetTag?: boolean;

  // Config options (ACP)
  configOptionsBackend?: AcpBackend;
  cachedConfigOptions?: AcpSessionConfigOption[];
  onConfigOptionSelect?: (configId: string, value: string) => void;

  // Skills management
  builtinAutoSkills: Array<{ name: string; description: string }>;
  disabledBuiltinSkills: string[];
  onToggleBuiltinSkill: (name: string) => void;

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
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
  configOptionsBackend,
  cachedConfigOptions,
  onConfigOptionSelect,
  builtinAutoSkills,
  disabledBuiltinSkills,
  onToggleBuiltinSkill,
  hidePresetTag = false,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);

  // Library modal states
  const [isLibraryModalVisible, setIsLibraryModalVisible] = useState(false);
  const [libraryItems, setLibraryItems] = useState<ILibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const loadLibraryItems = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const results = await ipcBridge.library.listItems.invoke({
        filter: 'recents',
        keyword: searchKeyword,
      });
      setLibraryItems(results);
    } catch (err) {
      console.error('[GuidActionRow] Failed to load library items:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    if (isLibraryModalVisible) {
      void loadLibraryItems();
    }
  }, [isLibraryModalVisible, loadLibraryItems]);

  const modeBackend = effectiveModeAgent || selectedAgent;
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
        Message.error(t('common.fileAttach.failed'));
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

  const isWebUI = !isElectronDesktop();

  const activeSkillCount = builtinAutoSkills.length - disabledBuiltinSkills.length;

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
        } else if (key === 'library') {
          setIsLibraryModalVisible(true);
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
      {builtinAutoSkills.length > 0 && (
        <Menu.SubMenu
          key='skills'
          title={
            <div className='flex items-center gap-8px'>
              <Lightning theme='filled' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('settings.autoInjectedSkills')} ({activeSkillCount}/{builtinAutoSkills.length})
              </span>
            </div>
          }
        >
          {builtinAutoSkills.map((skill) => (
            <Menu.Item
              key={`skill-${skill.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleBuiltinSkill(skill.name);
              }}
            >
              <Checkbox
                checked={!disabledBuiltinSkills.includes(skill.name)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => onToggleBuiltinSkill(skill.name)}
              >
                <span className='text-13px'>{skill.name}</span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
      <Menu.Item key='library'>
        <div className='flex items-center gap-8px'>
          <FolderOpen theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
          <span>{t('library.title', { defaultValue: 'Library' })}</span>
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

        {!isWebUI && (
          <Button
            className='sendbox-model-btn'
            shape='round'
            size='small'
            onClick={() => {
              ipcBridge.dialog.showOpen
                .invoke({ properties: ['openDirectory', 'createDirectory'] })
                .then((dirs) => {
                  if (dirs && dirs[0]) {
                    onSelectWorkspace(dirs[0]);
                  }
                })
                .catch((error) => {
                  console.error('Failed to open directory dialog:', error);
                });
            }}
          >
            <span className='flex items-center gap-6px leading-none'>
              <FolderOpen theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0, flexShrink: 0 }} />
              <span>{t('conversation.welcome.specifyWorkspace')}</span>
            </span>
          </Button>
        )}

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
              compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
              modeLabelFormatter={getModeDisplayLabel}
              compactLabelPrefix={t('agentMode.permission')}
              hideCompactLabelPrefixOnMobile
            />
          )}
          <AcpConfigSelector
            backend={configOptionsBackend}
            buttonClassName='guid-config-btn'
            initialConfigOptions={cachedConfigOptions}
            leadingIcon={<Brain theme='outline' size='14' fill={iconColors.secondary} />}
            onOptionSelect={onConfigOptionSelect}
          />
        </div>

        {!hidePresetTag && isPresetAgent && selectedAgentInfo && (
          <div className={styles.actionPresetAgent}>
            <PresetAgentTag
              agentInfo={selectedAgentInfo}
              customAgents={customAgents}
              localeKey={localeKey}
              onClose={onClosePresetTag}
              agentLogo={agentLogo}
              agentSwitcherItems={agentSwitcherItems}
              onAgentSwitch={onAgentSwitch}
            />
          </div>
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
      {/* Library selector Modal */}
      <Modal
        title={t('library.title', { defaultValue: 'Select from Library' })}
        visible={isLibraryModalVisible}
        onCancel={() => setIsLibraryModalVisible(false)}
        footer={null}
        style={{ width: '480px', borderRadius: '12px' }}
      >
        <div className='flex flex-col gap-12px'>
          <Input.Search
            placeholder={t('library.searchPlaceholder', { defaultValue: 'Search pages...' })}
            value={searchKeyword}
            onChange={setSearchKeyword}
            allowClear
          />
          <Spin loading={libraryLoading}>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <List
                dataSource={libraryItems}
                noDataElement={<div className='py-20px text-center text-t-secondary'>No pages found</div>}
                render={(item) => (
                  <List.Item
                    key={item.id}
                    className='px-12px py-8px cursor-pointer hover:bg-fill-2 transition-colors flex items-center rounded-8px'
                    onClick={() => {
                      if (item.filePath) {
                        onFilesUploaded([item.filePath]);
                        Message.success(t('common.saveSuccess', { defaultValue: 'Success' }));
                      }
                      setIsLibraryModalVisible(false);
                    }}
                  >
                    {getFileTypeIcon(item.fileType)}
                    <span className='text-13px font-medium text-t-primary truncate'>{item.name}</span>
                  </List.Item>
                )}
              />
            </div>
          </Spin>
        </div>
      </Modal>
    </div>
  );
};

export default GuidActionRow;
