import React from 'react';
import { Form, Radio, Space, Input, Typography, Grid } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { themeManager } from '../manager';
import { useTranslation } from 'react-i18next';

const Row = Grid.Row;
const Col = Grid.Col;

const ThemeModePanel: React.FC = () => {
  const { themeId, mode, setMode, list, exportTheme, importTheme } = useTheme();
  const { t } = useTranslation();
  const { pack } = themeManager.getCurrent();

  const currentTheme = list.find((t) => t.id === themeId);
  const currentTokens = mode === 'dark' ? pack.dark : pack.light;
  const arcoConfig = currentTokens.arco || {};

  const updateDefaultMode = (value: string) => {
    const data = exportTheme(themeId);
    if (!data) return;
    const themePackData = JSON.parse(data);
    if (value === 'none') delete themePackData.defaultMode;
    else themePackData.defaultMode = value;
    importTheme(JSON.stringify(themePackData));
  };

  const updateArcoColor = (property: string, value: string) => {
    const updated = { ...pack };
    const targetTokens = mode === 'dark' ? updated.dark : updated.light;

    if (!targetTokens.arco) {
      targetTokens.arco = {};
    }

    (targetTokens.arco as Record<string, unknown>)[property] = value;

    themeManager.upsertTheme(updated);
    themeManager.applyToDOM(document.body);
  };

  return (
    <div>
      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Form layout='vertical'>
          <Form.Item label={t('theme.panel.mode', '模式')}>
            <Radio.Group value={mode} onChange={setMode} type='button'>
              <Radio value='light'>{t('theme.mode.light', '明亮')}</Radio>
              <Radio value='dark'>{t('theme.mode.dark', '暗黑')}</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label={t('theme.panel.defaultMode', '默认模式')}>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Typography.Text type='secondary'>
                {t('theme.help.defaultMode', '为当前主题')}"{currentTheme?.name}"{t('theme.help.setDefaultMode', '设置默认模式：')}
              </Typography.Text>
              <Radio.Group value={currentTheme?.defaultMode || 'none'} onChange={updateDefaultMode} type='button' size='small'>
                <Radio value='none'>{t('theme.defaultMode.none', '无默认')}</Radio>
                <Radio value='light'>{t('theme.defaultMode.light', '默认明亮')}</Radio>
                <Radio value='dark'>{t('theme.defaultMode.dark', '默认暗黑')}</Radio>
              </Radio.Group>
            </Space>
          </Form.Item>

          <Form.Item label={t('theme.panel.arcoConfig', 'Arco Design 配置')}>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Typography.Text type='secondary'>
                {t('theme.help.arcoConfig', '当前模式：')}
                {mode === 'dark' ? t('theme.mode.dark', '暗黑') : t('theme.mode.light', '明亮')}
              </Typography.Text>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('theme.arco.primaryColor', '主色调')}>
                    <Input value={arcoConfig.primaryColor || ''} onChange={(value) => updateArcoColor('primaryColor', value)} placeholder='#165DFF' allowClear />
                  </Form.Item>
                </Col>
              </Row>
            </Space>
          </Form.Item>
        </Form>
      </Space>
    </div>
  );
};

export default ThemeModePanel;
