// ========== 校园规则解码器：类型定义（完善版） ==========

// 规则证据条目（②依据）
export interface EvidenceItem {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
  pageNum: number;
  quoteContent: string;
  /** 相关度分级：true = 弱相关（相关度低于展示阈值，仅作参考，不作为可靠依据） */
  lowRelevance?: boolean;
}

// 错误提示信息（异常状态）
export interface ErrorInfo {
  type: 'warning' | 'error' | 'info';
  title: string;
  description: string;
}

// 学业规划课程项（课程规则工具专属）
export interface CourseItem {
  id: string;
  courseName: string;
  credit: number;
  semester: string;
  status: 'completed' | 'studying' | 'planned';
  score?: number;
}

// 风险 / 缺失信息（③风险缺失）
export interface RiskItem {
  level: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

// 逐条条件比对行（policy.query_policy 专属：条件 × 你的值 × 要求 × 状态）
export type ConditionMatchState = 'met' | 'not_met' | 'missing_info' | 'needs_manual_review';

export interface ConditionRow {
  id: string;
  item: string;            // 条件名称
  match: ConditionMatchState;
  userValue?: string;      // 你的值（未提供时为空）
  requirement?: string;    // 政策要求
  sourceQuote?: string;    // 原文引用
}

// 条件比对分组（category_matches → 按成绩/外语/科研/竞赛等类别分组）
export interface ConditionGroup {
  id: string;
  label: string;           // 类别中文名（如"绩点/成绩要求"）
  rows: ConditionRow[];
}

// 政策检索命中的条款条目（政策检索工具专属）
export interface PolicyHit {
  id: string;
  title: string;        // 条款标题
  source: string;       // 来源政策文件
  issuedDate?: string;  // 发布 / 施行日期
  keywords: string[];   // 命中关键词
  quoteContent: string; // 引用原文
}

// 工具调用结果状态
export type ToolResultStatus = 'success' | 'partial' | 'error' | 'blocked';

// MCP 工具顶层返回结构
// 统一回答模板四块：①结论 conclusion、②依据 evidences、③风险/缺失 risks、④建议下一步 suggestions
export interface CampusRuleToolResult {
  type: 'campus_rule_analysis' | 'policy_retrieval';
  toolName: string;              // 调用的 MCP 工具名
  status: ToolResultStatus;      // 结果状态：成功 / 部分 / 失败 / 越界拒绝
  summary: string;               // AI 整体回答（Markdown，顶部话术）
  conclusion?: string;           // ① 结论
  evidences?: EvidenceItem[];    // ② 依据
  risks?: RiskItem[];            // ③ 风险 / 缺失信息
  suggestions?: string[];        // ④ 建议下一步
  error?: ErrorInfo;             // 异常状态（警告 / 失败 / 越界）
  coursePlan?: CourseItem[];     // 课程规则工具专属：学业进度
  policyHits?: PolicyHit[];      // 政策检索工具专属：命中条款
  conditionTable?: ConditionRow[]; // 逐条条件比对（policy 判定器专属）
  conditionGroups?: ConditionGroup[]; // 条件比对（按类别分组，policy 判定器专属）
}

// 演示用：用户问题样例清单
export interface UserQuestionSample {
  id: string;
  category: 'policy' | 'course_rule';
  scenario: 'normal' | 'vague' | 'missing' | 'out_of_scope';
  question: string;
  expected: string;
}
