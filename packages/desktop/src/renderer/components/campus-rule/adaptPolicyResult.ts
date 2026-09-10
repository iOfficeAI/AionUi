// ========== policy.query_policy → CampusRuleToolResult 适配层 ==========
// 把队友 policy-search 的 query_policy 结构化返回，映射成前端四块模板需要的数据结构。
// 队友返回结构:
// {
//   "total_policies": N,
//   "results": [
//     {
//       "policy_title": "...",
//       "policy_category": "...",
//       "overall_verdict": "likely_eligible" | "not_eligible" | "needs_more_info" | "needs_review",
//       "category_matches": {...},
//       "condition_matches": [{ item, match, user_value, requirement, detail, source_quote }],
//       "missing_info": [...],
//       "needs_manual_review": [...]
//     }
//   ]
// }

import type { CampusRuleToolResult, ConditionGroup, ConditionRow, EvidenceItem, PolicyHit, RiskItem } from './types';

// verdict → 中文结论 映射
const VERDICT_TEXT: Record<string, string> = {
  likely_eligible: '符合条件',
  not_eligible: '暂不符合条件',
  needs_more_info: '信息不足，需补充',
  needs_review: '需人工复核',
};

// verdict → 风险等级
const VERDICT_RISK_LEVEL: Record<string, RiskItem['level']> = {
  likely_eligible: 'low',
  not_eligible: 'high',
  needs_more_info: 'medium',
  needs_review: 'medium',
};

/** 判断是否为 policy.query_policy 的返回结构 */
export const isPolicyQueryResult = (data: unknown): boolean => {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  // 有 results 数组且每项含 overall_verdict / condition_matches
  if (!Array.isArray(obj.results)) return false;
  return obj.results.some(
    (r) =>
      r &&
      typeof r === 'object' &&
      'overall_verdict' in (r as Record<string, unknown>) &&
      'condition_matches' in (r as Record<string, unknown>)
  );
};

/** 把 policy.query_policy 的返回映射成 CampusRuleToolResult */
export const adaptPolicyQueryResult = (raw: unknown): CampusRuleToolResult | null => {
  if (!isPolicyQueryResult(raw)) return null;
  const obj = raw as { results: Array<Record<string, unknown>> };
  const results = obj.results;

  if (results.length === 0) {
    return {
      type: 'policy_retrieval',
      toolName: 'query_policy',
      status: 'error',
      summary: '未检索到相关政策。',
      error: { type: 'warning', title: '无匹配结果', description: '知识库中没有相关政策或用户信息不足。' },
    };
  }

  // 取第一个政策作为主结果（前端模板主要展示单个判定）
  const primary = results[0];
  const policyTitle = (primary.policy_title as string) || '校园政策';
  const verdict = (primary.overall_verdict as string) || 'needs_more_info';
  const conditionMatches = (primary.condition_matches as Array<Record<string, unknown>>) || [];
  // 展示层去重：队友 query_policy 可能把同一缺失信息/复核项按多个政策档位重复返回
  // （如"学业成绩排名"重复 5 次），前端去重后只展示一次，避免同一条件重复出现。
  const missingInfo = Array.from(new Set((primary.missing_info as string[]) || []));
  const manualReview = Array.from(new Set((primary.needs_manual_review as string[]) || []));

  // ① 结论：综合判定
  const conclusionText = VERDICT_TEXT[verdict] || '需人工复核';
  let conclusion = `针对「${policyTitle}」，根据你提供的信息，初步判定：**${conclusionText}**。`;

  // ② 依据：从条件匹配里提取原文引用（source_quote）作为证据
  // 同一 source_quote 可能因多个条件变体重复出现，按原文去重。
  const seenQuote = new Set<string>();
  const uniqueConditionMatches = conditionMatches.filter((c) => {
    const q = (c.source_quote as string)?.trim();
    if (!q) return false;
    if (seenQuote.has(q)) return false;
    seenQuote.add(q);
    return true;
  });

  const evidences: EvidenceItem[] = uniqueConditionMatches.map((c, idx) => ({
    id: `ev-${idx + 1}`,
    fileName: policyTitle,
    fileType: 'pdf' as const,
    pageNum: 0,
    quoteContent: (c.source_quote as string).trim(),
  }));

  // ★ 逐条条件比对表：展示「条件 × 你的值 × 政策要求 × 状态」
  // 同一条件名可能因多档位重复（如"学业成绩排名"多档），按条件名去重保留第一条。
  const toConditionRow = (c: Record<string, unknown>, idx: number): ConditionRow => {
    const match = (c.match as ConditionRow['match']) || 'needs_manual_review';
    const userValue = c.user_value ? String(c.user_value) : undefined;
    const requirement = (c.requirement as string) || undefined;
    return {
      id: `ct-${idx + 1}`,
      item: (c.item as string)?.trim() || '条件',
      match,
      userValue,
      requirement,
      sourceQuote: (c.source_quote as string)?.trim() || undefined,
    };
  };

  const seenConditionItem = new Set<string>();
  const conditionTable: ConditionRow[] = uniqueConditionMatches.reduce<ConditionRow[]>((acc, c, idx) => {
    const item = (c.item as string)?.trim();
    if (!item || seenConditionItem.has(item)) return acc;
    seenConditionItem.add(item);
    acc.push(toConditionRow(c, idx));
    return acc;
  }, []);

  // ★ 条件比对（按类别分组）：category_matches → 组标签 + 组内行（同样按条件名去重）
  // 队友返回结构：{ category_key: { label, matches: [...] } }
  const rawCategoryMatches = (primary.category_matches as
    | Record<string, { label?: string; matches?: Array<Record<string, unknown>> }>
    | undefined);
  let conditionGroups: ConditionGroup[] | undefined;
  if (rawCategoryMatches && typeof rawCategoryMatches === 'object') {
    const groups: ConditionGroup[] = [];
    let gIdx = 0;
    for (const [key, cat] of Object.entries(rawCategoryMatches)) {
      if (!cat || !Array.isArray(cat.matches) || cat.matches.length === 0) continue;
      const seenItem = new Set<string>();
      const rows: ConditionRow[] = [];
      cat.matches.forEach((m, idx) => {
        const item = (m.item as string)?.trim();
        if (!item || seenItem.has(item)) return;
        seenItem.add(item);
        rows.push(toConditionRow(m, idx));
      });
      if (rows.length === 0) continue;
      groups.push({
        id: `ctg-${gIdx++}`,
        label: cat.label || key,
        rows,
      });
    }
    if (groups.length > 0) conditionGroups = groups;
  }

  // ③ 风险/缺失：与条件比对表同源（missing_info/needs_manual_review/not_met），
  // 为避免重复展示，仅保留「真正影响结论」的摘要：
  //   - not_met：未满足 → 逐条列出（真正的硬伤，一般 0~2 条）
  //   - missing_info：缺少信息 → 汇总成一条（供解读诊断摘要用，明细在条件比对表）
  //   - needs_manual_review：需人工核实 → 汇总成一条
  const risks: RiskItem[] = [];
  const seenRiskTitle = new Set<string>();
  const pushRisk = (risk: RiskItem) => {
    if (seenRiskTitle.has(risk.title)) return;
    seenRiskTitle.add(risk.title);
    risks.push(risk);
  };
  const notMet = uniqueConditionMatches.filter((c) => c.match === 'not_met');
  notMet.forEach((c) => {
    pushRisk({
      level: 'high',
      title: `未满足：${(c.item as string) || '条件'}`,
      description: (c.detail as string) || `未满足「${(c.requirement as string) || c.item}」`,
    });
  });
  if (missingInfo.length > 0) {
    pushRisk({
      level: 'medium',
      title: `缺少信息（${missingInfo.length} 项）`,
      description: `${missingInfo.join('、')}。补充后可进一步判断。`,
    });
  }
  if (manualReview.length > 0) {
    pushRisk({
      level: 'low',
      title: `需人工核实（${manualReview.length} 项）`,
      description: `${manualReview.join('、')}。请对照政策原文确认。`,
    });
  }

  // ④ 建议：not_met 和 missing 项 → 建议补充 / 调整
  const suggestions: string[] = [];
  if (verdict === 'not_eligible') {
    const topReasons = notMet.slice(0, 3).map((c) => (c.item as string) || '条件');
    suggestions.push(
      topReasons.length > 0
        ? `当前不满足 ${topReasons.join('、')}，可针对性地补充或提升后再尝试申请。`
        : '当前不满足申请条件，建议核对政策原文确认差距。'
    );
  }
  if (missingInfo.length > 0) {
    suggestions.push(`请补充：${missingInfo.join('、')}，以便更准确地评估符合情况。`);
  }
  if (manualReview.length > 0) {
    suggestions.push(`以下项目需人工复核或确认：${manualReview.join('、')}。`);
  }
  if (suggestions.length === 0) {
    suggestions.push('如需进一步确认，可提供更详细的个人信息或咨询相关部门。');
  }

  // 政策命中条款：供 PolicyPanel 展示（与证据同源，同样按原文去重）
  const policyHits: PolicyHit[] = uniqueConditionMatches.map((c, idx) => ({
    id: `ph-${idx + 1}`,
    title: (c.item as string) || '条款',
    source: policyTitle,
    quoteContent: (c.source_quote as string).trim(),
    keywords: [(c.item as string) || ''],
  }));

  // summary：整体话术（带政策名 + 判定）
  const summary = `根据「${policyTitle}」政策，我对你提供的信息进行了条件比对，结果如下。`;

  return {
    type: 'policy_retrieval',
    toolName: 'query_policy',
    status: verdict === 'not_eligible' ? 'partial' : 'success',
    summary,
    conclusion,
    conditionTable: conditionTable.length > 0 ? conditionTable : undefined,
    conditionGroups: conditionGroups,
    evidences: evidences.length > 0 ? evidences : undefined,
    risks: risks.length > 0 ? risks : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    policyHits: policyHits.length > 0 ? policyHits : undefined,
  };
};

/** 通用入口：尝试多种解析方式，返回 CampusRuleToolResult 或 null */
export const tryParseCampusRuleResult = (output: string): CampusRuleToolResult | null => {
  let jsonObj: unknown;
  try {
    jsonObj = JSON.parse(output);
  } catch {
    return null; // 不是合法 JSON，交给原逻辑
  }
  // 1. 已识别为校园规则（原逻辑）
  if (
    jsonObj &&
    typeof jsonObj === 'object' &&
    ((jsonObj as Record<string, unknown>).type === 'campus_rule_analysis' ||
      (jsonObj as Record<string, unknown>).type === 'policy_retrieval')
  ) {
    return jsonObj as CampusRuleToolResult;
  }
  // 2. policy.query_policy 返回结构 → 适配
  const adapted = adaptPolicyQueryResult(jsonObj);
  if (adapted) return adapted;
  // 3. rag search 返回结构 → 适配（检索型工具，无判定结论，仅展示知识来源证据）
  const ragAdapted = adaptRagSearchResult(jsonObj);
  if (ragAdapted) return ragAdapted;
  return null;
};

// ===== rag search → CampusRuleToolResult 适配 =====
// 队友 rag-mcp-server 的 search 返回结构:
// {
//   "results": [{ "text": "文档块原文", "source": "文件路径", "page": 1|null, "similarity": 0.65, "chunk_index": 0 }],
//   "count": N,
//   "error": null | "..."
// }

/** 判断是否为 rag search 的返回结构（results 每项含 text + source） */
export const isRagSearchResult = (data: unknown): boolean => {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.results)) return false;
  if (obj.results.length === 0) return obj.error !== undefined || 'count' in obj;
  return obj.results.every(
    (r) => r && typeof r === 'object' && 'text' in (r as Record<string, unknown>) && 'source' in (r as Record<string, unknown>)
  );
};

const fileTypeFromSource = (source: string): EvidenceItem['fileType'] => {
  const ext = source.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  return 'txt';
};

const basenameOf = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
};

export const adaptRagSearchResult = (raw: unknown): CampusRuleToolResult | null => {
  if (!isRagSearchResult(raw)) return null;
  const obj = raw as { results: Array<Record<string, unknown>>; count?: number; error?: unknown };

  // 空结果：区分「知识库为空」与「无相关内容」，给可读提示
  if (!obj.results || obj.results.length === 0) {
    const errText = typeof obj.error === 'string' ? obj.error : '';
    const isEmptyKB = errText.includes('知识库为空');
    return {
      type: 'policy_retrieval',
      toolName: 'search',
      status: 'error',
      summary: isEmptyKB ? '知识库还没有加载任何文档。' : '知识库中没有检索到相关内容。',
      error: {
        type: 'warning',
        title: isEmptyKB ? '知识库为空' : '无匹配内容',
        description: isEmptyKB
          ? '请先使用 load_document / load_pdf 工具加载政策或规则文档。'
          : '当前问题与知识库中的文档内容不相关，未检索到可用依据。',
      },
    };
  }

  // 有结果：把每个文档块映射成一条证据引用（② 依据）
  // 相关度分级：>= 50% 正常证据；30%~50% 弱相关（lowRelevance，仅作参考）；
  // 展示阈值取 rag server 的召回门槛（0.3）之上，前端只做展示分级，不隐藏不删改。
  const LOW_RELEVANCE_THRESHOLD = 0.5;
  const evidences: EvidenceItem[] = obj.results.map((r, idx) => {
    const source = String(r.source || '未知来源');
    const text = String(r.text || '').trim();
    const page = typeof r.page === 'number' ? r.page : 0;
    const sim = typeof r.similarity === 'number' ? r.similarity : undefined;
    const baseQuote = text.length > 0 ? text : '(空文档块)';
    const isLow = sim !== undefined && sim < LOW_RELEVANCE_THRESHOLD;
    // 相似度作为小标注拼在引用末尾，方便演示时看到检索排序依据
    const simSuffix = sim !== undefined ? `\n\n[相关度 ${(sim * 100).toFixed(0)}%]` : '';
    const lowSuffix = isLow ? '（相关度较低，仅供参考）' : '';
    const quoteContent = `${baseQuote}${simSuffix}${lowSuffix}`;
    return {
      id: `rag-ev-${idx + 1}`,
      fileName: basenameOf(source),
      fileType: fileTypeFromSource(source),
      pageNum: page,
      quoteContent,
      lowRelevance: isLow,
    };
  });

  const hasLowRelevance = evidences.some((e) => e.lowRelevance);
  const summary =
    `已从知识库检索到 ${obj.results.length} 条相关内容` +
    (typeof obj.results[0]?.similarity === 'number'
      ? `（最高相关度 ${((obj.results[0].similarity as number) * 100).toFixed(0)}%）`
      : '') +
    (hasLowRelevance ? '，其中部分内容相关度较低，仅作参考。' : '，引用原文如下，请结合来源核对。');

  return {
    type: 'policy_retrieval',
    toolName: 'search',
    status: 'success',
    summary,
    evidences: evidences.length > 0 ? evidences : undefined,
  };
};
