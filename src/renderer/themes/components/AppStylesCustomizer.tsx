import React from 'react';
import { Form, Grid, Input, Typography, Collapse } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { themeManager } from '../manager';
import { useTranslation } from 'react-i18next';

const Row = Grid.Row;
const Col = Grid.Col;

// 扩展的 appStyles 键值和友好标签
const APP_STYLE_KEYS = ['o-logo', 'o-main', 'o-slider', 'o-workspace', 'o-slider-menu', 'o-setting-group', 'o-tips', 'o-message-right', 'o-message-left', 'o-diff-header', 'o-icon-color', 'o-textarea', 'o-dropdown-item', 'o-sendbox-dot', 'o-focus-shadow', 'o-drag-resizer', 'o-primary-color', 'o-chat-message-user', 'o-chat-message-assistant', 'o-chat-message-system'] as const;

const APP_STYLE_LABELS: Record<string, string> = {
  'o-logo': 'Logo样式',
  'o-main': '主区域背景',
  'o-slider': '侧栏整体',
  'o-workspace': 'Workspace区块背景',
  'o-slider-menu': '侧栏菜单项',
  'o-setting-group': '设置/输入容器',
  'o-tips': '提示消息',
  'o-message-right': '右侧消息气泡',
  'o-message-left': '左侧消息气泡',
  'o-diff-header': 'Diff头部背景',
  'o-icon-color': '图标主色',
  'o-textarea': '文本输入区域',
  'o-dropdown-item': '下拉菜单项',
  'o-sendbox-dot': '发送按钮圆点',
  'o-focus-shadow': '焦点阴影效果',
  'o-drag-resizer': '拖拽调整器',
  'o-primary-color': '主题色',
  'o-chat-message-user': '用户消息样式',
  'o-chat-message-assistant': 'AI助手消息样式',
  'o-chat-message-system': '系统消息样式',
};

// 定义每个 appStyle 的可配置属性
const APP_STYLE_PROPERTIES = [
  { key: 'color', label: '颜色', placeholder: '#4E5969 或 currentColor' },
  { key: 'backgroundColor', label: '背景颜色', placeholder: 'transparent 或 #ffffff' },
  { key: 'backgroundImage', label: '背景图片', placeholder: 'linear-gradient(...) 或 url(...)' },
  { key: 'borderColor', label: '边框颜色', placeholder: '#cccccc' },
  { key: 'borderWidth', label: '边框宽度', placeholder: '1px' },
  { key: 'borderStyle', label: '边框样式', placeholder: 'solid / dashed / dotted' },
  { key: 'borderRadius', label: '圆角', placeholder: '4px' },
  { key: 'padding', label: '内边距', placeholder: '8px 12px' },
  { key: 'margin', label: '外边距', placeholder: '8px 12px' },
  { key: 'boxShadow', label: '阴影', placeholder: '0 2px 8px rgba(0,0,0,0.1)' },
] as const;

// 伪状态属性
const PSEUDO_STATES = ['hover', 'active', 'focus'] as const;

const AppStylesCustomizer: React.FC = () => {
  const { themeId, mode } = useTheme();
  const { t } = useTranslation();
  const { pack } = themeManager.getCurrent();
  const currentTokens = mode === 'dark' ? pack.dark : pack.light;
  const appStyles = currentTokens.appStyles || {};
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const onChange = (styleKey: string, property: string, value: string, pseudoState?: string) => {
    const updated = { ...pack };
    const targetTokens = mode === 'dark' ? updated.dark : updated.light;

    if (!targetTokens.appStyles) {
      targetTokens.appStyles = {};
    }

    if (!targetTokens.appStyles[styleKey]) {
      targetTokens.appStyles[styleKey] = {};
    }

    const currentStyle = targetTokens.appStyles[styleKey] as Record<string, unknown>;

    if (pseudoState) {
      if (!currentStyle[pseudoState]) {
        currentStyle[pseudoState] = {};
      }
      (currentStyle[pseudoState] as Record<string, unknown>)[property] = value;
    } else {
      currentStyle[property] = value;
    }

    themeManager.upsertTheme(updated);
    themeManager.applyToDOM(document.body);
    // 强制刷新以反映受控输入的新值
    forceUpdate();
  };

  const getPropertyValue = (styleKey: string, property: string, pseudoState?: string): string => {
    const style = appStyles[styleKey] as Record<string, unknown>;
    if (!style) return '';

    if (pseudoState) {
      return ((style[pseudoState] as Record<string, unknown>)?.[property] as string) || '';
    }

    return (style[property] as string) || '';
  };

  return (
    <div>
      <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--color-text-3)' }}>
        {t('theme.help.currentTheme', '当前主题：')}
        {themeId} / {mode === 'dark' ? t('theme.mode.dark', '暗黑模式') : t('theme.mode.light', '明亮模式')}
      </div>

      <Form layout='vertical' style={{ width: '100%' }}>
        {APP_STYLE_KEYS.map((styleKey) => (
          <div key={styleKey} style={{ marginBottom: '24px' }}>
            <Typography.Title
              heading={6}
              style={{
                marginBottom: '12px',
                color: 'var(--color-text-2)',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {APP_STYLE_LABELS[styleKey]} ({styleKey})
            </Typography.Title>

            <Collapse>
              <Collapse.Item header={t('theme.section.baseStyle', '基础样式')} name='base'>
                <Row gutter={12} style={{ width: '100%' }}>
                  {APP_STYLE_PROPERTIES.map((prop) => (
                    <Col key={prop.key} xs={24} sm={12} md={8}>
                      <Form.Item label={prop.label}>
                        <Input value={getPropertyValue(styleKey, prop.key)} onChange={(value) => onChange(styleKey, prop.key, value)} placeholder={prop.placeholder} allowClear />
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
              </Collapse.Item>

              {PSEUDO_STATES.map((pseudoState) => (
                <Collapse.Item key={pseudoState} header={t(`theme.section.${pseudoState}`, `${pseudoState.toUpperCase()} 状态`)} name={pseudoState}>
                  <Row gutter={12} style={{ width: '100%' }}>
                    {APP_STYLE_PROPERTIES.map((prop) => (
                      <Col key={prop.key} xs={24} sm={12} md={8}>
                        <Form.Item label={prop.label}>
                          <Input value={getPropertyValue(styleKey, prop.key, pseudoState)} onChange={(value) => onChange(styleKey, prop.key, value, pseudoState)} placeholder={prop.placeholder} allowClear />
                        </Form.Item>
                      </Col>
                    ))}
                  </Row>
                </Collapse.Item>
              ))}
            </Collapse>
          </div>
        ))}
      </Form>
    </div>
  );
};

export default AppStylesCustomizer;
