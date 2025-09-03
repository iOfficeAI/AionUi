import React from 'react';
import { Form, Grid, Input, Typography } from '@arco-design/web-react';
import { useTheme } from '../provider';
import { themeManager } from '../manager';
import { useTranslation } from 'react-i18next';

const Row = Grid.Row;
const Col = Grid.Col;

// 代码高亮相关的可配置属性
const CODE_HIGHLIGHT_PROPERTIES = [
  { key: 'background', label: '背景色', placeholder: '#ffffff' },
  { key: 'color', label: '前景色', placeholder: '#333333' },
  { key: 'fontFamily', label: '字体', placeholder: 'Monaco, Consolas, monospace' },
  { key: 'fontSize', label: '字体大小', placeholder: '14px' },
  { key: 'lineHeight', label: '行高', placeholder: '1.5' },
  { key: 'keyword', label: '关键字', placeholder: '#0066cc' },
  { key: 'string', label: '字符串', placeholder: '#008000' },
  { key: 'comment', label: '注释', placeholder: '#999999' },
  { key: 'number', label: '数字', placeholder: '#cc6600' },
  { key: 'function', label: '函数', placeholder: '#6600cc' },
  { key: 'variable', label: '变量', placeholder: '#333333' },
  { key: 'operator', label: '操作符', placeholder: '#666666' },
  { key: 'type', label: '类型', placeholder: '#0066cc' },
  { key: 'constant', label: '常量', placeholder: '#cc6600' },
  { key: 'punctuation', label: '标点', placeholder: '#666666' },
  { key: 'className', label: '类名', placeholder: '#0066cc' },
  { key: 'property', label: '属性', placeholder: '#cc6600' },
  { key: 'tag', label: '标签', placeholder: '#0066cc' },
  { key: 'attr', label: '属性名', placeholder: '#cc6600' },
  { key: 'headerBackground', label: '头部背景', placeholder: '#f5f5f5' },
  { key: 'headerColor', label: '头部文字', placeholder: '#333333' },
  { key: 'lineNumberColor', label: '行号颜色', placeholder: '#999999' },
  { key: 'selectedLineBackground', label: '选中行背景', placeholder: '#e6f7ff' },
  { key: 'borderColor', label: '边框颜色', placeholder: '#dddddd' },
  { key: 'scrollbarColor', label: '滚动条颜色', placeholder: '#cccccc' },
  { key: 'iconColor', label: '图标颜色', placeholder: '#666666' },
  { key: 'inlineCodeBackground', label: '内联代码背景', placeholder: '#f5f5f5' },
  { key: 'inlineCodeBorder', label: '内联代码边框', placeholder: '#dddddd' },
] as const;

const CodeHighlightCustomizer: React.FC = () => {
  const { themeId, mode, importTheme, exportTheme } = useTheme();
  const { t } = useTranslation();
  const { pack } = themeManager.getCurrent();
  const currentTokens = mode === 'dark' ? pack.dark : pack.light;
  const codeHighlight = currentTokens.codeHighlight || {};

  const onChange = (property: string, value: string) => {
    // 通过 export/import 走统一的写回路径，确保上下文刷新
    const data = exportTheme(themeId);
    if (!data) return;
    const parsed = JSON.parse(data);
    const targetTokens = mode === 'dark' ? parsed.dark : parsed.light;
    if (!targetTokens.codeHighlight) targetTokens.codeHighlight = {};
    targetTokens.codeHighlight[property] = value;
    importTheme(JSON.stringify(parsed));
  };

  return (
    <div>
      <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--color-text-3)' }}>
        {t('theme.help.currentTheme', '当前主题：')}
        {themeId} / {mode === 'dark' ? t('theme.mode.dark', '暗黑模式') : t('theme.mode.light', '明亮模式')}
      </div>

      <Form layout='vertical' style={{ width: '100%' }}>
        <Typography.Title heading={6} style={{ marginBottom: '16px' }}>
          {t('theme.section.basic', '基础设置')}
        </Typography.Title>
        <Row gutter={12} style={{ width: '100%' }}>
          {CODE_HIGHLIGHT_PROPERTIES.slice(0, 5).map((prop) => (
            <Col key={prop.key} xs={24} sm={12} md={8}>
              <Form.Item label={t(`theme.codeHighlight.${prop.key}`, prop.label)}>
                <Input value={(codeHighlight[prop.key] as string) || ''} onChange={(value) => onChange(prop.key, value)} placeholder={prop.placeholder} allowClear />
              </Form.Item>
            </Col>
          ))}
        </Row>

        <Typography.Title heading={6} style={{ marginBottom: '16px', marginTop: '24px' }}>
          {t('theme.section.syntaxColors', '语法高亮颜色')}
        </Typography.Title>
        <Row gutter={12} style={{ width: '100%' }}>
          {CODE_HIGHLIGHT_PROPERTIES.slice(5, 19).map((prop) => (
            <Col key={prop.key} xs={24} sm={12} md={8}>
              <Form.Item label={t(`theme.codeHighlight.${prop.key}`, prop.label)}>
                <Input value={(codeHighlight[prop.key] as string) || ''} onChange={(value) => onChange(prop.key, value)} placeholder={prop.placeholder} allowClear />
              </Form.Item>
            </Col>
          ))}
        </Row>

        <Typography.Title heading={6} style={{ marginBottom: '16px', marginTop: '24px' }}>
          {t('theme.section.uiElements', 'UI 元素')}
        </Typography.Title>
        <Row gutter={12} style={{ width: '100%' }}>
          {CODE_HIGHLIGHT_PROPERTIES.slice(19).map((prop) => (
            <Col key={prop.key} xs={24} sm={12} md={8}>
              <Form.Item label={t(`theme.codeHighlight.${prop.key}`, prop.label)}>
                <Input value={(codeHighlight[prop.key] as string) || ''} onChange={(value) => onChange(prop.key, value)} placeholder={prop.placeholder} allowClear />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Form>
    </div>
  );
};

export default CodeHighlightCustomizer;
