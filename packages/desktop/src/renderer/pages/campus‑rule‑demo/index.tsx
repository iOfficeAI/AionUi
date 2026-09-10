import React from 'react';
import { Table, Tag, Typography, Divider, Card } from '@arco-design/web-react';
import {
  AnswerTemplate,
  mockUserQuestions,
  mockCourseRuleSuccessResult,
  mockPolicyRetrievalSuccessResult,
  mockToolFailResult,
  mockMissingDocResult,
  mockOutOfScopeResult
} from '../../components/campus-rule';
import type { UserQuestionSample } from '../../components/campus-rule';

const scenarioColorMap: Record<UserQuestionSample['scenario'], string> = {
  normal: 'green',
  vague: 'arcoblue',
  missing: 'orange',
  out_of_scope: 'red'
};
const scenarioTextMap: Record<UserQuestionSample['scenario'], string> = {
  normal: '正常',
  vague: '模糊输入',
  missing: '资料缺失',
  out_of_scope: '越界请求'
};

export default function CampusRuleDemoPage() {
  const questionColumns = [
    { title: '编号', dataIndex: 'id', width: 60 },
    {
      title: '类别',
      dataIndex: 'category',
      width: 100,
      render: (c: UserQuestionSample['category']) => (c === 'policy' ? '政策检索' : '课程规则')
    },
    {
      title: '场景',
      dataIndex: 'scenario',
      width: 100,
      render: (s: UserQuestionSample['scenario']) => (
        <Tag color={scenarioColorMap[s]}>{scenarioTextMap[s]}</Tag>
      )
    },
    { title: '用户问题', dataIndex: 'question', width: 280 },
    { title: '预期表现', dataIndex: 'expected' }
  ];

  return (
    <div style={{ padding: 30, maxWidth: 1100, margin: '0 auto' }}>
      <h2>校园规则解码器 Mock 页面（完善版）</h2>
      <p style={{ color: '#666' }}>
        ✅ 统一回答模板：① 结论 → ② 依据 → ③ 风险/缺失信息 → ④ 建议下一步
      </p>

      <Divider orientation="left">一、10 个用户问题样例（5 政策 + 5 课程规则）</Divider>
      <Table columns={questionColumns} data={mockUserQuestions} pagination={false} size="small" />

      <Divider orientation="left">二、课程规则检查 · 成功（含完整四块回答模板）</Divider>
      <Card style={{ marginBottom: 12 }}>
        <Typography.Paragraph style={{ color: '#666' }}>
          👤 用户问题：帮我算一下我还差多少学分能毕业。
        </Typography.Paragraph>
        <AnswerTemplate result={mockCourseRuleSuccessResult} />
      </Card>

      <Divider orientation="left">三、政策检索 · 成功（转专业）</Divider>
      <Card style={{ marginBottom: 12 }}>
        <Typography.Paragraph style={{ color: '#666' }}>
          👤 用户问题：我想转专业，需要什么条件？
        </Typography.Paragraph>
        <AnswerTemplate result={mockPolicyRetrievalSuccessResult} />
      </Card>

      <Divider orientation="left">四、失败场景演示</Divider>
      <Typography.Title heading={5}>场景 A：工具调用失败</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <AnswerTemplate result={mockToolFailResult} />
      </Card>

      <Typography.Title heading={5}>场景 B：资料缺失</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <AnswerTemplate result={mockMissingDocResult} />
      </Card>

      <Typography.Title heading={5}>场景 C：越界请求（违规操作被拒绝）</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <AnswerTemplate result={mockOutOfScopeResult} />
      </Card>
    </div>
  );
}
