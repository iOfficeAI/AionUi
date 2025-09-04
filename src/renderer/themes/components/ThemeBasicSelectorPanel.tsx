import React from 'react';
import { Button, Form, Select, Space } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { applyI18nStyles } from '../i18n-style-mapper';
import { BUILTIN_PRESETS } from '../presets';
import { useTranslation } from 'react-i18next';

const ThemeBasicSelectorPanel: React.FC = () => {
  const { themeId, setTheme, list, importTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div>
      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Form layout='vertical'>
          <Form.Item label={t('theme.panel.selectTheme', '主题')}>
            <Select
              value={themeId}
              onChange={(v) => {
                setTheme(v);
                // 主题变更后立即重新应用 i18n 样式与 appStyles
                setTimeout(() => {
                  try {
                    applyI18nStyles(document.body);
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { applyAppStyles } = require('../app-style-applier');
                    applyAppStyles(document.body);
                  } catch (error) {
                    console.warn('Failed to apply styles after theme change:', error);
                  }
                }, 50);
              }}
              style={{ width: 260 }}
            >
              {list.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name}
                  {t.defaultMode ? `（${t.defaultMode === 'dark' ? '默认暗黑' : '默认明亮'}）` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={t('theme.panel.importBuiltin', '导入内置预设')}>
            <Space wrap>
              {BUILTIN_PRESETS.map((p) => (
                <Button key={p.id} onClick={() => importTheme(JSON.stringify(p))}>
                  {p.name}
                </Button>
              ))}
            </Space>
          </Form.Item>
        </Form>
      </Space>
    </div>
  );
};

export default ThemeBasicSelectorPanel;
