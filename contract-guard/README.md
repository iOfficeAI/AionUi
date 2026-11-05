# 合同风险扫描工具（campus-tools）

> 面向中国大学生和应届毕业生的合同风险扫描工具，帮你读懂合同里的坑。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/tests-69%20passed-brightgreen.svg)]()

---

## 这是什么？

一个帮你审阅合同的 AI 工具，专门针对中国大学生常遇到的四类合同：

- 🏠 **租房合同** — 押金陷阱、隐形收费、房东随意解约
- 💼 **实习协议** — 试用期超长、工资打骨折、不缴社保
- 📋 **劳动合同** — 加班费不足、竞业限制无补偿、工作时间超限
- 🔒 **保密协议（NDA）** — 保密范围过宽、期限无限

**和直接问 ChatGPT 有什么不同？**

| 特性 | 本工具 | 直接问 ChatGPT |
|------|--------|----------------|
| 法规依据 | ✅ 19条中国法规硬规则，逐条核查 | ❌ 可能编造法条 |
| 输出格式 | ✅ 结构化 JSON，方便集成 | ❌ 一大段文字 |
| 一致性 | ✅ 同样的合同，同样的结果 | ❌ 每次回答可能不同 |
| 可视化 | ✅ 内置 Mermaid 风险分布图 | ❌ 无 |
| 可审计 | ✅ 每条结论都有法条引用 | ❌ 无法追溯 |

---

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

工具使用 DashScope（通义千问）作为 LLM 后端：

```bash
# 方式 A：DashScope（推荐）
export DASHSCOPE_API_KEY=sk-your-dashscope-key

# 方式 B：兼容 OpenAI 接口的其他服务
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://your-api-endpoint/v1
```

**没有 API Key？** 可以先用 `--skip-llm` 模式，只运行正则规则检查（不需要调用 LLM）：

```bash
python server.py --test examples/sample_contract.txt rental
```

### 3. 扫描合同

**方式 A：MCP Server 模式（推荐，供 AionUi 调用）**

```bash
python server.py
```

**方式 B：命令行测试模式**

```bash
# 扫描租房合同（仅正则规则）
python server.py --test contract.txt rental

# 扫描劳动合同（完整分析，需要 API Key）
python server.py --test contract.txt employment
```

---

## 输出示例

工具返回结构化 JSON，包含：

```json
{
  "ok": true,
  "data": {
    "contract_type": "employment",
    "summary": "这是一份3年期劳动合同，试用期6个月，月薪8000元...",
    "red_flags": [
      {
        "title": "试用期工资过低",
        "severity": "red",
        "quote": "试用期工资为4000元",
        "explanation": "试用期工资仅为转正工资的50%，低于法定80%底线",
        "suggestion": "要求将试用期工资调整为至少6400元（80%）"
      }
    ],
    "statute_checks": [
      {
        "rule_id": "probation_wage_80",
        "title": "试用期工资不低于约定工资的80%",
        "status": "violation",
        "detail": "试用期工资4000元仅为转正工资8000元的50%，低于法定80%底线",
        "source": "regex"
      }
    ],
    "fairness_score": 35,
    "fairness_grade": "D",
    "sources": [
      {
        "rule_id": "probation_wage_80",
        "document": "中华人民共和国劳动合同法",
        "section": "第二十条",
        "text": "劳动者在试用期的工资不得低于本单位相同岗位最低档工资或者劳动合同约定工资的百分之八十..."
      }
    ],
    "mermaid_chart": "graph TD\n    A[合同风险总览] --> B[正则规则检查]\n    ..."
  },
  "meta": {
    "request_id": "a1b2c3d4",
    "tool": "contract_scan",
    "elapsed_ms": 1234
  }
}
```

---

## 支持的合同类型

| 合同类型 | 检查内容 |
|---------|---------|
| **租房合同** | 押金上限、押金+定金比例、退押金期限、房东单方解约权、维修义务、隐形费用 |
| **实习/劳动合同** | 试用期工资、试用期期限、加班费（150%/200%/300%）、社保缴纳、竞业限制补偿、工作时间、带薪年假 |
| **保密协议（NDA）** | 保密范围合理性、保密期限合理性 |

---

## 法规覆盖（19条硬规则）

### 租房合同（6条）

| 规则 | 法律依据 |
|------|---------|
| 押金不超过月租金一倍 | 《民法典》第七百零三条、第七百零四条 |
| 押金+定金不超过2个月租金 | 一般交易习惯 |
| 退押金期限不超过30天 | 《民法典》合同编 |
| 房东单方解约权限制 | 《民法典》第五百六十三条 |
| 维修义务归属 | 《民法典》第七百一十二条 |
| 隐形费用检测 | 公平原则 |

### 劳动/实习合同（9条）

| 规则 | 法律依据 |
|------|---------|
| 试用期工资≥80% | 《劳动合同法》第二十条 |
| 试用期期限上限 | 《劳动合同法》第十九条 |
| 工作日加班费≥150% | 《劳动法》第四十四条第(一)项 |
| 周末加班费≥200% | 《劳动法》第四十四条第(二)项 |
| 法定节假日加班费≥300% | 《劳动法》第四十四条第(三)项 |
| 社保缴纳义务 | 《社会保险法》第五十八条 |
| 竞业限制补偿金 | 最高法司法解释(一)第三十六条 |
| 工作时间上限（8h/44h） | 《劳动法》第三十六条、第三十八条 |
| 带薪年休假权利 | 《职工带薪年休假条例》第三条 |

### 保密协议（2条）

| 规则 | 法律依据 |
|------|---------|
| 保密范围合理性 | 《反不正当竞争法》第九条 |
| 保密期限合理性 | 一般商业惯例 |

---

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server (server.py)                │
│              JSON-RPC over stdio 通信                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  合并层 (merger.py)                      │
│         LLM 软检查 + 正则硬规则 → 统一 JSON              │
└────────┬───────────────────────────────────┬────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  LLM 分析层          │          │  正则规则引擎            │
│  (analyzer.py)      │          │  (cn_labor_rules.py)    │
│  DashScope/qwen-plus│          │  19条中国法规硬规则      │
└─────────────────────┘          └─────────────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  中文 Prompt         │          │  法条数据库              │
│  (prompts_zh.py)    │          │  (cn_law_rules.json)    │
│  大学生合同顾问角色   │          │  19条法规定义            │
└─────────────────────┘          └─────────────────────────┘
```

---

## 项目结构

```
.
├── server.py                  # MCP Server 入口
├── contractguard/             # 核心包（保留自 ContractGuard）
│   ├── __init__.py
│   ├── analyzer.py            # LLM 调用（已改造为 DashScope）
│   ├── models.py              # Pydantic 数据模型
│   └── parser.py              # PDF/DOCX 解析
├── engine/                    # 中国版引擎（新建）
│   ├── analyzer.py            # DashScope 适配器
│   ├── prompts_zh.py          # 中文 Prompt
│   ├── cn_labor_rules.py      # 正则规则引擎（19条规则）
│   └── merger.py              # LLM + 正则合并层
├── data/                      # 数据文件
│   └── cn_law_rules.json      # 法条规则数据库
├── tests/                     # 测试
│   ├── test_cn_rules.py       # 53个正则规则单元测试
│   └── test_contract_scan.py  # 16个端到端集成测试
├── .env.example               # 环境变量模板
├── pyproject.toml             # Python 项目配置
└── README_CN.md               # 本文件
```

---

## 测试

运行全部测试：

```bash
pytest tests/ -v
```

运行特定测试：

```bash
# 正则规则单元测试
pytest tests/test_cn_rules.py -v

# 端到端集成测试
pytest tests/test_contract_scan.py -v
```

当前测试覆盖：**69 个测试用例，全部通过** ✅

---

## 常见问题

**Q: 这算法律建议吗？**

A: 不算。本工具是帮你用大白话理解合同条款的教育工具，不能替代持证律师。重要决策请咨询专业律师。

**Q: 我的合同数据会上传到云端吗？**

A: 只发送给你配置的 LLM 服务商（DashScope）。如果在意隐私，可以用 `--skip-llm` 模式，只运行正则规则检查，数据完全不出本机。

**Q: 支持哪些文件格式？**

A: 目前支持纯文本（`.txt`）。PDF 和 DOCX 解析功能保留自 ContractGuard，但 MCP Server 接口只接受纯文本输入。

**Q: 能扫描英文合同吗？**

A: 不能。本工具专门针对中国法律，只支持中文合同。英文合同请使用原版 [ContractGuard](https://github.com/he-yufeng/ContractGuard)。

**Q: 为什么有些规则显示"unknown"？**

A: 当合同中缺少关键信息（如未写明押金金额、未约定试用期工资），正则规则无法判断时，会返回 `unknown` 而不是错误地标记为合规。这是设计上的保守策略。

---

## 致谢

本项目基于 [ContractGuard](https://github.com/he-yufeng/ContractGuard)（MIT License）改造，感谢原作者的开源贡献。

主要改造内容：
- 将英文合同分析改为中文合同分析
- 将美国加州法规替换为中国劳动/租赁法规
- 将 OpenRouter 替换为 DashScope（通义千问）
- 将 CLI 工具改为 MCP Server
- 新增 19 条中国法规硬规则

---

## 许可证

[MIT](LICENSE) — 基于 ContractGuard 改造，保留原始作者署名。
