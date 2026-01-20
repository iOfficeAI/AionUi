/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useCallback } from 'react';
import { Collapse, Spin, Empty, Button, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import GeminiModalContent, { type GeminiModalContentRef } from '@/renderer/components/SettingsModal/contents/GeminiModalContent';
import CliSettingsPanel from './CliSettingsPanel';
import { useCliSettings } from './hooks/useCliSettings';

/**
 * CLI 设置主页面
 * CLI Settings Main Page
 */
const CliSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, loading, detectedAgents, updateConfig, isDirty, saveAllSettings, resetChanges } = useCliSettings();
  const geminiRef = useRef<GeminiModalContentRef>(null);
  const [geminiDirty, setGeminiDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 检查是否有未保存的更改
  // Check if there are unsaved changes
  const hasUnsavedChanges = isDirty || geminiDirty;

  // 处理配置变更
  // Handle config change
  const handleConfigChange = useCallback(
    (backend: string) => {
      return (config: typeof settings[string]) => {
        updateConfig(backend, config);
      };
    },
    [updateConfig]
  );

  // 处理 Gemini 脏状态变更
  // Handle Gemini dirty state change
  const handleGeminiDirtyChange = useCallback((dirty: boolean) => {
    setGeminiDirty(dirty);
  }, []);

  // 保存所有设置
  // Save all settings
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 保存 Gemini 设置
      // Save Gemini settings
      const geminiSuccess = geminiRef.current ? await geminiRef.current.save() : true;

      // 保存 CLI 设置
      // Save CLI settings
      const cliSuccess = await saveAllSettings();

      if (geminiSuccess && cliSuccess) {
        Message.success(t('common.saveSuccess'));
        setGeminiDirty(false);
      } else {
        Message.error(t('common.saveFailed'));
      }
    } catch (error) {
      console.error('Failed to save all settings:', error);
      Message.error(t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // 取消所有更改
  // Cancel all changes
  const handleCancelAll = () => {
    // 重置 Gemini 设置
    // Reset Gemini settings
    geminiRef.current?.reset();
    setGeminiDirty(false);

    // 重置 CLI 设置
    // Reset CLI settings
    resetChanges();
  };

  if (loading) {
    return (
      <SettingsPageWrapper>
        <div className='flex items-center justify-center py-40px'>
          <Spin />
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col h-full'>
        {/* 设置内容区域 / Settings content area */}
        <div className='flex-1 overflow-auto'>
          <Collapse
            defaultActiveKey={['gemini']}
            bordered={false}
            className='bg-transparent [&_.arco-collapse-item]:mb-0 [&_.arco-collapse-item]:border-b [&_.arco-collapse-item]:border-border-2 [&_.arco-collapse-item:last-child]:border-b-0'
          >
            {/* Gemini Settings Panel */}
            <Collapse.Item
              className='[&_div.arco-collapse-item-header-title]:flex-1'
              header={
                <div className='font-medium text-base'>{t('settings.geminiSettings')}</div>
              }
              name='gemini'
            >
              <GeminiModalContent
                ref={geminiRef}
                hideButtons={true}
                onDirtyChange={handleGeminiDirtyChange}
              />
            </Collapse.Item>

            {/* Detected CLI Agent Panels */}
            {detectedAgents.map((agent) => {
              const config = settings[agent.backend];
              if (!config) return null;

              return (
                <CliSettingsPanel
                  key={agent.backend}
                  backend={agent.backend}
                  name={agent.name}
                  cliPath={agent.cliPath || ''}
                  config={config}
                  onConfigChange={handleConfigChange(agent.backend)}
                />
              );
            })}
          </Collapse>

          {/* Empty State */}
          {detectedAgents.length === 0 && (
            <div className='py-24px'>
              <Empty description={t('settings.cliNoAgentsFound')} />
            </div>
          )}
        </div>

        {/* 全局保存/取消按钮 / Global Save/Cancel buttons */}
        <div className='flex-shrink-0 flex gap-10px justify-end pt-16px mt-16px border-t border-border-2'>
          <Button
            className='rd-100px'
            onClick={handleCancelAll}
            disabled={!hasUnsavedChanges}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type='primary'
            className='rd-100px'
            onClick={handleSaveAll}
            loading={saving}
            disabled={!hasUnsavedChanges}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default CliSettings;
