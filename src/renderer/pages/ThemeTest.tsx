/**
 * 主题系统测试页面
 */

import React, { useState } from 'react';
import { Button, Card, Space, Typography, Input, Select, Message, Divider } from '@arco-design/web-react';
import { useTheme } from '../themes/ThemeProvider';
import { ThemeSelector } from '../components/ThemeSelector';

const { Title, Text } = Typography;
const { Option } = Select;

export const ThemeTest: React.FC = () => {
  const [themeSelectorVisible, setThemeSelectorVisible] = useState(false);
  const [testInput, setTestInput] = useState('测试输入框');

  const { currentTheme, themeMode, systemTheme } = useTheme();

  const showSuccess = () => Message.success('这是成功消息');
  const showWarning = () => Message.warning('这是警告消息');
  const showError = () => Message.error('这是错误消息');
  const showInfo = () => Message.info('这是信息消息');

  return (
    <div
      style={{
        padding: 24,
        minHeight: '100vh',
        background: 'var(--theme-background)',
        color: 'var(--theme-text-primary)',
      }}
    >
      <Title heading={2} style={{ marginBottom: 24 }}>
        主题系统测试页面
      </Title>

      {/* 当前主题状态 */}
      <Card title='当前主题状态' style={{ marginBottom: 24 }}>
        <Space direction='vertical' size='medium' style={{ width: '100%' }}>
          <div>
            <Text style={{ fontWeight: 'bold' }}>主题名称：</Text>
            <Text>{currentTheme?.manifest.name || 'Unknown'}</Text>
          </div>
          <div>
            <Text style={{ fontWeight: 'bold' }}>主题ID：</Text>
            <Text code>{currentTheme?.manifest.id || 'Unknown'}</Text>
          </div>
          <div>
            <Text style={{ fontWeight: 'bold' }}>主题模式：</Text>
            <Text>{themeMode}</Text>
          </div>
          <div>
            <Text style={{ fontWeight: 'bold' }}>系统主题：</Text>
            <Text>{systemTheme}</Text>
          </div>
          <div>
            <Text style={{ fontWeight: 'bold' }}>主色调：</Text>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  background: 'var(--theme-primary)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 4,
                }}
              />
              <Text code>{currentTheme?.manifest.variables.primary}</Text>
            </div>
          </div>
        </Space>
      </Card>

      {/* 主题管理 */}
      <Card title='主题管理' style={{ marginBottom: 24 }}>
        <Button type='primary' onClick={() => setThemeSelectorVisible(true)}>
          打开主题选择器
        </Button>
      </Card>

      {/* UI组件测试 */}
      <Card title='UI组件测试' style={{ marginBottom: 24 }}>
        <Space direction='vertical' size='large' style={{ width: '100%' }}>
          {/* 按钮测试 */}
          <div>
            <Title heading={5}>按钮组件</Title>
            <Space wrap>
              <Button type='primary'>主要按钮</Button>
              <Button type='secondary'>次要按钮</Button>
              <Button type='outline'>边框按钮</Button>
              <Button type='dashed'>虚线按钮</Button>
              <Button type='text'>文本按钮</Button>
              <Button disabled>禁用按钮</Button>
            </Space>
          </div>

          <Divider />

          {/* 输入框测试 */}
          <div>
            <Title heading={5}>输入组件</Title>
            <Space direction='vertical' style={{ width: '100%', maxWidth: 400 }}>
              <Input placeholder='请输入内容' value={testInput} onChange={setTestInput} />
              <Select placeholder='请选择选项' style={{ width: '100%' }} allowClear>
                <Option value='option1'>选项一</Option>
                <Option value='option2'>选项二</Option>
                <Option value='option3'>选项三</Option>
              </Select>
            </Space>
          </div>

          <Divider />

          {/* 消息测试 */}
          <div>
            <Title heading={5}>消息组件</Title>
            <Space wrap>
              <Button onClick={showSuccess} status='success'>
                成功消息
              </Button>
              <Button onClick={showWarning} status='warning'>
                警告消息
              </Button>
              <Button onClick={showError} status='danger'>
                错误消息
              </Button>
              <Button onClick={showInfo}>信息消息</Button>
            </Space>
          </div>
        </Space>
      </Card>

      {/* 主题色彩展示 */}
      <Card title='主题色彩展示' style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          {currentTheme &&
            Object.entries(currentTheme.manifest.variables).map(([key, value]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    background: value,
                    border: '1px solid var(--theme-border)',
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--theme-text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    {key}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--theme-text-tertiary)',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {value}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* CSS变量测试 */}
      <Card title='CSS变量测试'>
        <div
          style={{
            padding: 16,
            background: 'var(--theme-background-secondary)',
            border: '1px solid var(--theme-border)',
            borderRadius: 8,
          }}
        >
          <Text>
            这个区域使用了主题CSS变量：
            <br />
            - background: var(--theme-background-secondary)
            <br />
            - border: 1px solid var(--theme-border)
            <br />- color: var(--theme-text-primary) (继承)
          </Text>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border-hover)',
              borderRadius: 6,
            }}
          >
            <Text style={{ color: 'var(--theme-text-secondary)' }}>嵌套的surface容器，展示了主题变量的层级使用</Text>
          </div>
        </div>
      </Card>

      {/* 主题选择器弹窗 */}
      <ThemeSelector visible={themeSelectorVisible} onClose={() => setThemeSelectorVisible(false)} />
    </div>
  );
};

export default ThemeTest;
