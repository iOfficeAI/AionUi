/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import React, { useEffect, useState } from 'react';
import { Card, Radio, Space, Typography, Divider, Button, Input, Alert } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from '@icon-park/react';
import type { ThemeMode } from '../../themes/index';
import { useTheme, useThemeColors, useTextColor } from '../../themes/index';

import SettingContainer from './components/SettingContainer';

const { Title, Text } = Typography;

const ThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();
  const { currentTheme, themeMode, isAutoMode, systemTheme, availableThemes, externalThemesCount, setTheme, setThemeMode, toggleAutoMode, refreshExternalThemes } = useTheme();

  // 主题目录配置状态
  const [customThemeDir, setCustomThemeDir] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 加载配置
  useEffect(() => {
    ConfigStorage.get('theme.config')
      .then((config) => {
        if (config?.customThemeDir) {
          setCustomThemeDir(config.customThemeDir);
        }
      })
      .catch((error) => {
        console.warn('Failed to load theme config:', error);
      });
  }, []);

  const handleThemeModeChange = (value: ThemeMode) => {
    setThemeMode(value);
  };

  const handleManualThemeChange = (themeId: string) => {
    setTheme(themeId);
  };

  // 保存主题目录配置
  const saveThemeConfig = async () => {
    if (!customThemeDir.trim()) {
      setError(t('settings.theme.emptyDirError', 'Please select a theme directory'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await ConfigStorage.set('theme.config', { customThemeDir: customThemeDir.trim() });

      // 动态刷新外部主题
      await refreshExternalThemes();

      setSuccess(t('settings.theme.saveSuccess', 'Theme directory saved successfully. Custom themes have been loaded and are now available.'));
    } catch (err) {
      setError(t('settings.theme.saveError', 'Failed to save theme directory: ') + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // 清除主题目录配置
  const clearThemeConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await ConfigStorage.set('theme.config', { customThemeDir: '' });
      setCustomThemeDir('');

      // 动态刷新外部主题，清除已加载的外部主题
      await refreshExternalThemes();

      setSuccess(t('settings.theme.clearSuccess', 'Theme directory cleared successfully. External themes have been removed.'));
    } catch (err) {
      setError(t('settings.theme.clearError', 'Failed to clear theme directory: ') + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const renderThemePreview = (themeId: string) => {
    const theme = availableThemes.find((t) => t.id === themeId);
    if (!theme) return null;

    return (
      <div className='w-full h-20 rounded-lg overflow-hidden cursor-pointer' style={{ border: `1px solid ${themeColors.border}` }}>
        <div className='h-8 w-full flex items-center px-3' style={{ backgroundColor: theme.colors.sidebarBackground }}>
          <div className='w-4 h-4 rounded mr-2' style={{ backgroundColor: theme.colors.logoBackground }} />
          <div className='text-xs' style={{ color: theme.colors.textPrimary }}>
            {theme.name}
          </div>
        </div>
        <div className='h-12 w-full' style={{ backgroundColor: theme.colors.background }} />
      </div>
    );
  };

  return (
    <SettingContainer title={t('settings.theme.title', 'Theme Settings')}>
      <Text type='secondary'>{t('settings.theme.description', 'Customize the appearance of AionUi')}</Text>

      <Divider />

      <Space direction='vertical' size='large' className='w-full'>
        {/* Theme Mode Selection */}
        <div>
          <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.mode', 'textPrimary') }}>
            {t('settings.theme.mode', 'Theme Mode')}
          </Title>
          <Radio.Group value={themeMode} onChange={handleThemeModeChange} direction='vertical' style={{ color: getTextColor('settings.theme.mode', 'textPrimary') }}>
            <Radio value='auto' style={{ color: getTextColor('settings.theme.auto', 'textPrimary') }}>
              <Space>
                <span style={{ color: getTextColor('settings.theme.auto', 'textPrimary') }}>{t('settings.theme.auto', 'Auto (Follow System)')}</span>
                <Text type='secondary' className='text-xs' style={{ color: getTextColor('settings.theme.autoDesc', 'textSecondary') }}>
                  {t('settings.theme.autoDesc', 'Automatically switch based on system preference')}
                  {isAutoMode && (
                    <span className='ml-2' style={{ color: getTextColor('settings.theme.autoDesc', 'textSecondary') }}>
                      ({t('settings.theme.currentSystem', 'Current system')}: {systemTheme === 'dark' ? t('settings.theme.dark', 'Dark') : t('settings.theme.light', 'Light')})
                    </span>
                  )}
                </Text>
              </Space>
            </Radio>
            <Radio value='light' style={{ color: getTextColor('settings.theme.light', 'textPrimary') }}>
              <span style={{ color: getTextColor('settings.theme.light', 'textPrimary') }}>{t('settings.theme.light', 'Light')}</span>
            </Radio>
            <Radio value='dark' style={{ color: getTextColor('settings.theme.dark', 'textPrimary') }}>
              <span style={{ color: getTextColor('settings.theme.dark', 'textPrimary') }}>{t('settings.theme.dark', 'Dark')}</span>
            </Radio>
          </Radio.Group>
        </div>

        {/* Manual Theme Selection (when not in auto mode) */}
        {!isAutoMode && (
          <div>
            <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.selectTheme', 'textPrimary') }}>
              {t('settings.theme.selectTheme', 'Select Theme')}
            </Title>
            <div className='grid grid-cols-2 gap-4'>
              {availableThemes
                .filter((theme) => theme.mode === (themeMode === 'auto' ? systemTheme : themeMode))
                .map((theme) => (
                  <Card
                    key={theme.id}
                    className={`cursor-pointer transition-all ${currentTheme.id === theme.id ? 'ring-2 ring-blue-500' : ''}`}
                    style={{
                      backgroundColor: themeColors.surface,
                      borderColor: currentTheme.id === theme.id ? themeColors.primary : themeColors.border,
                      color: themeColors.textPrimary,
                    }}
                    onClick={() => handleManualThemeChange(theme.id)}
                    bodyStyle={{
                      padding: '12px',
                      backgroundColor: themeColors.surface,
                      color: themeColors.textPrimary,
                    }}
                  >
                    <div className='text-center'>
                      <div className='mb-2'>{renderThemePreview(theme.id)}</div>
                      <Text className='text-sm font-medium'>{theme.name}</Text>
                      {currentTheme.id === theme.id && (
                        <Text className='text-xs mt-1' style={{ color: getTextColor('settings.theme.current'), fontWeight: 'bold' }}>
                          {t('settings.theme.current', 'Current')}
                        </Text>
                      )}
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Current Theme Info */}
        <div>
          <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.currentTheme', 'textPrimary') }}>
            {t('settings.theme.currentTheme', 'Current Theme')}
          </Title>
          <Card
            style={{
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              color: themeColors.textPrimary,
            }}
          >
            <Space>
              <div>
                <Text bold>{currentTheme.name}</Text>
                <br />
                <Text type='secondary' className='text-sm'>
                  {currentTheme.mode === 'dark' ? t('settings.theme.darkTheme', 'Dark theme') : t('settings.theme.lightTheme', 'Light theme')}
                  {isAutoMode && <span className='ml-2'>({t('settings.theme.autoMode', 'Auto mode enabled')})</span>}
                </Text>
              </div>
            </Space>
          </Card>
        </div>

        {/* System Information */}
        <div>
          <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.systemInfo', 'textPrimary') }}>
            {t('settings.theme.systemInfo', 'System Information')}
          </Title>
          <Card
            style={{
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              color: themeColors.textPrimary,
            }}
          >
            <Space direction='vertical' size='small'>
              <Text className='text-sm'>
                <Text bold>{t('settings.theme.systemPreference', 'System Preference')}:</Text>
                <span className='ml-2'>{systemTheme === 'dark' ? t('settings.theme.dark', 'Dark') : t('settings.theme.light', 'Light')}</span>
              </Text>
              <Text className='text-sm'>
                <Text bold>{t('settings.theme.autoModeStatus', 'Auto Mode')}:</Text>
                <span className='ml-2'>{isAutoMode ? t('settings.theme.enabled', 'Enabled') : t('settings.theme.disabled', 'Disabled')}</span>
              </Text>
            </Space>
          </Card>
        </div>

        {/* Custom Theme Directory */}
        <div>
          <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.customDir', 'textPrimary') }}>
            {t('settings.theme.customDir', 'Custom Theme Directory')}
          </Title>
          <Text type='secondary' className='mb-3'>
            {t('settings.theme.customDirDesc', 'Set a directory to load custom themes from. The application will read .json theme files from this directory.')}
          </Text>

          <Card
            style={{
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              color: themeColors.textPrimary,
            }}
          >
            <Space direction='vertical' size='medium' className='w-full'>
              <div className='flex items-center gap-2'>
                <Input
                  placeholder={t('settings.theme.selectThemeDir', 'Select theme directory...')}
                  value={customThemeDir}
                  disabled
                  style={{
                    backgroundColor: themeColors.surface,
                    borderColor: themeColors.border,
                    color: getTextColor('settings.theme.dirInput', 'textPrimary'),
                    flex: 1,
                  }}
                />
                <Button
                  type='outline'
                  icon={<FolderOpen theme='outline' size='16' fill={getTextColor('settings.theme.folderIcon', 'textSecondary')} />}
                  onClick={() => {
                    ipcBridge.dialog.showOpen
                      .invoke({
                        defaultPath: customThemeDir || undefined,
                        properties: ['openDirectory', 'createDirectory'],
                      })
                      .then((data) => {
                        if (data?.[0]) {
                          setCustomThemeDir(data[0]);
                          setError(null);
                          setSuccess(null);
                        }
                      });
                  }}
                >
                  {t('settings.theme.browse', 'Browse')}
                </Button>
              </div>

              <div className='flex gap-2'>
                <Button type='primary' loading={loading} disabled={!customThemeDir.trim()} onClick={saveThemeConfig}>
                  {t('settings.theme.save', 'Save')}
                </Button>
                <Button type='outline' loading={loading} disabled={!customThemeDir.trim()} onClick={clearThemeConfig}>
                  {t('settings.theme.clear', 'Clear')}
                </Button>
                <Button type='secondary' loading={loading} onClick={refreshExternalThemes} disabled={!customThemeDir.trim()}>
                  {t('settings.theme.refresh', 'Refresh')}
                </Button>
              </div>

              {error && <Alert type='error' content={error} />}

              {success && <Alert type='success' content={success} />}

              {/* 外部主题状态信息 */}
              <div className='p-3 rounded' style={{ backgroundColor: themeColors.backgroundSecondary, border: `1px solid ${themeColors.border}` }}>
                <Text className='text-sm' style={{ color: getTextColor('settings.theme.externalStatus', 'textSecondary') }}>
                  <Text bold>{t('settings.theme.externalThemesStatus', 'External Themes Status')}:</Text>
                  <span className='ml-2'>{externalThemesCount > 0 ? t('settings.theme.themesLoaded', `${externalThemesCount} themes loaded`, { count: externalThemesCount }) : t('settings.theme.noThemes', 'No external themes loaded')}</span>
                </Text>
              </div>
            </Space>
          </Card>
        </div>
      </Space>
    </SettingContainer>
  );
};

export default ThemeSettings;
