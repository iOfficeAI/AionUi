import React from 'react';
import { Button, Form, Input, Message, Space } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { loadYamlPreset } from '../presets/index';
import { parseAuto, toYAML } from '../yaml-utils';
import * as ipcEx from '@/common/ipcBridgeEx';
import { useTranslation } from 'react-i18next';

const ThemeImportExportPanel: React.FC = () => {
  const { themeId, exportTheme, importTheme } = useTheme();
  const [json, setJson] = React.useState('');
  const { t } = useTranslation();

  return (
    <div>
      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Form layout='vertical'>
          {/* built-in presets moved to ThemeBasicSelectorPanel */}

          <Form.Item label={t('theme.panel.importFile', '从文件导入（JSON/YAML）')}>
            <input
              type='file'
              accept='.json,.yaml,.yml,application/json,application/x-yaml,text/yaml'
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await f.text();
                  const preset = await loadYamlPreset(text);
                  if (preset) return importTheme(JSON.stringify(preset));
                  const data = parseAuto(text);
                  if (data) return importTheme(JSON.stringify(data));
                  Message.error(t('theme.error.invalidFile', '文件格式不正确'));
                } catch (error: any) {
                  Message.error(t('theme.error.importFailed', '导入失败：') + error.message);
                }
              }}
            />
          </Form.Item>

          <Form.Item label={t('theme.panel.exportFile', '保存为文件（JSON/YAML）')}>
            <Space>
              <Button
                onClick={async () => {
                  try {
                    const data = exportTheme(themeId);
                    if (!data) return;
                    const fullPath = await ipcEx.showSave.invoke({
                      defaultPath: `theme-${themeId}.json`,
                      filters: [{ name: 'JSON', extensions: ['json'] }],
                    });
                    if (!fullPath) return;
                    const res = await ipcEx.saveTextFile.invoke({ fullPath, content: data });
                    if (!res.success) Message.error(res.msg || t('theme.error.saveFailed', '保存失败'));
                    else Message.success(t('theme.success.saved', '已保存'));
                  } catch (error: any) {
                    Message.error(t('theme.error.saveFailed', '保存失败：') + error.message);
                  }
                }}
              >
                {t('theme.action.saveAsJson', '保存为 JSON')}
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const data = exportTheme(themeId);
                    if (!data) return;
                    const yaml = toYAML(JSON.parse(data));
                    const fullPath = await ipcEx.showSave.invoke({
                      defaultPath: `theme-${themeId}.yaml`,
                      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
                    });
                    if (!fullPath) return;
                    const res = await ipcEx.saveTextFile.invoke({ fullPath, content: yaml });
                    if (!res.success) Message.error(res.msg || t('theme.error.saveFailed', '保存失败'));
                    else Message.success(t('theme.success.saved', '已保存'));
                  } catch (error: any) {
                    Message.error(t('theme.error.saveFailed', '保存失败：') + error.message);
                  }
                }}
              >
                {t('theme.action.saveAsYaml', '保存为 YAML')}
              </Button>
            </Space>
          </Form.Item>

          <Form.Item label={t('theme.panel.importText', '粘贴 JSON/YAML 导入')}>
            <Input.TextArea value={json} onChange={setJson} placeholder={t('theme.placeholder.pasteTheme', '粘贴 JSON 或 YAML')} autoSize />
            <Space style={{ marginTop: 8 }}>
              <Button
                type='primary'
                onClick={() => {
                  try {
                    const data = parseAuto(json);
                    if (data) {
                      importTheme(JSON.stringify(data));
                      Message.success(t('theme.success.imported', '主题导入成功'));
                    } else {
                      Message.error(t('theme.error.invalidFormat', '无效的主题格式'));
                    }
                  } catch (error: any) {
                    Message.error(t('theme.error.importFailed', '导入失败：') + error.message);
                  }
                }}
              >
                {t('theme.action.import', '导入')}
              </Button>
              <Button
                onClick={() => {
                  const data = exportTheme(themeId);
                  if (data) setJson(data);
                }}
              >
                {t('theme.action.exportToJson', '导出为 JSON 到下方')}
              </Button>
              <Button
                onClick={() => {
                  try {
                    const data = exportTheme(themeId);
                    if (data) setJson(toYAML(JSON.parse(data)));
                  } catch (error: any) {
                    Message.error(t('theme.error.exportFailed', '导出失败：') + error.message);
                  }
                }}
              >
                {t('theme.action.exportToYaml', '导出为 YAML 到下方')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Space>
    </div>
  );
};

export default ThemeImportExportPanel;
