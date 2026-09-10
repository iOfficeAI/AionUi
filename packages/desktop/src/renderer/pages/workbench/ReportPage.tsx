/**
 * Campus Rule Decoder — Report self-check page (2号)
 * 入口：工作台「最近查询」项点击进入。
 * 数据：读取该会话的工具消息（policy.query_policy / rag.search），
 * 经 tryParseCampusRuleResult 统一适配后，映射为自检统计：
 *   评分点覆盖率 / 缺失证据 / 引用问题 / 修改建议。
 * 全部基于真实工具返回，不造数据。
 */
import { ipcBridge } from '@/common';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages } from '@/common/chat/normalizeToolCall';
import type { CampusRuleToolResult, RiskItem } from '@renderer/components/campus-rule';
import { tryParseCampusRuleResult } from '@renderer/components/campus-rule/adaptPolicyResult';
import { Button, Card, Empty, Grid, Progress, Spin, Statistic, Tag, Typography } from '@arco-design/web-react';
import { ArrowLeft, Check, Close, Info, FileSearch, ThumbsUp } from '@icon-park/react';
import { loadLatestConversationMessages } from '@/renderer/utils/chat/messagePagination';
import { getActivityTime, getTimelineLabel } from '@/renderer/utils/chat/timeline';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

interface ReportStats {
  covered: number;
  missing: number;
  citationIssues: number;
  coverage: number;
  missingItems: Array<{ level: RiskItem['level']; title: string; description: string }>;
  citationItems: Array<{ title: string; detail: string }>;
  suggestions: string[];
  toolName: string;
  status: CampusRuleToolResult['status'];
}

const STATUS_TAG: Record<NonNullable<CampusRuleToolResult['status']>, { color: string; textKey: string }> = {
  success: { color: 'green', textKey: 'report.statusSuccess' },
  partial: { color: 'orange', textKey: 'report.statusPartial' },
  error: { color: 'red', textKey: 'report.statusError' },
  blocked: { color: 'red', textKey: 'report.statusError' },
};

const TOOL_LABEL: Record<string, string> = {
  query_policy: 'report.toolQueryPolicy',
  search: 'report.toolSearch',
};

/** 从 CampusRuleToolResult 映射自检统计（真实数据驱动） */
const buildStats = (result: CampusRuleToolResult): ReportStats => {
  const evidences = result.evidences ?? [];
  const goodEvidences = evidences.filter((e) => !e.lowRelevance);
  const lowEvidences = evidences.filter((e) => e.lowRelevance);
  const risks = result.risks ?? [];

  const missingItems = risks
    .filter((r) => r.level === 'high' || r.level === 'medium')
    .map((r) => ({ level: r.level, title: r.title, description: r.description }));

  const citationItems = lowEvidences.map((e) => ({
    title: `${e.fileName} · 相关度较低`,
    detail: e.quoteContent.slice(0, 140),
  }));
  if (result.error) {
    citationItems.unshift({ title: result.error.title, detail: result.error.description });
  }

  const covered = goodEvidences.length;
  const missing = missingItems.length;
  const issues = citationItems.length;
  const total = covered + missing + issues;
  const coverage = total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    covered,
    missing,
    citationIssues: issues,
    coverage,
    missingItems,
    citationItems,
    suggestions: result.suggestions ?? [],
    toolName: result.toolName,
    status: result.status,
  };
};

const ReportPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();

  const [convName, setConvName] = useState('');
  const [convTime, setConvTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!conversationId) {
        setLoading(false);
        return;
      }
      // 会话名称与时间
      try {
        const convs = await ipcBridge.database.getUserConversations.invoke({ limit: 100 });
        const found = convs?.items?.find((c) => c.id === conversationId);
        if (found && !cancelled) {
          setConvName(found.name ?? '');
          setConvTime(getActivityTime(found));
        }
      } catch (error) {
        console.error('[Report] Failed to load conversation meta:', error);
      }
      // 工具消息 → 统一适配 → 自检统计
      try {
        const page = await loadLatestConversationMessages(conversationId, { limit: 100, contentMode: 'full' });
        const toolMsgs = (page.items ?? []).filter(
          (m) => m.type === 'tool_call' || m.type === 'tool_group' || m.type === 'acp_tool_call'
        ) as ToolMessage[];
        const tools = normalizeToolMessages(toolMsgs);
        for (const tool of tools) {
          if (!tool.output) continue;
          const parsed = tryParseCampusRuleResult(tool.output);
          if (parsed) {
            if (!cancelled) setStats(buildStats(parsed));
            break;
          }
        }
      } catch (error) {
        console.error('[Report] Failed to load messages:', error);
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const statusTag = useMemo(() => {
    const key = stats?.status ?? 'error';
    return STATUS_TAG[key] ?? STATUS_TAG.error;
  }, [stats?.status]);

  if (loading) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Spin dot />
      </div>
    );
  }

  return (
    <div className='h-full overflow-y-auto'>
      <div className='mx-auto flex flex-col gap-20px pt-32px px-24px pb-48px' style={{ maxWidth: 860 }}>
        {/* 头部：返回 + 会话名 */}
        <div className='flex items-center gap-10px'>
          <Button
            type='text'
            icon={<ArrowLeft theme='outline' size='16' />}
            onClick={() => void navigate('/workbench')}
          >
            {t('report.backToWorkbench')}
          </Button>
        </div>
        <div>
          <Typography.Title heading={4} style={{ marginBottom: 4 }}>
            {t('report.title')}
          </Typography.Title>
          <div className='flex items-center gap-10px'>
            <Typography.Text style={{ fontSize: 14, maxWidth: 480 }} ellipsis>
              {convName || conversationId}
            </Typography.Text>
            {stats && (
              <>
                <Tag color={statusTag.color}>{t(statusTag.textKey)}</Tag>
                <Tag color='arcoblue'>{t(TOOL_LABEL[stats.toolName] ?? 'report.toolSearch')}</Tag>
                {convTime != null && (
                  <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                    {getTimelineLabel(convTime, Date.now(), t)}
                  </Typography.Text>
                )}
              </>
            )}
          </div>
        </div>

        {!stats ? (
          <Card style={{ borderRadius: 16 }}>
            <Empty
              description={
                <div className='flex flex-col items-center gap-4px'>
                  <span>{t('report.noToolResult')}</span>
                  <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                    {t('report.noToolResultHint')}
                  </Typography.Text>
                </div>
              }
            />
            <div className='flex justify-center mt-16px'>
              {conversationId && (
                <Button type='primary' onClick={() => void navigate(`/conversation/${conversationId}`)}>
                  {t('report.goBack')}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <>
            {/* 概览：覆盖率 + 三项计数 */}
            <Grid.Row gutter={[16, 16]}>
              <Grid.Col xs={24} sm={10}>
                <Card style={{ borderRadius: 16, height: '100%' }}>
                  <div className='flex items-center gap-20px'>
                    <Progress
                      type='circle'
                      percent={stats.coverage}
                      width={92}
                      strokeWidth={8}
                      color='var(--color-primary-6)'
                    />
                    <div className='flex flex-col gap-6px'>
                      <Typography.Text style={{ fontWeight: 500 }}>{t('report.coverage')}</Typography.Text>
                      <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                        {stats.covered} / {stats.covered + stats.missing + stats.citationIssues}{' '}
                        {t('report.coverageUnit')}
                      </Typography.Text>
                    </div>
                  </div>
                </Card>
              </Grid.Col>
              <Grid.Col xs={24} sm={14}>
                <Grid.Row gutter={[16, 16]}>
                  <Grid.Col xs={8}>
                    <Card style={{ borderRadius: 16 }}>
                      <Statistic title={t('report.coveredLabel')} value={stats.covered} groupSeparator={false} />
                    </Card>
                  </Grid.Col>
                  <Grid.Col xs={8}>
                    <Card style={{ borderRadius: 16 }}>
                      <Statistic
                        title={t('report.missingLabel')}
                        value={stats.missing}
                        groupSeparator={false}
                      />
                    </Card>
                  </Grid.Col>
                  <Grid.Col xs={8}>
                    <Card style={{ borderRadius: 16 }}>
                      <Statistic
                        title={t('report.citationLabel')}
                        value={stats.citationIssues}
                        groupSeparator={false}
                      />
                    </Card>
                  </Grid.Col>
                </Grid.Row>
              </Grid.Col>
            </Grid.Row>

            {/* 明细三栏 */}
            <Grid.Row gutter={[16, 16]}>
              {/* 缺失证据 */}
              <Grid.Col xs={24} lg={9}>
                <Card
                  style={{ borderRadius: 16, height: '100%' }}
                  title={
                    <div className='flex items-center gap-8px'>
                      <Info theme='outline' size='16' style={{ color: 'rgb(var(--red-6))' }} />
                      <span>{t('report.missingEvidence')}</span>
                    </div>
                  }
                >
                  <Typography.Text type='secondary' style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    {t('report.missingEvidenceHint')}
                  </Typography.Text>
                  {stats.missingItems.length === 0 ? (
                    <Typography.Text type='secondary' style={{ fontSize: 13 }}>
                      {t('report.emptyMissing')}
                    </Typography.Text>
                  ) : (
                    <div className='flex flex-col gap-8px'>
                      {stats.missingItems.map((item, idx) => (
                        <div
                          key={idx}
                          className='flex flex-col gap-2px p-10px'
                          style={{ borderRadius: 10, background: 'var(--color-fill-2)' }}
                        >
                          <div className='flex items-center gap-6px'>
                            <Tag color={item.level === 'high' ? 'red' : 'orange'} size='small'>
                              {item.level === 'high' ? '未满足' : '信息不足'}
                            </Tag>
                            <Typography.Text style={{ fontSize: 13 }}>{item.title}</Typography.Text>
                          </div>
                          <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                            {item.description}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Grid.Col>

              {/* 引用问题 */}
              <Grid.Col xs={24} lg={8}>
                <Card
                  style={{ borderRadius: 16, height: '100%' }}
                  title={
                    <div className='flex items-center gap-8px'>
                      <Close theme='outline' size='16' style={{ color: 'rgb(var(--orange-6))' }} />
                      <span>{t('report.citationIssues')}</span>
                    </div>
                  }
                >
                  <Typography.Text type='secondary' style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    {t('report.citationIssuesHint')}
                  </Typography.Text>
                  {stats.citationItems.length === 0 ? (
                    <Typography.Text type='secondary' style={{ fontSize: 13 }}>
                      {t('report.emptyCitation')}
                    </Typography.Text>
                  ) : (
                    <div className='flex flex-col gap-8px'>
                      {stats.citationItems.map((item, idx) => (
                        <div
                          key={idx}
                          className='flex flex-col gap-2px p-10px'
                          style={{ borderRadius: 10, background: 'var(--color-fill-2)' }}
                        >
                          <Typography.Text style={{ fontSize: 13 }}>{item.title}</Typography.Text>
                          <Typography.Text type='secondary' style={{ fontSize: 12 }} ellipsis={{ rows: 2 }}>
                            {item.detail}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Grid.Col>

              {/* 修改建议 */}
              <Grid.Col xs={24} lg={7}>
                <Card
                  style={{ borderRadius: 16, height: '100%' }}
                  title={
                    <div className='flex items-center gap-8px'>
                      <ThumbsUp theme='outline' size='16' style={{ color: 'rgb(var(--green-6))' }} />
                      <span>{t('report.suggestions')}</span>
                    </div>
                  }
                >
                  <Typography.Text type='secondary' style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    {t('report.suggestionsHint')}
                  </Typography.Text>
                  {stats.suggestions.length === 0 ? (
                    <Typography.Text type='secondary' style={{ fontSize: 13 }}>
                      {t('report.emptySuggestions')}
                    </Typography.Text>
                  ) : (
                    <div className='flex flex-col gap-8px'>
                      {stats.suggestions.map((item, idx) => (
                        <div key={idx} className='flex items-start gap-8px'>
                          <Check
                            theme='outline'
                            size='15'
                            style={{ color: 'rgb(var(--green-6))', marginTop: 2, flexShrink: 0 }}
                          />
                          <Typography.Text style={{ fontSize: 13 }}>{item}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Grid.Col>
            </Grid.Row>

            {/* 工具来源脚注 */}
            <div className='flex items-center gap-6px'>
              <FileSearch theme='outline' size='14' style={{ color: 'var(--color-text-3)' }} />
              <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                {t(TOOL_LABEL[stats.toolName] ?? 'report.toolSearch')} · {t('report.coverage')} {stats.coverage}%
              </Typography.Text>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
