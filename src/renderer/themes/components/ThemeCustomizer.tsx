import React from 'react';
import { Form, Grid, Input } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { THEME_VARIABLE_KEYS, FRIENDLY_LABELS } from '../variables';
import { themeManager } from '../manager';

const Row = Grid.Row;
const Col = Grid.Col;

const ThemeCustomizer: React.FC = () => {
  const { themeId, mode } = useTheme();
  const { pack } = themeManager.getCurrent();
  const vars = mode === 'dark' ? pack.dark.variables : pack.light.variables;

  const [localVars, setLocalVars] = React.useState<Record<string, string>>(() => ({ ...vars }));

  React.useEffect(() => {
    // 当切换主题/模式时，刷新面板值
    const fresh = mode === 'dark' ? pack.dark.variables : pack.light.variables;
    setLocalVars({ ...fresh });
  }, [themeId, mode]);

  const onChange = (key: string, value: string) => {
    const next = { ...localVars, [key]: value };
    setLocalVars(next);
    const updated = { ...pack } as typeof pack;
    if (mode === 'dark') updated.dark = { ...updated.dark, variables: next };
    else updated.light = { ...updated.light, variables: next };
    themeManager.upsertTheme(updated);
    themeManager.applyToDOM(document.body);
  };

  return (
    <div>
      <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--color-text-3)' }}>
        当前主题：{themeId} / {mode === 'dark' ? '暗黑模式' : '明亮模式'}
      </div>
      <Form layout='vertical' style={{ width: '100%' }}>
        <Row gutter={12} style={{ width: '100%' }}>
          {THEME_VARIABLE_KEYS.map((k) => (
            <Col key={k} xs={24} sm={12} md={12} lg={8} xl={8}>
              <Form.Item label={`${FRIENDLY_LABELS[k] || k} (${k})`}>
                <Input value={localVars[k] || ''} onChange={(v) => onChange(k, v)} placeholder='颜色值或 CSS 表达式' allowClear />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Form>
    </div>
  );
};

export default ThemeCustomizer;
