import React, { useState } from 'react';
import type { CampusRuleToolResult } from './types';

interface Props {
  result: CampusRuleToolResult;
  /** 用户问题原文（来自工具调用的 input，用于展示"现象"） */
  question?: string;
}

// ========== ★ 解读诊断（DiagnosisPanel） ==========
// AI 审阅层：AnswerTemplate 内部更深一层的玻璃。
// 默认折叠（摘要 + 证据核验进度）；点击展开 01现象/02可能原因/03验证依据/04诊断结果。
// 触发条件由 AnswerTemplate 控制：risks 非空且 status!=='error'。
// 所有数据来自现有字段：question / risks / evidences / policyHits / conclusion，
// 置信度为展示层推导（已覆盖证据 ÷ 证据+风险项），不虚构后端字段。

// 展示层轻处理：剥离 markdown 星号（不改数据）
const stripMd = (s: string): string => s.replace(/\*\*/g, '').trim();

const levelLabelMap: Record<string, string> = {
  high: '未满足',
  medium: '信息不足',
  low: '需核实',
};

const levelDotMap: Record<string, string> = {
  high: 'cr-diagnosis__item-dot--high',
  medium: 'cr-diagnosis__item-dot--medium',
  low: 'cr-diagnosis__item-dot--low',
};

const DiagnosisPanel: React.FC<Props> = ({ result, question }) => {
  const [open, setOpen] = useState(false);

  const evidences = result.evidences ?? [];
  const goodEvidences = evidences.filter((e) => !e.lowRelevance);
  const risks = result.risks ?? [];

  // 置信度：已覆盖证据 / (已覆盖证据 + 风险项)，与报告自检页同口径
  const total = goodEvidences.length + risks.length;
  const confidence = total > 0 ? Math.round((goodEvidences.length / total) * 100) : 0;
  const confidenceColor = confidence >= 70 ? 'var(--color-success-6)' : confidence >= 40 ? 'var(--color-warning-6)' : 'var(--color-danger-6)';

  // 验证依据：优先取第一条非低相关证据，其次政策命中条款
  const evidence = goodEvidences[0] ?? evidences[0];
  const policyHit = result.policyHits?.[0];
  const evidenceSource = evidence?.fileName ?? policyHit?.source ?? '';
  const evidenceQuote = evidence?.quoteContent ?? policyHit?.quoteContent ?? '';

  const toggle = () => setOpen((v) => !v);

  return (
    <div className='cr-diagnosis'>
      {/* 头部：始终可见，点击展开/收起 */}
      <div className='cr-diagnosis__head' onClick={toggle} role='button' aria-expanded={open}>
        <span className='cr-diagnosis__title'>
          <span className='cr-diagnosis__spark'>✦</span>
          解读诊断
        </span>
        <span className={`cr-diagnosis__toggle${open ? ' cr-diagnosis__toggle--open' : ''}`}>
          {open ? '收起 ⌃' : '展开 ⌄'}
        </span>
      </div>

      {/* 摘要区：发现 N 项问题 + 证据核验进度 */}
      <div className='cr-diagnosis__summary'>
        <div className='cr-diagnosis__count'>发现 {risks.length} 项需要注意的问题</div>
        {risks.slice(0, 3).map((r) => (
          <div key={r.title} className='cr-diagnosis__item'>
            <span className={`cr-diagnosis__item-dot ${levelDotMap[r.level]}`} />
            {r.title}
          </div>
        ))}
        <div className='cr-diagnosis__verify'>
          <span className='cr-diagnosis__verify-label'>证据核验</span>
          <div className='cr-diagnosis__bar'>
            <div
              className='cr-diagnosis__bar-fill'
              style={{ width: `${confidence}%`, background: confidenceColor }}
            />
          </div>
          <span className='cr-diagnosis__verify-num' style={{ color: confidenceColor }}>
            {confidence}%
          </span>
        </div>
      </div>

      {/* 展开区：01~04 结构化审阅（max-height + opacity + translate 动画） */}
      <div className={`cr-diagnosis__collapsible${open ? ' cr-diagnosis__collapsible--open' : ''}`}>
        <div className='cr-diagnosis__body'>
          {/* 01 现象 */}
          {question && (
            <div className='cr-diagnosis__row'>
              <span className='cr-diagnosis__row-index'>01</span>
              <div className='cr-diagnosis__row-body'>
                <div className='cr-diagnosis__row-label'>现象</div>
                <div className='cr-diagnosis__row-text'>“{question}”</div>
              </div>
            </div>
          )}

          {/* 02 可能原因 */}
          <div className='cr-diagnosis__row'>
            <span className='cr-diagnosis__row-index'>02</span>
            <div className='cr-diagnosis__row-body'>
              <div className='cr-diagnosis__row-label'>可能原因</div>
              {risks.slice(0, 3).map((r) => (
                <div key={r.title} className='cr-diagnosis__item' style={{ padding: '2px 0' }}>
                  <span className={`cr-diagnosis__item-dot ${levelDotMap[r.level]}`} />
                  <span>
                    {levelLabelMap[r.level]} · {r.title}：{r.description}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 03 验证依据 */}
          {evidenceQuote && (
            <div className='cr-diagnosis__row'>
              <span className='cr-diagnosis__row-index'>03</span>
              <div className='cr-diagnosis__row-body'>
                <div className='cr-diagnosis__row-label'>验证依据</div>
                {evidenceSource && <div className='cr-diagnosis__row-source'>来源：{evidenceSource}</div>}
                <div className='cr-diagnosis__row-text cr-diagnosis__row-text--quote'>“{evidenceQuote}”</div>
              </div>
            </div>
          )}

          {/* 04 诊断结果 + 置信度（进度条延迟 150ms 出现） */}
          <div className='cr-diagnosis__row'>
            <span className='cr-diagnosis__row-index'>04</span>
            <div className='cr-diagnosis__row-body'>
              <div className='cr-diagnosis__row-label'>诊断结果</div>
              <div className='cr-diagnosis__row-text'>{result.conclusion ? stripMd(result.conclusion) : '—'}</div>
              <div className='cr-diagnosis__verify' style={{ marginTop: 8 }}>
                <span className='cr-diagnosis__verify-label'>置信度</span>
                <div className='cr-diagnosis__bar'>
                  <div
                    className={`cr-diagnosis__bar-fill${open ? ' cr-diagnosis__bar-fill--delay' : ''}`}
                    style={{ width: `${confidence}%`, background: confidenceColor }}
                  />
                </div>
                <span className='cr-diagnosis__verify-num' style={{ color: confidenceColor }}>
                  {confidence}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiagnosisPanel;
