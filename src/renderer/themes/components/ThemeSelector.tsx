import React from 'react';
import { Button, Form, Input, Radio, Select, Space, Message } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { BUILTIN_PRESETS } from '../presets';
import { loadYamlPreset } from '../presets/index';
import { parseAuto, toYAML } from '../yaml-utils';
import * as ipcEx from '@/common/ipcBridgeEx';
import { themeManager } from '../manager';
import { getAllI18nKeys } from '../i18n-theme-manager';
import { applyI18nStyles, resolveI18nStyle } from '../i18n-style-mapper';
import { THEME_VARIABLE_KEYS } from '../variables';
import type { I18nKeyStyle } from '../types';
import { useTranslation } from 'react-i18next';

const ThemeSelector: React.FC = () => {
  const { themeId, mode, setMode, setTheme, list, exportTheme, importTheme } = useTheme();
  const [json, setJson] = React.useState('');
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

  // 当 key / 主题 / 模式变化时，从配置中读取样式；无样式时不显示编辑区
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

  return (
    <div>
      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Form layout='vertical'>
          <Form.Item label='主题'>
            <Select
              value={themeId}
              onChange={(v) => {
                setTheme(v);
                setTimeout(() => applyI18nStyles(document.body), 50);
              }}
              style={{ width: 260 }}
            >
              {list.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name}
                  {t.defaultMode ? `（默认 ${t.defaultMode === 'dark' ? '暗黑' : '明亮'}）` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label='导入内置预设'>
            <Space>
              {BUILTIN_PRESETS.map((p) => (
                <Button key={p.id} onClick={() => importTheme(JSON.stringify(p))}>
                  {p.name}
                </Button>
              ))}
            </Space>
          </Form.Item>

          <Form.Item label='从文件导入 (JSON/YAML)'>
            <input
              type='file'
              accept='.json,.yaml,.yml,application/json,application/x-yaml,text/yaml'
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                const preset = await loadYamlPreset(text);
                if (preset) return importTheme(JSON.stringify(preset));
                const data = parseAuto(text);
                if (data) return importTheme(JSON.stringify(data));
              }}
            />
          </Form.Item>

          <Form.Item label='保存为文件 (JSON/YAML)'>
            <Space>
              <Button
                onClick={async () => {
                  const data = exportTheme(themeId);
                  if (!data) return;
                  const fullPath = await ipcEx.showSave.invoke({ defaultPath: `theme-${themeId}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
                  if (!fullPath) return;
                  const res = await ipcEx.saveTextFile.invoke({ fullPath, content: data });
                  if (!res.success) Message.error(res.msg || '保存失败');
                  else Message.success('已保存');
                }}
              >
                另存为 JSON
              </Button>
              <Button
                onClick={async () => {
                  const data = exportTheme(themeId);
                  if (!data) return;
                  const yaml = toYAML(JSON.parse(data));
                  const fullPath = await ipcEx.showSave.invoke({ defaultPath: `theme-${themeId}.yaml`, filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }] });
                  if (!fullPath) return;
                  const res = await ipcEx.saveTextFile.invoke({ fullPath, content: yaml });
                  if (!res.success) Message.error(res.msg || '保存失败');
                  else Message.success('已保存');
                }}
              >
                另存为 YAML
              </Button>
            </Space>
          </Form.Item>

          <Form.Item label='i18n 关键字样式'>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Select showSearch allowClear placeholder='选择或搜索 i18n key（支持 * 与 a.b.*）' value={i18nKey} onChange={setI18nKey} style={{ width: '100%' }}>
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
                  <Select showSearch allowClear placeholder='选择颜色变量，例如 --color-text-1' value={i18nStyle.colorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, colorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder='文字颜色，如 #333333' value={i18nStyle.color || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, color: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='字体大小，如 16px' value={i18nStyle.fontSize || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, fontSize: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input
                    placeholder='字重，如 600'
                    value={String(i18nStyle.fontWeight ?? '')}
                    onChange={(v) => {
                      const n = Number(v);
                      setI18nStyle((s) => (s ? { ...s, fontWeight: Number.isFinite(n) ? n : undefined } : s));
                    }}
                    style={{ width: '100%' }}
                  />

                  {/* 背景 */}
                  <div style={{ fontWeight: 500, marginTop: 8 }}>背景</div>
                  <Select showSearch allowClear placeholder='背景颜色变量，例如 --color-bg-1' value={i18nStyle.backgroundColorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundColorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder='背景色值，如 #ffffff' value={i18nStyle.backgroundColor || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundColor: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='背景图片，如 linear-gradient(...) 或 url(...)' value={i18nStyle.backgroundImage || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, backgroundImage: v || undefined } : s))} style={{ width: '100%' }} />

                  {/* 边框 */}
                  <div style={{ fontWeight: 500, marginTop: 8 }}>边框</div>
                  <Select showSearch allowClear placeholder='边框颜色变量，例如 --color-border-1' value={i18nStyle.borderColorVar} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderColorVar: v || undefined } : s))} style={{ width: '100%' }}>
                    {THEME_VARIABLE_KEYS.map((v) => (
                      <Select.Option key={v} value={v}>
                        {v}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input placeholder='边框颜色，如 #cccccc' value={i18nStyle.borderColor || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderColor: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='边框宽度，如 1px' value={i18nStyle.borderWidth || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderWidth: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='边框样式，如 solid / dashed' value={i18nStyle.borderStyle || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderStyle: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='圆角，如 4px' value={i18nStyle.borderRadius || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, borderRadius: v || undefined } : s))} style={{ width: '100%' }} />

                  {/* 间距 */}
                  <div style={{ fontWeight: 500, marginTop: 8 }}>间距</div>
                  <Input placeholder='内边距 padding，如 4px 8px' value={i18nStyle.padding || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, padding: v || undefined } : s))} style={{ width: '100%' }} />
                  <Input placeholder='外边距 margin，如 8px 12px' value={i18nStyle.margin || ''} onChange={(v) => setI18nStyle((s) => (s ? { ...s, margin: v || undefined } : s))} style={{ width: '100%' }} />
                </Space>
              )}

              {!i18nStyle && (
                <Space align='center'>
                  <span>当前未配置样式</span>
                  <Button type='primary' onClick={() => setI18nStyle({} as I18nKeyStyle)}>
                    新建样式
                  </Button>
                </Space>
              )}

              <Space align='center'>
                <Button
                  type='primary'
                  disabled={!i18nStyle}
                  onClick={() => {
                    if (!i18nStyle) return;
                    const data = exportTheme(themeId);
                    if (!data) return;
                    const pack = JSON.parse(data);
                    const target = mode === 'dark' ? pack.dark : pack.light;
                    target.i18nStyles = target.i18nStyles || {};
                    target.i18nStyles[i18nKey] = i18nStyle;
                    importTheme(JSON.stringify(pack));
                    applyI18nStyles(document.body);
                    Message.success('已更新 i18n 样式');
                  }}
                >
                  保存样式
                </Button>
                <span>预览：</span>
                <span data-i18n-key={i18nKey}>{i18nKey && !i18nKey.includes('*') ? t(i18nKey) : '样式预览文字'}</span>
              </Space>
            </Space>
          </Form.Item>

          <Form.Item label='默认模式'>
            <Space>
              <span>为当前主题“{list.find((t) => t.id === themeId)?.name}”设置默认模式：</span>
              <Radio.Group
                value={list.find((t) => t.id === themeId)?.defaultMode || 'none'}
                onChange={(value) => {
                  const data = exportTheme(themeId);
                  if (!data) return;
                  const pack = JSON.parse(data);
                  if (value === 'none') delete pack.defaultMode;
                  else pack.defaultMode = value;
                  importTheme(JSON.stringify(pack));
                }}
                type='button'
                size='small'
              >
                <Radio value='none'>无默认</Radio>
                <Radio value='light'>默认明亮</Radio>
                <Radio value='dark'>默认暗黑</Radio>
              </Radio.Group>
            </Space>
          </Form.Item>

          <Form.Item label='模式'>
            <Radio.Group value={mode} onChange={setMode} type='button'>
              <Radio value='light'>明亮</Radio>
              <Radio value='dark'>黑暗</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label='导入主题 JSON/YAML'>
            <Input.TextArea value={json} onChange={setJson} placeholder='粘贴导入的主题 JSON 或 YAML' autoSize />
            <Space style={{ marginTop: 8 }}>
              <Button
                type='primary'
                onClick={() => {
                  const data = parseAuto(json);
                  if (data) importTheme(JSON.stringify(data));
                }}
              >
                导入
              </Button>
              <Button onClick={() => setJson(exportTheme(themeId) || '')}>导出为 JSON 到下方</Button>
              <Button
                onClick={() => {
                  const data = exportTheme(themeId);
                  if (data) setJson(toYAML(JSON.parse(data)));
                }}
              >
                导出为 YAML 到下方
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Space>
    </div>
  );
};

export default ThemeSelector;
