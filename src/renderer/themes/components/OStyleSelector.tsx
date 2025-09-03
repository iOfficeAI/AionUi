import React from 'react';
import { Card, Grid, Input, Space, Tag, Typography } from '@arco-design/web-react';
import { themeManager } from '../manager';

const Row = Grid.Row;
const Col = Grid.Col;

const OStyleSelector: React.FC = () => {
  const { pack, mode } = themeManager.getCurrent();
  const app = (mode === 'dark' ? pack.dark : pack.light).appStyles || {};
  const allKeys = React.useMemo(() => Object.keys(app).sort(), [pack.id, mode]);
  const [filter, setFilter] = React.useState('');

  const keys = React.useMemo(() => allKeys.filter((k) => k.toLowerCase().includes(filter.trim().toLowerCase())), [allKeys, filter]);

  return (
    <div>
      <Space direction='vertical' size='large' style={{ width: '100%' }}>
        <Space align='center' style={{ justifyContent: 'space-between' }}>
          <Typography.Text type='secondary'>预览并快速检查 o-* 样式桶（data-app-style）。</Typography.Text>
          <Input value={filter} onChange={setFilter} allowClear placeholder='筛选 o-* 关键字' style={{ width: 260 }} />
        </Space>
        <Row gutter={12}>
          {keys.map((k) => (
            <Col key={k} xs={24} sm={12} md={8} lg={6}>
              <Card size='small' style={{ borderRadius: 10 }}>
                <Space direction='vertical' style={{ width: '100%' }}>
                  <Space align='center' style={{ justifyContent: 'space-between' }}>
                    <Typography.Text>{k}</Typography.Text>
                    <Tag size='small' color='arcoblue'>
                      preview
                    </Tag>
                  </Space>
                  <div
                    tabIndex={0}
                    data-app-style={k}
                    style={{
                      height: 56,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed var(--color-border-1)',
                      borderRadius: 8,
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 12 }}>data-app-style=&quot;{k}&quot;</span>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
        {keys.length === 0 && <Typography.Text type='secondary'>当前主题暂无 appStyles 或筛选条件无匹配项。</Typography.Text>}
      </Space>
    </div>
  );
};

export default OStyleSelector;
