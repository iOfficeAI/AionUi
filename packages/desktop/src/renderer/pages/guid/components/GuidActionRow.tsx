/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace';
import { supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { AvailableAgent } from '../types';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import PresetAgentTag, { type AgentSwitcherItem } from './PresetAgentTag';
import { Button, Checkbox, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Close, Folder, FolderOpen, FolderPlus, Lightning, Plus, Shield, UploadOne } from '@icon-park/react';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;

  // Model selector node (rendered by parent)
  modelSelectorNode: React.ReactNode;

  // Agent mode
  selectedAgent: string | 'custom';
  effectiveModeAgent?: string;
  selectedMode: string;
  onModeSelect: (mode: string) => void;

  // Preset agent tag
  is_presetAgent: boolean;
  selectedAgentInfo: AvailableAgent | undefined;
  /**
   * Backend-merged preset catalog — drives the preset tag label lookup. Not
   * the ACP engine-config list (custom agents from the AgentRegistry).
   */
  assistants: Assistant[];
  localeKey: string;
  onClosePresetTag: () => void;
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
  hidePresetTag?: boolean;

  // Skills management
  allSkills: Array<{ name: string; description: string; isAuto: boolean }>;
  disabledBuiltinSkills: string[];
  enabledSkills: string[];
  onToggleSkill: (name: string, isAuto: boolean) => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  modelSelectorNode,
  selectedAgent,
  effectiveModeAgent,
  selectedMode,
  onModeSelect,
  is_presetAgent,
  selectedAgentInfo,
  assistants,
  localeKey,
  onClosePresetTag,
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
  allSkills,
  disabledBuiltinSkills,
  enabledSkills,
  onToggleSkill,
  hidePresetTag = false,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
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

  const recentWorkspaces = getRecentWorkspaces();

  const handleBrowseWorkspace = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((dirs) => {
        if (dirs && dirs[0]) {
          addRecentWorkspace(dirs[0]);
          onSelectWorkspace(dirs[0]);
        }
      })
      .catch((error) => {
        console.error('Failed to open directory dialog:', error);
      });
  }, [onSelectWorkspace]);

  const handleSelectRecentWorkspace = useCallback(
    (path: string) => {
      addRecentWorkspace(path);
      onSelectWorkspace(path);
    },
    [onSelectWorkspace]
  );

  const workspaceDroplist = (
    <div
      className='overflow-x-hidden overflow-y-auto rounded-12px border border-border-1 p-6px shadow-[0_18px_48px_rgba(0,0,0,0.42)]'
      style={{
        minWidth: 280,
        maxHeight: 320,
        backgroundColor: 'var(--bg-2)',
        opacity: 1,
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        isolation: 'isolate',
      }}
    >
      {recentWorkspaces.length > 0 && (
        <>
          <div className='px-10px py-6px text-11px font-medium uppercase tracking-[0.08em] text-t-tertiary'>
            {t('team.create.recentLabel')}
          </div>
          {recentWorkspaces.map((path) => {
            const recentName = path.split(/[\\/]/).pop() || path;
            return (
              <div
                key={path}
                onClick={() => handleSelectRecentWorkspace(path)}
                className='mx-2px flex cursor-pointer items-center gap-10px rounded-10px border border-transparent px-10px py-8px transition-all hover:border-border-2 hover:bg-fill-1'
              >
                <Folder theme='outline' size='16' fill='currentColor' className='shrink-0 text-t-secondary' />
                <div className='min-w-0 flex-1'>
                  <div className='text-sm leading-20px text-t-primary'>{recentName}</div>
                  <div className='truncate text-11px leading-16px text-t-secondary'>{path}</div>
                </div>
              </div>
            );
          })}
          <div className='mx-6px my-4px border-t border-border-2' />
        </>
      )}
      <div
        onClick={handleBrowseWorkspace}
        className='mx-2px flex cursor-pointer items-center gap-10px rounded-10px border border-transparent px-10px py-8px transition-all hover:border-border-2 hover:bg-fill-1'
      >
        <FolderPlus theme='outline' size='16' fill='currentColor' className='shrink-0 text-t-secondary' />
        <span className='text-sm text-t-primary'>{t('team.create.chooseDifferentFolder')}</span>
      </div>
    </div>
  );

  const enabledSkillSet = new Set(enabledSkills);
  const disabledBuiltinSet = new Set(disabledBuiltinSkills);
  const isSkillChecked = useCallback(
    (skill: { name: string; isAuto: boolean }) =>
      skill.isAuto ? !disabledBuiltinSet.has(skill.name) : enabledSkillSet.has(skill.name),
    [disabledBuiltinSet, enabledSkillSet]
  );
  const activeSkillCount = allSkills.filter(isSkillChecked).length;

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
      {allSkills.length > 0 && (
        <Menu.SubMenu
          key='skills'
          title={
            <div className='flex items-center gap-8px'>
              <Lightning theme='filled' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('settings.capabilitiesTab.skills')} ({activeSkillCount}/{allSkills.length})
              </span>
            </div>
          }
          triggerProps={{
            popupStyle: {
              maxHeight: 360,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          {allSkills.map((skill) => (
            <Menu.Item
              key={`skill-${skill.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSkill(skill.name, skill.isAuto);
              }}
            >
              <Checkbox
                checked={isSkillChecked(skill)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => onToggleSkill(skill.name, skill.isAuto)}
              >
                <span className='text-13px'>{skill.name}</span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
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
                data-testid='file-upload-btn'
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

        {!isWebUI &&
          (workspaceDir ? (
            <Tooltip content={workspaceDir} position='top'>
              <Button className='sendbox-model-btn' shape='round' size='small' data-testid='workspace-selector-btn'>
                <span className='flex items-center gap-6px leading-none'>
                  <FolderOpen theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0, flexShrink: 0 }} />
                  <span className='inline-block truncate' style={{ maxWidth: 120, verticalAlign: 'middle' }}>
                    {workspaceDir.split(/[\\/]/).pop() || workspaceDir}
                  </span>
                  <span
                    role='button'
                    aria-label={t('conversation.welcome.clearWorkspace')}
                    className='ml-2px flex items-center justify-center shrink-0 text-t-tertiary hover:text-t-primary transition-colors'
                    style={{ lineHeight: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearWorkspace();
                    }}
                  >
                    <Close theme='outline' size='12' fill='currentColor' />
                  </span>
                </span>
              </Button>
            </Tooltip>
          ) : recentWorkspaces.length > 0 ? (
            <Dropdown trigger='click' position='bl' droplist={workspaceDroplist}>
              <Button className='sendbox-model-btn' shape='round' size='small' data-testid='workspace-selector-btn'>
                <span className='flex items-center gap-6px leading-none'>
                  <FolderOpen theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0, flexShrink: 0 }} />
                  <span>{t('conversation.welcome.specifyWorkspace')}</span>
                </span>
              </Button>
            </Dropdown>
          ) : (
            <Button
              className='sendbox-model-btn'
              shape='round'
              size='small'
              data-testid='workspace-selector-btn'
              onClick={handleBrowseWorkspace}
            >
              <span className='flex items-center gap-6px leading-none'>
                <FolderOpen theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0, flexShrink: 0 }} />
                <span>{t('conversation.welcome.specifyWorkspace')}</span>
              </span>
            </Button>
          ))}

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
        </div>

        {!hidePresetTag && is_presetAgent && selectedAgentInfo && (
          <div className={styles.actionPresetAgent}>
            <PresetAgentTag
              agentInfo={selectedAgentInfo}
              assistants={assistants}
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
          data-testid='guid-send-btn'
        />
      </div>
    </div>
  );
};

export default GuidActionRow;
