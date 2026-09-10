import type { BadgeProps } from '@arco-design/web-react';
import { Badge, Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { Checklist, Download, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import Markdown from '@renderer/components/Markdown';
import { AnswerTemplate, mockCourseRuleSuccessResult } from '@renderer/components/campus-rule';
import type { CampusRuleToolResult } from '@renderer/components/campus-rule';
import { tryParseCampusRuleResult } from '@renderer/components/campus-rule/adaptPolicyResult';
import RuleErrorBox from '@renderer/components/campus-rule/RuleErrorBox';
import './MessageToolGroupSummary.css';

// 测试开关，验证完成务必改为 false
const ENABLE_CAMPUS_RULE_TEST = false;

// Mock测试数据：统一回答模板（①结论 ②依据 ③风险缺失 ④建议下一步）
const mockCampusRuleResult: CampusRuleToolResult = mockCourseRuleSuccessResult;

/** 判断是否为校园规则/政策检索工具返回数据 */
const isCampusRuleResult = (data: unknown): data is CampusRuleToolResult => {
  if (typeof data !== 'object' || data === null) return false;
  const type = (data as Record<string, unknown>).type;
  return type === 'campus_rule_analysis' || type === 'policy_retrieval';
};

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  const hasDetail = displayItem.input || displayItem.output || item.truncated || item.imagePath;
  const [messageApi, messageContext] = Message.useMessage();

  const handleDownloadImage = useCallback(
    async (path: string) => {
      try {
        await downloadFileFromPath(path, getAcpImageFileName(path));
        messageApi.success(t('acp.image.download_success'));
      } catch (error) {
        console.error('[MessageToolGroupSummary] Failed to download image:', error);
        messageApi.error(t('acp.image.download_error'));
      }
    },
    [messageApi, t]
  );

  const loadFullItem = async () => {
    if (!item.truncated || fullItem || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFullItem();
  };

  // 普通工具，走原有渲染逻辑（校园规则结果已在折叠外层统一渲染，此处只展示工具调用过程）
  return (
    <div className='flex flex-col'>
      {messageContext}
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={statusToBadge(item.status)} className={item.status === 'running' ? 'badge-breathing' : ''} />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? toggleExpanded : undefined}
        >
          <span className='font-medium text-13px'>{displayItem.name}</span>
          {displayItem.description && displayItem.description !== displayItem.name && (
            <span className='m-l-4px opacity-80 text-13px'>{displayItem.description}</span>
          )}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={toggleExpanded}>
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {loadingFull && <div className='tool-detail-label'>Loading...</div>}
          {loadError && <div className='tool-detail-label'>Failed to load full output</div>}
          {displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
      {item.imagePath && (
        <div className='group relative m-l-20px m-t-8px overflow-hidden rounded border bg-1 p-2 max-w-280px'>
          <LocalImageView
            src={item.imagePath}
            alt={getAcpImageFileName(item.imagePath)}
            className='max-w-full max-h-320px object-contain rounded'
          />
          <Tooltip content={t('acp.image.download')}>
            <Button
              aria-label={t('acp.image.download_aria')}
              className='!absolute right-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
              type='secondary'
              size='mini'
              shape='circle'
              icon={<Download theme='outline' size='14' />}
              onClick={() => void handleDownloadImage(item.imagePath)}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const hasRunning = hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  // 提取校园规则/政策检索结果，在折叠面板外层直接渲染（默认可见，无需展开 View Steps）
  // 兼容两种返回：1) 前端自己的结构化结果（type=campus_rule_analysis/policy_retrieval）
  //              2) 队友 policy.query_policy 的返回（经适配层映射）
  const campusRuleResult = useMemo<CampusRuleToolResult | null>(() => {
    if (ENABLE_CAMPUS_RULE_TEST) return mockCampusRuleResult;
    for (const item of tools) {
      if (!item.output) continue;
      const parsed = tryParseCampusRuleResult(item.output);
      if (parsed) return parsed;
    }
    return null;
  }, [tools]);

  // 大结果截断兜底：query_policy 返回 JSON 可能因 _compact 截断导致上面的同步解析失败，
  // 这里对所有带消息定位信息的工具消息从数据库加载完整 output 再解析一次
  // （后端 compact 时可能不标 truncated 标记，所以不依赖 item.truncated，只要同步解析没结果就尝试回源）。
  const [fullCampusResult, setFullCampusResult] = useState<CampusRuleToolResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (ENABLE_CAMPUS_RULE_TEST) return;
    const loadFull = async () => {
      for (const item of tools) {
        if (!item.conversationId || !item.messageId) continue;
        // 同步已解析成功的不需要回源
        try {
          const message = await ipcBridge.database.getConversationMessage.invoke({
            conversation_id: item.conversationId,
            message_id: item.messageId,
          });
          const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
          if (next?.output) {
            const parsed = tryParseCampusRuleResult(next.output);
            if (parsed) {
              if (!cancelled) setFullCampusResult(parsed);
              return;
            }
          }
        } catch {
          // 单条加载失败不影响其他条目，继续尝试
        }
      }
    };
    void loadFull();
    return () => {
      cancelled = true;
    };
  }, [tools]);

  const effectiveCampusResult = campusRuleResult ?? fullCampusResult;

  // 截断检测：工具输出过大被后端硬切（含截断标记或 truncated 字段）时，
  // 模板必然解析失败——渲染明确提示，避免"没反应"的困惑。
  const hasTruncatedOutput = useMemo(
    () =>
      tools.some(
        (item) =>
          item.truncated ||
          (typeof item.output === 'string' && /\[truncated|…\[truncated/i.test(item.output))
      ),
    [tools]
  );

  // 提取用户问题原文（工具调用 input 里的 question/query/prompt，用于错误诊断的"现象"）
  const campusQuestion = useMemo<string | undefined>(() => {
    for (const item of tools) {
      if (!item.input) continue;
      const raw = item.input.trim();
      try {
        const parsed = JSON.parse(raw);
        const q = parsed?.question ?? parsed?.query ?? parsed?.prompt;
        if (typeof q === 'string' && q.trim()) return q.trim();
      } catch {
        // input 不是 JSON：可能就是问题原文
      }
      if (raw.length > 2 && raw.length < 200) return raw;
    }
    return undefined;
  }, [tools]);

  return (
    <div className='tool-group-summary'>
      {/* 工具返回过大被截断：明确提示（替代静默失败） */}
      {!effectiveCampusResult && hasTruncatedOutput && (
        <div className='campus-rule-inline-result' style={{ marginBottom: 12 }}>
          <RuleErrorBox
            info={{
              type: 'warning',
              title: '工具返回结果过大，已被系统截断',
              description:
                '本次查询匹配了多份政策，返回内容超出上限被截断，无法渲染规则模板。建议在提问中指明具体政策类型（如"保研政策""奖学金办法"），让系统只匹配一份政策文档后重试。',
            }}
          />
        </div>
      )}
      {/* 校园规则/政策检索结果：直接显示在折叠外面，用户无需展开 View Steps 即可看到 */}
      {effectiveCampusResult && (
        <div className='campus-rule-inline-result' style={{ marginBottom: 12 }}>
          {effectiveCampusResult.summary && (
            <div style={{ marginBottom: 12 }}>
              <Markdown>{effectiveCampusResult.summary}</Markdown>
            </div>
          )}
          <AnswerTemplate result={effectiveCampusResult} question={campusQuestion} />
        </div>
      )}
      <div className='tool-group-summary__header' onClick={() => setShowMore(!showMore)}>
        <span className='tool-group-summary__icon'>
          {hasRunning ? <Spin size={12} /> : <Checklist theme='outline' size='14' />}
        </span>
        <span className='tool-group-summary__label'>View Steps {tools.length > 0 ? `· ${tools.length}` : ''}</span>
        <span className={`tool-group-summary__arrow${showMore ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </div>
      {showMore && (
        <div className='tool-group-summary__body'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);

