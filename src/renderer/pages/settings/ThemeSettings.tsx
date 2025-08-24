/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Card, Space, Typography, Divider, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ThemeSelector } from '../../components/ThemeSelector';
import { useTheme, useThemeColors, useTextColor } from '../../themes/index';

import SettingContainer from './components/SettingContainer';

const { Title, Text } = Typography;

const ThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();
  const { currentTheme, availableThemes, setTheme, themeMode, setThemeMode } = useTheme();
  const [themeSelectorVisible, setThemeSelectorVisible] = useState(false);

  const renderThemePreview = (themeId: string) => {
    const theme = availableThemes.find((t) => t.manifest.id === themeId);
    if (!theme) return null;

    const themeVars = theme.manifest.variables;
    return (
      <div className='w-full h-20 rounded-lg overflow-hidden cursor-pointer' style={{ border: `1px solid ${themeColors.border}` }}>
        <div className='h-8 w-full flex items-center px-3' style={{ backgroundColor: themeVars.sidebarBackground || themeVars.surface }}>
          <div className='w-4 h-4 rounded mr-2' style={{ backgroundColor: themeVars.primary }} />
          <div className='text-xs' style={{ color: themeVars.textPrimary }}>
            {theme.manifest.name}
          </div>
        </div>
        <div className='h-12 w-full' style={{ backgroundColor: themeVars.background }} />
      </div>
    );
  };

  const renderAutoThemePreview = () => {
    return (
      <div className='w-full h-20 rounded-lg overflow-hidden cursor-pointer' style={{ border: `1px solid ${themeColors.border}` }}>
        <div className='flex h-full'>
          <div className='w-1/2 h-full' style={{ backgroundColor: '#ffffff' }}>
            <div className='h-8 flex items-center px-2' style={{ backgroundColor: '#f2f3f5' }}>
              <div className='w-3 h-3 rounded mr-1' style={{ backgroundColor: '#4E5969' }} />
              <div className='text-xs' style={{ color: '#1d2129' }}>
                Light
              </div>
            </div>
          </div>
          <div className='w-1/2 h-full' style={{ backgroundColor: '#1E1E1E' }}>
            <div className='h-8 flex items-center px-2' style={{ backgroundColor: '#1E1E1E' }}>
              <div className='w-3 h-3 rounded mr-1' style={{ backgroundColor: '#6494ED' }} />
              <div className='text-xs' style={{ color: '#E8E8E8' }}>
                Dark
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFilterDarkPreview = () => {
    const lightTheme = availableThemes.find((t) => t.manifest.mode === 'light');
    if (!lightTheme) return null;

    const themeVars = lightTheme.manifest.variables;
    return (
      <div
        className='w-full h-20 rounded-lg overflow-hidden cursor-pointer'
        style={{
          border: `1px solid ${themeColors.border}`,
          filter: 'invert(1) hue-rotate(180deg) contrast(0.9) brightness(1.1)',
        }}
      >
        <div className='h-8 w-full flex items-center px-3' style={{ backgroundColor: themeVars.sidebarBackground || themeVars.surface }}>
          <div className='w-4 h-4 rounded mr-2' style={{ backgroundColor: themeVars.primary }} />
          <div className='text-xs' style={{ color: themeVars.textPrimary }}>
            Filter Dark
          </div>
        </div>
        <div className='h-12 w-full' style={{ backgroundColor: themeVars.background }} />
      </div>
    );
  };

  return (
    <SettingContainer title={t('settings.theme.title', 'Theme Settings')}>
      <Text type='secondary'>{t('settings.theme.description', 'Customize the appearance of AionUi')}</Text>

      <Divider />

      <Space direction='vertical' size='large' className='w-full'>
        {/* Unified Theme Selection */}
        <div>
          <Title heading={6} className='mb-3' style={{ color: getTextColor('settings.theme.selectTheme', 'textPrimary') }}>
            {t('settings.theme.selectTheme', 'Select Theme')}
          </Title>
          <div className='grid grid-cols-2 gap-4'>
            {/* Auto Mode - 跟随系统 */}
            <Card
              className={`cursor-pointer transition-all ${themeMode === 'auto' ? 'ring-2 ring-blue-500' : ''}`}
              style={{
                backgroundColor: themeColors.surface,
                borderColor: themeMode === 'auto' ? themeColors.primary : themeColors.border,
                color: themeColors.textPrimary,
              }}
              onClick={() => setThemeMode('auto')}
              bodyStyle={{
                padding: '12px',
                backgroundColor: themeColors.surface,
                color: themeColors.textPrimary,
              }}
            >
              <div className='text-center'>
                <div className='mb-2'>{renderAutoThemePreview()}</div>
                <Text className='text-sm font-medium'>{t('settings.theme.auto', 'Auto (Follow System)')}</Text>
                <Text className='text-xs mt-1' style={{ color: getTextColor('settings.theme.mode', 'textSecondary') }}>
                  {t('settings.theme.autoDescription', 'Automatically switch based on system')}
                </Text>
                {themeMode === 'auto' && (
                  <Text className='text-xs mt-1' style={{ color: themeColors.primary, fontWeight: 'bold' }}>
                    {t('settings.theme.current', 'Current')}
                  </Text>
                )}
              </div>
            </Card>

            {/* Builtin Themes - 内置主题 */}
            {availableThemes
              .filter((theme) => ['default-light-modernized', 'idea-dark-modernized'].includes(theme.manifest.id))
              .map((theme) => (
                <Card
                  key={theme.manifest.id}
                  className={`cursor-pointer transition-all ${currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' ? 'ring-2 ring-blue-500' : ''}`}
                  style={{
                    backgroundColor: themeColors.surface,
                    borderColor: currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' ? themeColors.primary : themeColors.border,
                    color: themeColors.textPrimary,
                  }}
                  onClick={() => {
                    // 直接设置主题，不调用 setThemeMode 避免被偏好设置覆盖
                    setTheme(theme.manifest.id);
                  }}
                  bodyStyle={{
                    padding: '12px',
                    backgroundColor: themeColors.surface,
                    color: themeColors.textPrimary,
                  }}
                >
                  <div className='text-center'>
                    <div className='mb-2'>{renderThemePreview(theme.manifest.id)}</div>
                    <Text className='text-sm font-medium'>{theme.manifest.name}</Text>
                    <Text className='text-xs mt-1' style={{ color: getTextColor('settings.theme.mode', 'textSecondary') }}>
                      {theme.manifest.mode === 'dark' ? t('settings.theme.darkTheme', 'Dark theme') : t('settings.theme.lightTheme', 'Light theme')}
                    </Text>
                    {currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' && (
                      <Text className='text-xs mt-1' style={{ color: themeColors.primary, fontWeight: 'bold' }}>
                        {t('settings.theme.current', 'Current')}
                      </Text>
                    )}
                  </div>
                </Card>
              ))}

            {/* Filter Dark Mode - 使用CSS滤镜创建暗色效果 */}
            <Card
              className={`cursor-pointer transition-all ${themeMode === 'filter-dark' ? 'ring-2 ring-blue-500' : ''}`}
              style={{
                backgroundColor: themeColors.surface,
                borderColor: themeMode === 'filter-dark' ? themeColors.primary : themeColors.border,
                color: themeColors.textPrimary,
              }}
              onClick={() => setThemeMode('filter-dark')}
              bodyStyle={{
                padding: '12px',
                backgroundColor: themeColors.surface,
                color: themeColors.textPrimary,
              }}
            >
              <div className='text-center'>
                <div className='mb-2'>{renderFilterDarkPreview()}</div>
                <Text className='text-sm font-medium'>{t('settings.theme.filterDark', 'Filter Dark (CSS Filter)')}</Text>
                <Text className='text-xs mt-1' style={{ color: getTextColor('settings.theme.mode', 'textSecondary') }}>
                  {t('settings.theme.filterDarkDescription', 'Apply CSS filter for dark appearance')}
                </Text>
                {themeMode === 'filter-dark' && (
                  <Text className='text-xs mt-1' style={{ color: themeColors.primary, fontWeight: 'bold' }}>
                    {t('settings.theme.current', 'Current')}
                  </Text>
                )}
              </div>
            </Card>

            {/* Custom Themes - 自定义主题 */}
            {availableThemes
              .filter((theme) => !['default-light-modernized', 'idea-dark-modernized'].includes(theme.manifest.id))
              .map((theme) => (
                <Card
                  key={theme.manifest.id}
                  className={`cursor-pointer transition-all ${currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' ? 'ring-2 ring-blue-500' : ''}`}
                  style={{
                    backgroundColor: themeColors.surface,
                    borderColor: currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' ? themeColors.primary : themeColors.border,
                    color: themeColors.textPrimary,
                  }}
                  onClick={() => {
                    // 直接设置主题，不调用 setThemeMode 避免被偏好设置覆盖
                    setTheme(theme.manifest.id);
                  }}
                  bodyStyle={{
                    padding: '12px',
                    backgroundColor: themeColors.surface,
                    color: themeColors.textPrimary,
                  }}
                >
                  <div className='text-center'>
                    <div className='mb-2'>{renderThemePreview(theme.manifest.id)}</div>
                    <Text className='text-sm font-medium'>{theme.manifest.name}</Text>
                    <Text className='text-xs mt-1' style={{ color: getTextColor('settings.theme.mode', 'textSecondary') }}>
                      {theme.manifest.mode === 'dark' ? t('settings.theme.darkTheme', 'Dark theme') : t('settings.theme.lightTheme', 'Light theme')}
                    </Text>
                    {currentTheme?.manifest.id === theme.manifest.id && themeMode !== 'auto' && themeMode !== 'filter-dark' && (
                      <Text className='text-xs mt-1' style={{ color: themeColors.primary, fontWeight: 'bold' }}>
                        {t('settings.theme.current', 'Current')}
                      </Text>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        </div>

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
            <Space direction='vertical' className='w-full'>
              <div>
                <Text style={{ fontWeight: 'bold' }}>{currentTheme?.manifest.name || 'No theme selected'}</Text>
                <br />
                <Text type='secondary' className='text-sm'>
                  {currentTheme ? (currentTheme.manifest.mode === 'dark' ? t('settings.theme.darkTheme', 'Dark theme') : t('settings.theme.lightTheme', 'Light theme')) : 'No theme selected'}
                </Text>
                {currentTheme?.manifest.description && (
                  <>
                    <br />
                    <Text type='secondary' className='text-xs'>
                      {currentTheme.manifest.description}
                    </Text>
                  </>
                )}
              </div>
              <div>
                <Button type='primary' onClick={() => setThemeSelectorVisible(true)} style={{ marginTop: 12 }}>
                  {t('settings.theme.manageThemes', '管理主题包')}
                </Button>
              </div>
            </Space>
          </Card>
        </div>
      </Space>

      {/* Theme Selector Modal */}
      <ThemeSelector visible={themeSelectorVisible} onClose={() => setThemeSelectorVisible(false)} />
    </SettingContainer>
  );
};

export default ThemeSettings;
