import React from 'react';
import type { CampusRuleToolResult } from './types';
import EvidenceCard from './EvidenceCard';
import RuleErrorBox from './RuleErrorBox';
import CoursePlanPanel from './CoursePlanPanel';
import PolicyPanel from './PolicyPanel';
import DiagnosisPanel from './DiagnosisPanel';
import ConditionTable from './ConditionTable';
import './campus-rule.css';

// ========== AI 规则审阅结果容器（AnswerTemplate） ==========
// 视觉层级：状态 → ①结论 → 条件比对 → ②依据/条款 → ③建议 → ★解读诊断
// 数据链路与渲染逻辑不变：policy 填四块 + 诊断（risks 非空）；rag 仅证据卡。
// 风险信息不再单列（与条件比对表状态列同源重复），并入条件比对 + 解读诊断。

// ---------- 状态条：极轻 ----------
const statusBadgeMap: Record<CampusRuleToolResult['status'], { cls: string; text: string }> = {
  success: { cls: 'cr-status__badge', text: '✓ 处理完成' },
  partial: { cls: 'cr-status__badge cr-status__badge--partial', text: '◐ 部分完成' },
  error: { cls: 'cr-status__badge cr-status__badge--error', text: '⚠ 处理异常' },
  blocked: { cls: 'cr-status__badge cr-status__badge--error', text: '⚠ 请求被拒绝' },
};

// ---------- ① 结论：视觉第一重点 ----------
// 展示层轻处理：剥离 conclusion 中的 markdown 星号（不改数据本身）
const stripMd = (s: string): string => s.replace(/\*\*/g, '').trim();

const ConclusionBlock: React.FC<{ content: string; hasRisks: boolean }> = ({ content, hasRisks }) => (
  <div className='cr-block cr-block--first'>
    <div className='cr-block-title'>
      <span className='cr-dot' />
      ① 结论
    </div>
    <div className='cr-conclusion'>
      <div className='cr-conclusion__verdict'>{stripMd(content)}</div>
      <span
        className={
          hasRisks
            ? 'cr-conclusion__chip cr-conclusion__chip--warn'
            : 'cr-conclusion__chip cr-conclusion__chip--ok'
        }
      >
        {hasRisks ? '⚠ 需进一步确认' : '✓ 基本符合'}
      </span>
    </div>
  </div>
);

// ---------- ③ 建议：轻列表 ----------
const SuggestionBlock: React.FC<{ suggestions: string[] }> = ({ suggestions }) => (
  <div className='cr-block'>
    <div className='cr-block-title'>
      <span className='cr-dot' />
      ③ 建议
    </div>
    <ul className='cr-suggest'>
      {suggestions.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  </div>
);

// ========== 主容器 ==========
const AnswerTemplate: React.FC<{ result: CampusRuleToolResult; question?: string }> = ({ result, question }) => {
  const badge = statusBadgeMap[result.status];
  const hasRisks = (result.risks?.length ?? 0) > 0;

  return (
    <div className='cr-answer'>
      {/* 状态条 */}
      <div className='cr-status'>
        <span className={badge.cls}>{badge.text}</span>
        <span className='cr-status__tool'>{result.toolName}</span>
      </div>

      {/* 异常状态（失败/越界/缺失警告）低调展示 */}
      {result.error && (
        <div style={{ marginTop: 10 }}>
          <RuleErrorBox info={result.error} />
        </div>
      )}

      {/* ① 结论 */}
      {result.conclusion && <ConclusionBlock content={result.conclusion} hasRisks={hasRisks} />}

      {/* 条件比对（policy 判定器专属）：逐条「条件 × 你的值 × 要求 × 状态」，
          作为结论的判定明细；rag 无此数据不展示。
          优先按类别分组展示（category_matches），缺失时回退平铺表。 */}
      {(result.conditionGroups && result.conditionGroups.length > 0 && (
        <ConditionTable groups={result.conditionGroups} />
      )) ||
        (result.conditionTable && result.conditionTable.length > 0 && (
          <ConditionTable data={result.conditionTable} />
        ))}

      {/* ② 依据：引用证据来源（四块模板固定结构，policy / rag 均展示） */}
      {result.evidences && result.evidences.length > 0 && <EvidenceCard data={result.evidences} />}

      {/* 政策条款命中：与②依据同源于 source_quote，内容重复时不再重复展示；
          仅在无证据卡时兜底（正常 policy 结果均含 evidences，此块基本不出现） */}
      {!(result.evidences && result.evidences.length > 0) &&
        result.policyHits &&
        result.policyHits.length > 0 && <PolicyPanel data={result.policyHits} />}

      {/* 学业进度（课程规则工具专属） */}
      {result.coursePlan && result.coursePlan.length > 0 && <CoursePlanPanel data={result.coursePlan} />}

      {/* ③ 建议下一步（风险信息已并入条件比对表状态列 + 解读诊断，不再单列） */}
      {result.suggestions && result.suggestions.length > 0 && (
        <SuggestionBlock suggestions={result.suggestions} />
      )}

      {/* ★ 解读诊断：risks 非空且非错误状态时展示（rag 纯检索不触发） */}
      {hasRisks && result.status !== 'error' && <DiagnosisPanel result={result} question={question} />}
    </div>
  );
};

export default AnswerTemplate;
