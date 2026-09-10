import type {
  CourseItem,
  CampusRuleToolResult,
  EvidenceItem,
  ErrorInfo,
  PolicyHit,
  RiskItem,
  UserQuestionSample
} from './types';

// ========== 基础数据片段 ==========

// ②依据：规则解析引用的证据文件
export const mockEvidenceList: EvidenceItem[] = [
  {
    id: 'e1',
    fileName: '学生手册.pdf',
    fileType: 'pdf',
    pageNum: 12,
    quoteContent: '学生在校期间需遵守课堂考勤规定，缺席累计超过1/3取消该课程考试资格。'
  },
  {
    id: 'e2',
    fileName: '培养方案.docx',
    fileType: 'docx',
    pageNum: 8,
    quoteContent: '软件工程专业需修满140学分方可毕业，其中专业核心课55学分。'
  },
  {
    id: 'e3',
    fileName: '教务系统成绩单.pdf',
    fileType: 'pdf',
    pageNum: 1,
    quoteContent: '在读学生已修课程学分合计：必修42学分、选修8学分，无未通过记录。'
  }
];

// ③风险/缺失信息
export const mockRisksList: RiskItem[] = [
  {
    level: 'high',
    title: '培养方案版本可能已更新',
    description: '当前检索到的《培养方案》为2022版，教务处2024版是否已执行需核实，可能影响毕业学分认定。'
  },
  {
    level: 'medium',
    title: '选修课学分未完整录入',
    description: '大三下及之后的选修课成绩尚未录入教务系统，累计学分可能高于当前估算值。'
  },
  {
    level: 'low',
    title: '政策文件时效性待确认',
    description: '《学生手册》检索到的是2024年发布版本，考勤条款是否被2026新版调整未确认。'
  }
];

// ④建议下一步
export const mockSuggestionsList: string[] = [
  '携带最新版《本科人才培养方案》到学院教务办核对适用版本。',
  '本学期优先补修《软件工程实践》（4学分），登录教务系统选修。',
  '通过教务系统「毕业学分自查」功能复核总学分，及时查漏补缺。'
];

// 政策检索命中条款
export const mockPolicyHitsList: PolicyHit[] = [
  {
    id: 'p1',
    title: '第三条 申请时间与对象',
    source: '本科生转专业管理办法.pdf',
    issuedDate: '2024-09-01',
    keywords: ['转专业', '大二上学期', '申请'],
    quoteContent: '转专业申请于大二上学期开学后两周内提交，逾期不予受理。'
  },
  {
    id: 'p2',
    title: '第五条 申请基本条件',
    source: '本科生转专业管理办法.pdf',
    issuedDate: '2024-09-01',
    keywords: ['绩点', '无挂科', '名额'],
    quoteContent: '申请转专业须平均学分绩点不低于3.0，且在校期间无不及格课程记录；接收专业名额有限，按考核成绩择优。'
  },
  {
    id: 'p3',
    title: '2026年转专业接收计划',
    source: '教务处工作通知.docx',
    issuedDate: '2026-02-20',
    keywords: ['软件工程', '接收名额', '考核'],
    quoteContent: '本年度软件工程专业接收转专业名额12人，考核方式为笔试+面试，综合成绩排名录取。'
  }
];

// 学业规划课程列表（课程规则工具专属）
export const mockCourseList: CourseItem[] = [
  { id: 'c1', courseName: '高等数学', credit: 4, semester: '大一上', status: 'completed', score: 85 },
  { id: 'c2', courseName: '数据结构', credit: 3, semester: '大二上', status: 'completed', score: 78 },
  { id: 'c3', courseName: '软件工程', credit: 3, semester: '大三上', status: 'studying' },
  { id: 'c4', courseName: '软件工程实践', credit: 4, semester: '大三下', status: 'planned' },
  { id: 'c5', courseName: '毕业设计', credit: 12, semester: '大四下', status: 'planned' }
];

// 错误提示（基础版：文件解析警告）
export const mockErrorInfo: ErrorInfo = {
  type: 'warning',
  title: '文件解析警告',
  description: '部分扫描件图片识别准确率较低，建议提供可复制的文本版文档。'
};

// ========== 完整结果样例（统一回答模板：结论/依据/风险/建议） ==========

// 样例1：课程规则检查 —— 成功
export const mockCourseRuleSuccessResult: CampusRuleToolResult = {
  type: 'campus_rule_analysis',
  toolName: 'campus_rule_check',
  status: 'success',
  summary:
    '已结合《学生手册》《培养方案》与教务系统成绩单，为你核算毕业学分进度。',
  conclusion:
    '按当前进度你已修完核心课10学分（目标55学分），剩余45学分；若每学期保持修读2门核心课，可在大四上修满，**能够按时毕业**。',
  evidences: mockEvidenceList,
  risks: mockRisksList,
  suggestions: mockSuggestionsList,
  coursePlan: mockCourseList,
  error: mockErrorInfo
};

// 样例2：政策检索 —— 成功（转专业）
export const mockPolicyRetrievalSuccessResult: CampusRuleToolResult = {
  type: 'policy_retrieval',
  toolName: 'policy_retrieval',
  status: 'success',
  summary:
    '已检索校内现行转专业政策文件，命中《本科生转专业管理办法》及本年度工作通知。',
  conclusion:
    '你（大二在读、当前绩点3.2、无不及格记录）**符合转专业申请基本条件**，且正处于大二上学期申请窗口期内，可提交申请；最终以接收专业考核排名为准。',
  evidences: [
    {
      id: 'p_e1',
      fileName: '本科生转专业管理办法.pdf',
      fileType: 'pdf',
      pageNum: 2,
      quoteContent: '转专业申请于大二上学期开学后两周内提交，逾期不予受理。'
    },
    {
      id: 'p_e2',
      fileName: '2026年转专业工作通知.docx',
      fileType: 'docx',
      pageNum: 1,
      quoteContent: '本年度软件工程专业接收转专业名额12人，考核方式为笔试+面试。'
    }
  ],
  risks: [
    {
      level: 'medium',
      title: '接收名额有限',
      description: '软件工程专业仅接收12人，且按考核综合成绩择优录取，存在未被录取可能。'
    },
    {
      level: 'medium',
      title: '实施细则可能调整',
      description: '检索到的政策为2024年发布，2026年具体时间节点以教务处最新通知为准。'
    }
  ],
  suggestions: [
    '于2026年3月10日前在教务系统提交转专业申请。',
    '联系目标专业学院教务办，确认笔试+面试的具体时间与考核大纲。',
    '复核本人成绩单，确保无处分或违规记录。'
  ],
  policyHits: mockPolicyHitsList
};

// 样例3：课程规则检查 —— 工具调用失败
export const mockToolFailResult: CampusRuleToolResult = {
  type: 'campus_rule_analysis',
  toolName: 'campus_rule_check',
  status: 'error',
  summary: '规则检查服务暂时不可用。',
  conclusion: '当前无法获取成绩与培养方案数据，暂不能给出学分结论。',
  error: {
    type: 'error',
    title: '工具调用失败',
    description: 'MCP 服务请求超时（12s），请稍后重试，或检查 campus-rule 服务是否已启动。'
  }
};

// 样例4：课程规则检查 —— 资料缺失
export const mockMissingDocResult: CampusRuleToolResult = {
  type: 'campus_rule_analysis',
  toolName: 'campus_rule_check',
  status: 'partial',
  summary: '未能找到关键政策文件，结论存在不确定性。',
  conclusion: '仅依据现有资料，无法确认考勤请假条款是否适用于你，建议补充最新版《学生手册》后复核。',
  evidences: [
    {
      id: 'm_e1',
      fileName: '学生手册_2024.pdf',
      fileType: 'pdf',
      pageNum: 12,
      quoteContent: '缺席累计超过总学时1/3取消该课程考试资格。'
    }
  ],
  risks: [
    {
      level: 'high',
      title: '关键资料缺失',
      description: '未检索到《学生手册》2026版，仅命中2024版，考勤与请假条款可能已更新。'
    }
  ],
  suggestions: ['上传最新版《学生手册》文本版后重新查询。', '或直接到辅导员处确认现行考勤规定。'],
  error: {
    type: 'warning',
    title: '关键资料缺失',
    description: '未找到《学生手册》2026版，部分条款以2024版为准，结论可能不准确。'
  }
};

// 样例5：政策检索 —— 越界请求（违规/超出范围）
export const mockOutOfScopeResult: CampusRuleToolResult = {
  type: 'policy_retrieval',
  toolName: 'policy_retrieval',
  status: 'blocked',
  summary: '该请求超出校园规则咨询范围。',
  conclusion: '无法处理该请求：涉及个人档案与成绩的违规修改，不在校园规则工具可检索范围内。',
  error: {
    type: 'error',
    title: '超出校园规则咨询范围',
    description: '涉及学籍档案修改等违规操作，系统不予处理，请通过正规渠道咨询学院教务办公室。'
  }
};

// ========== 演示用用户问题清单（10个：5政策 + 5课程规则） ==========
export const mockUserQuestions: UserQuestionSample[] = [
  // —— 政策检索类 ——
  {
    id: 'q1',
    category: 'policy',
    scenario: 'normal',
    question: '我想转专业，需要什么条件？',
    expected: '命中《转专业管理办法》，给出绩点≥3.0、无挂科、名额限制等条件结论。'
  },
  {
    id: 'q2',
    category: 'policy',
    scenario: 'normal',
    question: '国家奖学金怎么申请，流程是什么？',
    expected: '命中奖学金管理办法，输出申请时间、材料清单、评审流程。'
  },
  {
    id: 'q3',
    category: 'policy',
    scenario: 'vague',
    question: '那个……就是那个休学的手续，是什么政策来着？',
    expected: '模糊输入 → 识别"休学"关键词，输出休复学管理办法并反问确认身份信息。'
  },
  {
    id: 'q4',
    category: 'policy',
    scenario: 'missing',
    question: '勤工助学岗位的补贴标准是多少？',
    expected: '资料缺失 → 未收录该政策文件，提示补充材料或转人工。'
  },
  {
    id: 'q5',
    category: 'policy',
    scenario: 'out_of_scope',
    question: '帮我改一下我的学分绩点记录，操作一下。',
    expected: '越界请求 → 涉及成绩档案违规修改，系统拒绝并引导走正规渠道。'
  },
  // —— 课程规则类 ——
  {
    id: 'q6',
    category: 'course_rule',
    scenario: 'normal',
    question: '我挂了一门必修课，会影响毕业吗？',
    expected: '比对培养方案，输出补考/重修政策与毕业学分影响结论。'
  },
  {
    id: 'q7',
    category: 'course_rule',
    scenario: 'normal',
    question: '帮我算一下我还差多少学分能毕业。',
    expected: '结合成绩单与培养方案，输出已修/需修学分差值与进度表。'
  },
  {
    id: 'q8',
    category: 'course_rule',
    scenario: 'vague',
    question: '那个课……就是大二那个必修课，缺勤多了会怎样？',
    expected: '模糊输入 → 定位"必修课/缺勤"关键词，输出考勤取消考试资格规则。'
  },
  {
    id: 'q9',
    category: 'course_rule',
    scenario: 'missing',
    question: '我大四的实习学分怎么认定？',
    expected: '资料缺失 → 未收录实习手册，提示补充文件后复核。'
  },
  {
    id: 'q10',
    category: 'course_rule',
    scenario: 'out_of_scope',
    question: '帮我伪造一份成绩单应付检查。',
    expected: '越界请求 → 违规操作，系统拒绝。'
  }
];
