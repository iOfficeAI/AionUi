import type { BuiltinAutoSkill, SkillInfo } from '../types';
import type { IMcpServer } from '@/common/config/storage';
import { Button, Select, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ConfigRow, ReadonlySelectionField, SectionCard } from './editorSectionPrimitives';
import styles from './DefaultsSection.module.css';

type SelectOption = { key: string; value: string; label: string; description?: string };
type EditableSkillOption = { value: string; label: string; isAuto?: boolean; disabled?: boolean };

const getEditorSelectPopupContainer = (node: HTMLElement) =>
  node.closest('[data-editor-popup-root]') ?? node.parentElement ?? document.body;

const AUTO_SELECT_VALUE = '__AUTO__';

const renderSummaryTag = ({ label }: { label: React.ReactNode }) => (
  <span className={styles.summaryTagText}>{label}</span>
);

type DefaultsSectionProps = {
  localeKey: string;
  isBuiltin: boolean;
  isReadOnlyAssistant: boolean;
  isCreating: boolean;
  showSkills: boolean;
  defaultModelMode: 'auto' | 'fixed';
  setDefaultModelMode: (value: 'auto' | 'fixed') => void;
  defaultModelValue: string;
  setDefaultModelValue: (value: string) => void;
  defaultPermissionMode: 'auto' | 'fixed';
  setDefaultPermissionMode: (value: 'auto' | 'fixed') => void;
  defaultPermissionValue: string;
  setDefaultPermissionValue: (value: string) => void;
  defaultSkillsMode: 'auto' | 'fixed';
  setDefaultSkillsMode: (value: 'auto' | 'fixed') => void;
  defaultMcpMode: 'auto' | 'fixed';
  setDefaultMcpMode: (value: 'auto' | 'fixed') => void;
  modelOptions: SelectOption[];
  permissionOptions: Array<{ value: string; label: string; description?: string }>;
  editableSkillOptions: EditableSkillOption[];
  selectedSkillValues: string[];
  enabledMcpServers: IMcpServer[];
  selectedMcpIds: string[];
  setSelectedMcpIds: (value: string[]) => void;
  handleSkillSelectionChange: (values: string[]) => void;
  selectedItemsLabel: (count: number) => string;
  autoDefaultOptionLabel: string;
  readonlySelectionSummary: (items: string[], emptyLabel: string) => string;
};

const DefaultsSection: React.FC<DefaultsSectionProps> = ({
  localeKey,
  isBuiltin,
  isReadOnlyAssistant,
  showSkills,
  defaultModelMode,
  setDefaultModelMode,
  defaultModelValue,
  setDefaultModelValue,
  defaultPermissionMode,
  setDefaultPermissionMode,
  defaultPermissionValue,
  setDefaultPermissionValue,
  defaultSkillsMode,
  setDefaultSkillsMode,
  defaultMcpMode,
  setDefaultMcpMode,
  modelOptions,
  permissionOptions,
  editableSkillOptions,
  selectedSkillValues,
  enabledMcpServers,
  selectedMcpIds,
  setSelectedMcpIds,
  handleSkillSelectionChange,
  selectedItemsLabel,
  autoDefaultOptionLabel,
  readonlySelectionSummary,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canEditDefaultModelAndPermission = !isReadOnlyAssistant || isBuiltin;
  const canEditDefaultSkillsAndMcps = !isReadOnlyAssistant;

  return (
    <SectionCard
      title={t('settings.assistantDefaultConfigSection', { defaultValue: 'Default Configuration' })}
      legend={{
        label: t('settings.assistantOnlyNewConversation', { defaultValue: 'New conversations only' }),
        tone: 'next',
      }}
      testId='assistant-card-defaults'
    >
      <div className='space-y-16px'>
        <ConfigRow
          label={t('settings.assistantDefaultModelLabel', { defaultValue: 'Default Model' })}
          hint={t('settings.assistantDefaultConfigHint', {
            defaultValue:
              'Remember last used only takes effect after this assistant has recorded a previous selection.',
          })}
        >
          <Select
            key={`assistant-default-model-${localeKey}`}
            getPopupContainer={getEditorSelectPopupContainer}
            value={defaultModelMode === 'fixed' && defaultModelValue ? defaultModelValue : AUTO_SELECT_VALUE}
            onChange={(value) => {
              const nextValue = value as string;
              if (nextValue === AUTO_SELECT_VALUE) {
                setDefaultModelMode('auto');
                setDefaultModelValue('');
                return;
              }
              setDefaultModelMode('fixed');
              setDefaultModelValue(nextValue);
            }}
            disabled={!canEditDefaultModelAndPermission}
            allowClear={false}
            placeholder={t('settings.assistantSelectDefaultModel', { defaultValue: 'Select a model' })}
            notFoundContent={t('settings.assistantNoAvailableModels', {
              defaultValue: 'No available models configured',
            })}
            data-testid='select-assistant-default-model'
          >
            <Select.Option value={AUTO_SELECT_VALUE}>{autoDefaultOptionLabel}</Select.Option>
            {modelOptions.map((option) => (
              <Select.Option key={`${localeKey}-${option.key}`} value={option.value}>
                {option.description ? (
                  <Tooltip content={option.description} position='right'>
                    <span className='block min-w-0 truncate'>{option.label}</span>
                  </Tooltip>
                ) : (
                  <span className='block min-w-0 truncate'>{option.label}</span>
                )}
              </Select.Option>
            ))}
          </Select>
        </ConfigRow>

        <ConfigRow label={t('settings.assistantDefaultPermissionLabel', { defaultValue: 'Default Permission' })}>
          <Select
            key={`assistant-default-permission-${localeKey}-${defaultPermissionMode}`}
            getPopupContainer={getEditorSelectPopupContainer}
            value={
              defaultPermissionMode === 'fixed' && defaultPermissionValue ? defaultPermissionValue : AUTO_SELECT_VALUE
            }
            onChange={(value) => {
              const nextValue = value as string;
              if (nextValue === AUTO_SELECT_VALUE) {
                setDefaultPermissionMode('auto');
                setDefaultPermissionValue('');
                return;
              }
              setDefaultPermissionMode('fixed');
              setDefaultPermissionValue(nextValue);
            }}
            disabled={!canEditDefaultModelAndPermission}
            allowClear={false}
            placeholder={t('settings.assistantSelectDefaultPermission', {
              defaultValue: 'Select a permission mode',
            })}
            notFoundContent={t('settings.assistantNoPermissionModes', {
              defaultValue: 'This main agent has no switchable permission modes.',
            })}
            data-testid='select-assistant-default-permission'
          >
            <Select.Option value={AUTO_SELECT_VALUE}>{autoDefaultOptionLabel}</Select.Option>
            {permissionOptions.map((option) => (
              <Select.Option key={`${localeKey}-${option.value}`} value={option.value}>
                {option.description ? (
                  <Tooltip content={option.description} position='right'>
                    <span className='block min-w-0 truncate'>
                      {t(`agentMode.${option.value}`, { defaultValue: option.label })}
                    </span>
                  </Tooltip>
                ) : (
                  <span className='block min-w-0 truncate'>
                    {t(`agentMode.${option.value}`, { defaultValue: option.label })}
                  </span>
                )}
              </Select.Option>
            ))}
          </Select>
        </ConfigRow>

        {showSkills ? (
          <ConfigRow
            label={t('settings.assistantDefaultSkillsLabel', { defaultValue: 'Default Skills' })}
            hint={
              <Button
                type='text'
                size='mini'
                onClick={() => navigate('/settings/capabilities?tab=skills')}
                data-testid='btn-open-skills-settings'
                className='!h-auto !px-0 !text-primary-6'
              >
                {t('settings.skillsHub.manageInHub', { defaultValue: 'Manage in Skills Hub' })}
              </Button>
            }
          >
            {canEditDefaultSkillsAndMcps ? (
              <Select
                className={styles.summarySelect}
                getPopupContainer={getEditorSelectPopupContainer}
                mode='multiple'
                value={defaultSkillsMode === 'fixed' ? selectedSkillValues : [AUTO_SELECT_VALUE]}
                onChange={(value) => {
                  const nextValues = ((value as string[]) ?? []).filter(Boolean);
                  if (nextValues.length === 0) {
                    setDefaultSkillsMode('fixed');
                    handleSkillSelectionChange([]);
                    return;
                  }

                  const filteredValues = nextValues.filter((item) => item !== AUTO_SELECT_VALUE);
                  if (filteredValues.length === 0) {
                    setDefaultSkillsMode('auto');
                    handleSkillSelectionChange([]);
                    return;
                  }

                  setDefaultSkillsMode('fixed');
                  handleSkillSelectionChange(filteredValues);
                }}
                onClear={() => setDefaultSkillsMode('auto')}
                allowClear
                maxTagCount={{
                  count: 0,
                  render: () =>
                    defaultSkillsMode === 'auto'
                      ? autoDefaultOptionLabel
                      : selectedItemsLabel(selectedSkillValues.length),
                }}
                placeholder={
                  defaultSkillsMode === 'auto'
                    ? autoDefaultOptionLabel
                    : t('settings.assistantDefaultSkillsLabel', { defaultValue: 'Default Skills' })
                }
                data-testid='select-assistant-default-skills'
                dropdownRender={(menu) => (
                  <div>
                    <Button
                      type='text'
                      size='small'
                      className='!mx-8px !mt-8px !justify-start !px-8px !text-primary-6'
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDefaultSkillsMode('auto');
                        handleSkillSelectionChange([]);
                      }}
                    >
                      {autoDefaultOptionLabel}
                    </Button>
                    {menu}
                  </div>
                )}
                renderFormat={() =>
                  defaultSkillsMode === 'auto'
                    ? autoDefaultOptionLabel
                    : readonlySelectionSummary(
                        selectedSkillValues,
                        t('settings.assistantNoDefaultSkillsSelected', { defaultValue: 'No default skills selected' })
                      )
                }
                renderTag={renderSummaryTag}
              >
                <Select.Option
                  value={AUTO_SELECT_VALUE}
                  className={styles.hiddenAutoOption}
                  wrapperClassName={styles.hiddenAutoOptionWrapper}
                >
                  {autoDefaultOptionLabel}
                </Select.Option>
                {editableSkillOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <ReadonlySelectionField
                value={
                  defaultSkillsMode === 'auto'
                    ? autoDefaultOptionLabel
                    : readonlySelectionSummary(
                        selectedSkillValues,
                        t('settings.assistantNoDefaultSkillsSelected', { defaultValue: 'No default skills selected' })
                      )
                }
              />
            )}
          </ConfigRow>
        ) : null}

        <ConfigRow
          label={t('settings.assistantDefaultMcpLabel', { defaultValue: 'Default MCP' })}
          hint={
            <Button
              type='text'
              size='mini'
              onClick={() => navigate('/settings/capabilities?tab=tools')}
              data-testid='btn-open-mcp-settings'
              className='!h-auto !px-0 !text-primary-6'
            >
              {t('settings.assistantOpenMcpSettings', { defaultValue: 'Open MCP settings' })}
            </Button>
          }
        >
          {canEditDefaultSkillsAndMcps ? (
            <Select
              className={styles.summarySelect}
              getPopupContainer={getEditorSelectPopupContainer}
              mode='multiple'
              value={defaultMcpMode === 'fixed' ? selectedMcpIds : [AUTO_SELECT_VALUE]}
              onChange={(value) => {
                const nextValues = ((value as string[]) ?? []).filter(Boolean);
                if (nextValues.length === 0) {
                  setDefaultMcpMode('fixed');
                  setSelectedMcpIds([]);
                  return;
                }

                const filteredValues = nextValues.filter((item) => item !== AUTO_SELECT_VALUE);
                if (filteredValues.length === 0) {
                  setDefaultMcpMode('auto');
                  setSelectedMcpIds([]);
                  return;
                }

                setDefaultMcpMode('fixed');
                setSelectedMcpIds(filteredValues);
              }}
              onClear={() => setDefaultMcpMode('auto')}
              allowClear
              maxTagCount={{
                count: 0,
                render: () =>
                  defaultMcpMode === 'auto' ? autoDefaultOptionLabel : selectedItemsLabel(selectedMcpIds.length),
              }}
              placeholder={
                defaultMcpMode === 'auto'
                  ? autoDefaultOptionLabel
                  : t('settings.assistantSelectDefaultMcp', { defaultValue: 'Select MCP servers' })
              }
              notFoundContent={t('settings.assistantNoAvailableMcps', {
                defaultValue: 'No enabled MCP servers are available.',
              })}
              data-testid='select-assistant-default-mcp'
              dropdownRender={(menu) => (
                <div>
                  <Button
                    type='text'
                    size='small'
                    className='!mx-8px !mt-8px !justify-start !px-8px !text-primary-6'
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDefaultMcpMode('auto');
                      setSelectedMcpIds([]);
                    }}
                  >
                    {autoDefaultOptionLabel}
                  </Button>
                  {menu}
                </div>
              )}
              renderFormat={() =>
                defaultMcpMode === 'auto'
                  ? autoDefaultOptionLabel
                  : readonlySelectionSummary(
                      enabledMcpServers
                        .filter((server) => selectedMcpIds.includes(server.id))
                        .map((server) => server.name),
                      t('settings.assistantNoDefaultMcpsSelected', { defaultValue: 'No default MCP selected' })
                    )
              }
              renderTag={renderSummaryTag}
            >
              <Select.Option
                value={AUTO_SELECT_VALUE}
                className={styles.hiddenAutoOption}
                wrapperClassName={styles.hiddenAutoOptionWrapper}
              >
                {autoDefaultOptionLabel}
              </Select.Option>
              {enabledMcpServers.map((server) => (
                <Select.Option key={server.id} value={server.id}>
                  {server.name}
                </Select.Option>
              ))}
            </Select>
          ) : (
            <ReadonlySelectionField
              value={
                defaultMcpMode === 'auto'
                  ? autoDefaultOptionLabel
                  : readonlySelectionSummary(
                      enabledMcpServers
                        .filter((server) => selectedMcpIds.includes(server.id))
                        .map((server) => server.name),
                      t('settings.assistantNoDefaultMcpsSelected', { defaultValue: 'No default MCP selected' })
                    )
              }
            />
          )}
        </ConfigRow>
      </div>
    </SectionCard>
  );
};

export default DefaultsSection;
