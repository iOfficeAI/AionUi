import React from 'react';
import { Button, Form, Input, Message, Select, Space, Typography } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { themeManager } from '../manager';
import { getAllI18nKeys } from '../i18n-theme-manager';
import { applyI18nStyles, resolveI18nStyle } from '../i18n-style-mapper';
import { THEME_VARIABLE_KEYS } from '../variables';
import type { I18nKeyStyle } from '../types';
import { useTranslation } from 'react-i18next';

const ThemeI18nStylePanel: React.FC = () => {
  const { themeId, mode, exportTheme, importTheme } = useTheme();
  const [i18nKey, setI18nKey] = React.useState<string>('conversation.welcome.title');
  const [i18nKeys, setI18nKeys] = React.useState<string[]>([]);
  const [i18nStyle, setI18nStyle] = React.useState<I18nKeyStyle | null>(null);
  const { t } = useTranslation();

  React.useEffect(() => {
    try {
      setI18nKeys(getAllI18nKeys());
    } catch (error) {
      console.warn('Failed to load i18n keys:', error);
    }
  }, []);

  // 当 key / 主题 / 模式变化时，从配置中读取样式
  React.useEffect(() => {
    try {
      const { pack } = themeManager.getCurrent();
      const target = mode === 'dark' ? pack.dark : pack.light;
      const all = target.i18nStyles || {};
      const s = resolveI18nStyle(all, i18nKey);
      setI18nStyle(s || null);
    } catch {
      setI18nStyle(null);
    }
  }, [i18nKey, themeId, mode]);

  const saveI18nStyle = () => {
    if (!i18nStyle) return;
    try {
      const data = exportTheme(themeId);
      if (!data) return;
      const pack = JSON.parse(data);
      const target = mode === 'dark' ? pack.dark : pack.light;
      target.i18nStyles = target.i18nStyles || {};
      target.i18nStyles[i18nKey] = i18nStyle;
      importTheme(JSON.stringify(pack));
      applyI18nStyles(document.body);
      Message.success(t('theme.success.i18nStyleSaved', '已更新 i18n 样式'));
    } catch (error) {
      Message.error(t('theme.error.i18nStyleFailed', 'i18n 样式保存失败：') + error.message);
    }
  };

  return (
    <div>
      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Form layout='vertical'>
          <Form.Item label={t('theme.panel.i18nKey', 'i18n 关键字样式')}>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Select showSearch allowClear placeholder={t('theme.placeholder.selectI18nKey', '选择或搜索 i18n key（支持 * 与 a.b.*）')} value={i18nKey} onChange={setI18nKey} style={{ width: '100%' }}>
                <Select.Option key='*' value='*'>
                  *
                </Select.Option>
                {i18nKeys.map((k) => (
                  <Select.Option key={k} value={k}>
                    {k}
                  </Select.Option>
                ))}
              </Select>

              {i18nStyle && (
                <Space direction='vertical' style={{ width: '100%' }}>
                  <Typography.Text bold>{t('theme.section.textStyle', '文字样式')}</Typography.Text>
                  <Select showSearch allowClear placeholder={t('theme.placeholder.colorVar', '选择颜色变量，例如 --color-text-1')} value={i18nStyle.colorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, colorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder={t('theme.placeholder.textColor', '文字颜色，如 #333333')} value={i18nStyle.color || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, color: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.fontSize', '字体大小，如 16px')} value={i18nStyle.fontSize || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, fontSize: v || undefined } : s))} />
                  <Input
                    placeholder={t('theme.placeholder.fontWeight', '字重，如 600')}
                    value={String(i18nStyle.fontWeight ?? '')}
                    onChange={(v) => {
                      const n = Number(v);
                      setI18nStyle((s) => (s ? { ...s, fontWeight: Number.isFinite(n) ? n : undefined } : s));
                    }}
                  />

                  <Typography.Text bold>{t('theme.section.background', '背景')}</Typography.Text>
                  <Select showSearch allowClear placeholder={t('theme.placeholder.bgColorVar', '背景颜色变量，例如 --color-bg-1')} value={i18nStyle.backgroundColorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundColorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder={t('theme.placeholder.bgColor', '背景色值，如 #ffffff')} value={i18nStyle.backgroundColor || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundColor: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.bgImage', '背景图片，如 linear-gradient(...) 或 url(...)')} value={i18nStyle.backgroundImage || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundImage: v || undefined } : s))} />

                  <Typography.Text bold>{t('theme.section.border', '边框')}</Typography.Text>
                  <Select showSearch allowClear placeholder={t('theme.placeholder.borderColorVar', '边框颜色变量，例如 --color-border-1')} value={i18nStyle.borderColorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderColorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder={t('theme.placeholder.borderColor', '边框颜色，如 #cccccc')} value={i18nStyle.borderColor || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderColor: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.borderWidth', '边框宽度，如 1px')} value={i18nStyle.borderWidth || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderWidth: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.borderStyle', '边框样式，如 solid / dashed')} value={i18nStyle.borderStyle || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderStyle: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.borderRadius', '圆角，如 4px')} value={i18nStyle.borderRadius || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderRadius: v || undefined } : s))} />

                  <Typography.Text bold>{t('theme.section.spacing', '间距')}</Typography.Text>
                  <Input placeholder={t('theme.placeholder.padding', '内边距 padding，如 4px 8px')} value={i18nStyle.padding || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, padding: v || undefined } : s))} />
                  <Input placeholder={t('theme.placeholder.margin', '外边距 margin，如 8px 12px')} value={i18nStyle.margin || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, margin: v || undefined } : s))} />
                </Space>
              )}

              {!i18nStyle && (
                <Space align='center'>
                  <Typography.Text type='secondary'>{t('theme.help.noStyle', '当前未配置样式')}</Typography.Text>
                  <Button type='primary' onClick={() => setI18nStyle({} as I18nKeyStyle)}>
                    {t('theme.action.createStyle', '新建样式')}
                  </Button>
                </Space>
              )}

              <Space align='center'>
                <Button type='primary' disabled={!i18nStyle} onClick={saveI18nStyle}>
                  {t('theme.action.saveStyle', '保存样式')}
                </Button>
                <Typography.Text type='secondary'>{t('theme.label.preview', '预览：')}</Typography.Text>
                <span data-i18n-key={i18nKey}>{i18nKey && !i18nKey.includes('*') ? t(i18nKey) : t('theme.preview.text', '样式预览文字')}</span>
              </Space>
            </Space>
          </Form.Item>
        </Form>
      </Space>
    </div>
  );
};

export default ThemeI18nStylePanel;
