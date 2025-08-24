/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Space, Typography, Tag, Upload, Modal } from '@arco-design/web-react';
import { useTheme } from '../themes/ThemeProvider';
import type { ThemePackageFile } from '../themes/themePackage';

const { Title, Text } = Typography;

interface ThemeSelectorProps {
  visible?: boolean;
  onClose?: () => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ visible = false, onClose }) => {
  const { currentTheme, availableThemes, setTheme, installThemePackage, uninstallTheme, exportTheme } = useTheme();

  // 处理主题包文件上传
  const handleUpload = async (file: File) => {
    try {
      const text = await file.text();
      const themePackage: ThemePackageFile = JSON.parse(text);

      // 验证主题包格式
      if (!themePackage.manifest || !themePackage.manifest.name || !themePackage.manifest.id) {
        throw new Error('Invalid theme package format');
      }

      const success = installThemePackage(themePackage);
      if (success) {
        console.log(`主题 "${themePackage.manifest.name}" 安装成功`);
      } else {
        console.error(`主题 "${themePackage.manifest.name}" 安装失败：不能覆盖内置主题`);
      }
    } catch (error) {
      console.error('Failed to install theme:', error);
      console.error('主题包安装失败：格式无效');
    }

    return false; // 阻止默认上传行为
  };

  // 处理主题选择
  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId);
    console.log('主题切换成功');
  };

  // 处理主题导出
  const handleExport = (themeId: string) => {
    exportTheme(themeId);
    console.log('主题导出成功');
  };

  // 处理主题卸载
  const handleUninstall = (themeId: string, themeName: string) => {
    if (window.confirm(`确定要卸载主题 "${themeName}" 吗？`)) {
      uninstallTheme(themeId);
      console.log('主题卸载成功');
    }
  };

  return (
    <Modal title='主题管理' visible={visible} onCancel={onClose} footer={null} style={{ width: '80vw', maxWidth: 800 }}>
      <div style={{ padding: '20px 0' }}>
        {/* 主题包管理 */}
        <Card
          title='主题包管理'
          extra={
            <Upload accept='.json' showUploadList={false} beforeUpload={handleUpload}>
              <Button type='outline'>📁 导入主题包</Button>
            </Upload>
          }
          style={{ marginBottom: 20 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {availableThemes.map((theme) => (
              <Card
                key={theme.manifest.id}
                hoverable
                style={{
                  position: 'relative',
                  border: currentTheme?.manifest.id === theme.manifest.id ? '2px solid var(--color-primary-6)' : '1px solid var(--color-border-2)',
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Space>
                    <Title heading={6} style={{ margin: 0 }}>
                      {theme.manifest.name}
                    </Title>
                    <Tag color={theme.manifest.mode === 'dark' ? 'arcoblue' : 'gold'}>{theme.manifest.mode === 'dark' ? '深色' : '浅色'}</Tag>
                    {currentTheme?.manifest.id === theme.manifest.id && <Tag color='green'>当前</Tag>}
                  </Space>
                </div>

                <Text type='secondary' style={{ fontSize: '12px', display: 'block', marginBottom: 12 }}>
                  {theme.manifest.description}
                </Text>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 12,
                    height: 24,
                    background: theme.manifest.variables.background,
                    border: `1px solid ${theme.manifest.variables.border}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  {/* 主题色彩预览 */}
                  <div
                    style={{
                      width: '25%',
                      height: '100%',
                      background: theme.manifest.variables.primary,
                    }}
                  />
                  <div
                    style={{
                      width: '25%',
                      height: '100%',
                      background: theme.manifest.variables.success || '#00b42a',
                    }}
                  />
                  <div
                    style={{
                      width: '25%',
                      height: '100%',
                      background: theme.manifest.variables.warning || '#ff7d00',
                    }}
                  />
                  <div
                    style={{
                      width: '25%',
                      height: '100%',
                      background: theme.manifest.variables.error || '#f53f3f',
                    }}
                  />
                </div>

                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button type={currentTheme?.manifest.id === theme.manifest.id ? 'primary' : 'outline'} size='small' onClick={() => handleThemeSelect(theme.manifest.id)}>
                    {currentTheme?.manifest.id === theme.manifest.id ? '已选择' : '选择主题'}
                  </Button>

                  <Space>
                    <Button size='small' onClick={() => handleExport(theme.manifest.id)}>
                      📥
                    </Button>
                    {!['default-light-modernized', 'idea-dark-modernized'].includes(theme.manifest.id) && (
                      <Button size='small' status='danger' onClick={() => handleUninstall(theme.manifest.id, theme.manifest.name)}>
                        🗑️
                      </Button>
                    )}
                  </Space>
                </Space>
              </Card>
            ))}
          </div>
        </Card>
      </div>
    </Modal>
  );
};

export default ThemeSelector;
