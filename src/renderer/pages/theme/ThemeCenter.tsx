import React from 'react';
import { Collapse, Space, Button } from '@arco-design/web-react';
import SettingContainer from '../settings/components/SettingContainer';
import { useTranslation } from 'react-i18next';
import ThemeImportExportPanel from '@/renderer/themes/components/ThemeImportExportPanel';
import ThemeBasicSelectorPanel from '@/renderer/themes/components/ThemeBasicSelectorPanel';
import ThemeModePanel from '@/renderer/themes/components/ThemeModePanel';
import ThemeI18nStylePanel from '@/renderer/themes/components/ThemeI18nStylePanel';
import ThemeCustomizer from '@/renderer/themes/components/ThemeCustomizer';
import AppStylesCustomizer from '@/renderer/themes/components/AppStylesCustomizer';
import OStyleSelector from '@/renderer/themes/components/OStyleSelector';
import CodeHighlightCustomizer from '@/renderer/themes/components/CodeHighlightCustomizer';

const ThemeCenter: React.FC = () => {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = React.useState<string[]>([]);

  const allKeys = ['import-export', 'selector', 'mode', 'vars', 'app-styles', 'o-style', 'i18n', 'code'];

  const handleExpandAll = () => setActiveKey([...allKeys]);
  const handleCollapseAll = () => setActiveKey([]);
  const handleShowImportExportOnly = () => setActiveKey(['import-export']);

  return (
    <SettingContainer title={t('settings.theme') + ' / ' + t('theme.management', '主题管理')}>
      <div style={{ padding: '0 20px' }}>
        <Space style={{ marginBottom: 16 }}>
          <Button onClick={handleExpandAll}>{t('theme.action.expandAll', '展开全部')}</Button>
          <Button onClick={handleShowImportExportOnly}>{t('theme.action.showImportExportOnly', '仅显示导入/导出')}</Button>
          <Button onClick={handleCollapseAll}>{t('theme.action.collapseAll', '折叠全部')}</Button>
        </Space>

        <Collapse
          activeKey={activeKey}
          onChange={(key) => {
            if (Array.isArray(key)) {
              setActiveKey(key as string[]);
            } else {
              const k = String(key);
              setActiveKey((prev) => (prev.includes(k) ? prev.filter((i) => i !== k) : [...prev, k]));
            }
          }}
        >
          <Collapse.Item header={t('theme.panel.importExport', '导入/导出')} name='import-export'>
            <ThemeImportExportPanel />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.themeSelection', '主题选择与预设')} name='selector'>
            <ThemeBasicSelectorPanel />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.modeSettings', '模式与默认模式')} name='mode'>
            <ThemeModePanel />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.variables', '变量（Variables）')} name='vars'>
            <ThemeCustomizer />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.appStyles', '应用样式（AppStyles）')} name='app-styles'>
            <AppStylesCustomizer />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.textStyles', '文本样式（i18nStyles）')} name='i18n'>
            <ThemeI18nStylePanel />
          </Collapse.Item>

          <Collapse.Item header={t('theme.panel.codeHighlight', '代码高亮（CodeHighlight）')} name='code'>
            <CodeHighlightCustomizer />
          </Collapse.Item>
          <Collapse.Item header={t('theme.panel.oStylePreview', 'o-style preview')} name='o-style'>
            <OStyleSelector />
          </Collapse.Item>
        </Collapse>
      </div>
    </SettingContainer>
  );
};

export default ThemeCenter;
