# Sentry 用户反馈分析 — AionUi (electron) 近 7 天

> 报告类型：db-diagnostics 反馈诊断有效性 + 逐案 bug/根因分析
> 由 `sentry-feedback-case-analysis` skill 生成。**本报告仅做问题定位，不含任何代码修复。**

## 运行元数据

- **prior_report（历史报告）**：无（baseline 首次运行）
- **report_path**：`feedback-diagnostics-db-json.md`
- **ledger_sidecar**：`feedback-diagnostics-db-json.ledger.json`
- **resolution_registry**：`sentry-feedback-resolutions/`
- **ledger_source**：baseline
- **scope_match**：exact（全新 baseline）
- **run_started_at**：2026-07-23T04:36:05Z（本地运行时间）
- **previous_processed_until**：无
- **current_query_cutoff**：约 2026-07-23T04:15Z（Sentry 查询时间）
- **processed_until**：约 2026-07-22T16:00Z（本次处理到的最新反馈事件）

### Scope Fingerprint（范围指纹）

| 字段                 | 值                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| sentry_org           | iofficeai                                                                                        |
| sentry_project       | electron                                                                                         |
| query                | `is:unresolved firstSeen:-7d`（取 user-feedback 子集，culprit `app:///out/renderer/index.html`） |
| release_filter       | 无（观测到 AionUi@2.1.36 – 2.1.39）                                                              |
| feedback_type_filter | `type:user-feedback`（标题带分类前缀）                                                           |
| resolved_scope       | 仅 unresolved                                                                                    |
| attachment_filter    | screenshot + logs.gz + db-diagnostics.json.gz（每个反馈事件都带）                                |
| report_kind          | feedback-diagnostics-db-json                                                                     |

### 诊断包现状（skill 核心结论）

本范围内每个 AionUi `type:user-feedback` 事件都以 Sentry 附件形式携带**完整诊断包**：

- `screenshot-*.png` —— 反馈时刻的整屏截图
- `logs.gz` → `logs` —— app 日志（`YYYY-MM-DD.log`）+ 后端日志（`YYYY-MM-DD.aioncore.log`）合并的 JSON 行日志，约 3 天，数万行
- `db-diagnostics.json.gz` → `db-diagnostics.json` —— 约 1.2MB 的 DB/状态快照（providers、models、conversations、capabilities、health）

Sentry **事件正文本身只有用户文字 + 设备/上下文标签**（`app.version`、`module`、os/runtime），实质证据全在附件里 —— 所以**结论必须下载附件**，不能只看 Sentry 事件页。`module` 标签（如 `agent-team`、`conversation-session`）就是反馈分类前缀。

## 版本链（观测到的 app 版本）

| AionUi app     | AionCore（`aioncoreVersion`） | aionrs（Cargo.lock tag） |
| -------------- | ----------------------------- | ------------------------ |
| 2.1.36         | v0.1.4x                       | v0.2.x                   |
| 2.1.37         | v0.1.48                       | v0.2.6（`3cb928d4`）     |
| 2.1.38         | v0.1.49                       | v0.2.6（`3cb928d4`）     |
| 2.1.39（当前） | v0.1.50                       | v0.2.6（`3cb928d4`）     |

版本匹配代码所用本地仓库：AionUi `/Users/zhoukai/Documents/github/AionUi`、AionCore `~/Documents/github/aionCore`、aionrs `~/Documents/github/aionrs`（本地有 tag `v0.2.6`）。

---

## Case Ledger（案件台账）

状态：`new` 首次分析 · `active` 待处理 · `candidate-fixed` 已有修复(据用户/PR)但未验证 · `fixed`/`verified` · `archived-non-bug` 需求/含糊/垃圾 · `reopened`。

| case                                              | sentry                                                  | status           | last_event(UTC) | analyzed_at | fix_version                                                              | 下一步                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------- | ---------------- | --------------- | ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **BUG 集群（我方缺陷，active）**                  |
| ELECTRON-3MD                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MD) | active           | 2026-07-20      | 2026-07-23  | 未修复(至 v0.1.50)                                                       | team rebuild 全有或全无 + ACP 错误细节丢失                                                                                         |
| ELECTRON-3ME                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3ME) | active           | 2026-07-20      | 2026-07-23  | 未修复                                                                   | 同 3MD（codex）归并                                                                                                                |
| ELECTRON-3MF                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MF) | active           | 2026-07-20      | 2026-07-23  | 未修复                                                                   | 同集群（copilot）归并                                                                                                              |
| ELECTRON-3NC                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NC) | active           | 2026-07-21      | 2026-07-23  | 未修复                                                                   | 同集群（hermes 一拉就挂）归并                                                                                                      |
| ELECTRON-3NB                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NB) | active           | 2026-07-21      | 2026-07-23  | 未修复                                                                   | leader 无法发消息，核对 team 生命周期                                                                                              |
| ELECTRON-3NJ                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NJ) | active           | 2026-07-21      | 2026-07-23  | 未修复                                                                   | leader 点停止无效，核对 team 停止路径                                                                                              |
| ELECTRON-3PB                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3PB) | active           | 2026-07-23      | 2026-07-23  | —                                                                        | hermes 领导处理太慢（性能，单独核实）                                                                                              |
| ELECTRON-3NH                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NH) | candidate-fixed  | 2026-07-21      | 2026-07-23  | pending-merge                                                            | ✅ aionrs `fix/sse-utf8-chunk-boundary`（worktree，测试绿）                                                                        |
| ELECTRON-3P5                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P5) | candidate-fixed  | 2026-07-22      | 2026-07-23  | pending-merge                                                            | 同乱码修复覆盖；另留"卡半天/显示不全"                                                                                              |
| ELECTRON-3P8                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P8) | active           | 2026-07-23      | 2026-07-23  | —                                                                        | 修复尝试已撤回；无懒加载机制，需"有上限的 Image 块+不留历史"（待决策）                                                             |
| ELECTRON-3M5                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M5) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 修复尝试已撤回；只需修图片可达性                                                                                                   |
| ELECTRON-3M4                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M4) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 修复尝试已撤回（base64 内联会打爆上下文）                                                                                          |
| ELECTRON-3KX                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KX) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 变更列表无法滚动(FlexFullContainer absolute)，待核代码                                                                             |
| ELECTRON-3M2                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M2) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 模型与 agent 全部消失（疑似数据丢失，未深挖）                                                                                      |
| ELECTRON-3PN                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3PN) | candidate-fixed  | 2026-07-23      | 2026-07-24  | pending-merge ([PR#678](https://github.com/iOfficeAI/AionCore/pull/678)) | ✅ 探测管线改造已实现（[#675](https://github.com/iOfficeAI/AionCore/issues/675)，nextest 7431 绿）；随 AionCore 下版发布后转 fixed |
| **供应商/用户环境类（非我方核心 bug）**           |
| ELECTRON-3N3                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N3) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | 商汤免费额度 429，供应商侧；建议限流退避                                                                                           |
| ELECTRON-3N2                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N2) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | kilo 需登录/首次设置；更新触发 DB 迁移错配(migration 25)                                                                           |
| ELECTRON-3P3                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P3) | active           | 2026-07-22      | 2026-07-23  | —                                                                        | 本地 qwen 上下文占满→空 length；缺 context 保护                                                                                    |
| **窗口控制回归（据用户已修复，candidate-fixed）** |
| ELECTRON-3NS                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NS) | candidate-fixed  | 2026-07-21      | 2026-07-23  | 待确认                                                                   | 确认修复 commit/版本后转 fixed 并 resolve                                                                                          |
| ELECTRON-3M7                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M7) | candidate-fixed  | 2026-07-20      | 2026-07-23  | 待确认                                                                   | 见 resolution note                                                                                                                 |
| ELECTRON-3KS                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KS) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3KN                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KN) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3KH                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KH) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3KG                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KG) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3KD                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KD) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | Win11 25H2                                                                                                                         |
| ELECTRON-3KC                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KC) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | Win11                                                                                                                              |
| ELECTRON-3KB                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KB) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3KA                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KA) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3K9                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3K9) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3K6                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3K6) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3K5                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3K5) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| ELECTRON-3K4                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3K4) | candidate-fixed  | 2026-07-19      | 2026-07-23  | 待确认                                                                   | —                                                                                                                                  |
| **其他具体 UI/功能类（active，未逐个深挖附件）**  |
| ELECTRON-3P4                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P4) | active           | 2026-07-22      | 2026-07-23  | —                                                                        | 预设壁纸无效果                                                                                                                     |
| ELECTRON-3P1                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P1) | active           | 2026-07-22      | 2026-07-23  | —                                                                        | 添加技能卡在"助手保护"                                                                                                             |
| ELECTRON-3NN                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NN) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | 定时任务 agent 头像不显示（复发）                                                                                                  |
| ELECTRON-3NZ                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NZ) | active           | 2026-07-22      | 2026-07-23  | —                                                                        | MCP claude.ai M365 oauth 登录失败                                                                                                  |
| ELECTRON-3N5                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N5) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | 无法添加 MCP server                                                                                                                |
| ELECTRON-3N4                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N4) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | 刷新文件夹后文件树不更新                                                                                                           |
| ELECTRON-3N0                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N0) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | codex 自定义目录无法监测识别                                                                                                       |
| ELECTRON-3MW                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MW) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | aionui-config 技能不在可用列表                                                                                                     |
| ELECTRON-3MT                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MT) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 点击链接测试无响应                                                                                                                 |
| ELECTRON-3M8                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M8) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 无法配置 anyrouter                                                                                                                 |
| ELECTRON-3M6                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M6) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | CC 环境变量复制后重新聚焦丢失                                                                                                      |
| ELECTRON-3MJ                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MJ) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | 无法复制粘贴                                                                                                                       |
| ELECTRON-3KW                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KW) | active           | 2026-07-19      | 2026-07-23  | —                                                                        | 已登录 cursor 却报错                                                                                                               |
| ELECTRON-3MG                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MG) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 插件显示不全                                                                                                                       |
| ELECTRON-3MK                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MK) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 更新提示条挡住输入框                                                                                                               |
| ELECTRON-3MX                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MX) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 定时任务标题时间不一致                                                                                                             |
| ELECTRON-3MV                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MV) | active           | 2026-07-20      | 2026-07-23  | —                                                                        | 团队对话结束提示词进草稿箱                                                                                                         |
| ELECTRON-3NF                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NF) | active           | 2026-07-21      | 2026-07-23  | —                                                                        | 输入后报错（含糊）                                                                                                                 |
| **需求类（archived-non-bug）**                    |
| ELECTRON-3P9                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P9) | archived-non-bug | 2026-07-22      | 2026-07-23  | —                                                                        | 需求：完成后通知                                                                                                                   |
| ELECTRON-3P0                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P0) | archived-non-bug | 2026-07-22      | 2026-07-23  | —                                                                        | 需求：支持 Antigravity                                                                                                             |
| ELECTRON-3NX                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NX) | archived-non-bug | 2026-07-22      | 2026-07-23  | —                                                                        | 需求：命令授权改点一次                                                                                                             |
| ELECTRON-3NR                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NR) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | 需求：grok effort 档位                                                                                                             |
| ELECTRON-3N6                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N6) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | 需求：会话中切换技能/工具                                                                                                          |
| ELECTRON-3M3                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M3) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | 需求：跨会话持久记忆                                                                                                               |
| ELECTRON-3M0                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M0) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | 需求：对话移动到项目                                                                                                               |
| ELECTRON-3KZ                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KZ) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | 需求：删除文件夹路径按钮                                                                                                           |
| ELECTRON-3KY                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KY) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | 需求：默认折叠项目面板                                                                                                             |
| ELECTRON-3MQ                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MQ) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | 需求：切模型不重置权限                                                                                                             |
| ELECTRON-3KV                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KV) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | 需求：Grok OAuth 登录                                                                                                              |
| ELECTRON-3KP                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3KP) | archived-non-bug | 2026-07-19      | 2026-07-23  | —                                                                        | 需求：需要模型                                                                                                                     |
| **含糊/发泄/垃圾（archived-non-bug，描述不足）**  |
| ELECTRON-3P7                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3P7) | archived-non-bug | 2026-07-23      | 2026-07-23  | —                                                                        | "没搞懂什么问题"                                                                                                                   |
| ELECTRON-3NM                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NM) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "不给我回应"（含糊）                                                                                                               |
| ELECTRON-3NK                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3NK) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "一直有问题"                                                                                                                       |
| ELECTRON-3N7                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3N7) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "用不了"（含糊）                                                                                                                   |
| ELECTRON-3MR                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MR) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "asdasdasd"（垃圾）                                                                                                                |
| ELECTRON-3MN                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MN) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "两次失败"（含糊）                                                                                                                 |
| ELECTRON-3MM                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MM) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | 发泄（垃圾）                                                                                                                       |
| ELECTRON-3MH                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MH) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "不继续处理"（含糊）                                                                                                               |
| ELECTRON-3MY                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3MY) | archived-non-bug | 2026-07-21      | 2026-07-23  | —                                                                        | "模型没回应"（含糊）                                                                                                               |
| ELECTRON-3M1                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M1) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | "这什么错误"（含糊）                                                                                                               |
| ELECTRON-3M9                                      | [link](https://iofficeai.sentry.io/issues/ELECTRON-3M9) | archived-non-bug | 2026-07-20      | 2026-07-23  | —                                                                        | "adadad"（垃圾）                                                                                                                   |
| ELECTRON-3S4                                      | [link](https://iofficeai.sentry.io/issues/136922682/)   | active           | 2026-07-28      | 2026-07-28  | 未修复(v2.1.41/aioncore v0.1.52)                                         | **增量(2.1.41)**：user-feedback「为什么我没有助手」根因=aioncore 启动失败(directory preparation)；见深挖 6                         |
| ELECTRON-3RD                                      | [link](https://iofficeai.sentry.io/issues/136692046/)   | active           | 2026-07-27      | 2026-07-28  | 未修复(v2.1.41/aioncore v0.1.52)                                         | **增量(2.1.41)**：claude+DeepSeek(cc-switch) 充值换 key 后 AionUi 内 claude 一直 Invalid API key；见深挖 7                         |

_说明：7d 窗口内的原生崩溃类 issue（RaiseException、HandleFatal、`__abort_with_payload`、`crash_reporter::DumpWithoutCrashing`、`partition_alloc::OnNoMemoryInternal`、Wayland/GL 崩溃、ENOSPC/SqliteError 磁盘满、installer-failure E10xx、BackendStartupError 各变体）**不属于本次用户反馈报告范围**，未逐个列出。_

---

## 深挖 1 — 团队 agent 唤醒失败（agent-team）——我方缺陷（已确认，版本匹配）

样本：**ELECTRON-3MD**。同类：3ME(codex)、3MF(copilot)、3NC(hermes)、3NB、3NJ。

- **Case**：团队协作："codex CLI 在团队中非常容易唤醒失败。但是单聊是完全 OK"。app 2.1.37，macOS 15.5 arm64，module `agent-team`。
- **生命周期**：previous 无 → **active / new**。确认我方 bug，当前版本仍存在。
- **检查证据**：截图 PNG、`logs.gz`（app+aioncore，2026-07-18..20）、`db-diagnostics.json.gz`；版本匹配 aioncore `v0.1.48` 源码。
- **截图证明**：6 成员团队（"商业化调研团队"：Claude Code ×2、Codex CLI、OpenCode、CodeBuddy、Copilot）卡在"正在唤醒团队… 正在准备成员"，**Codex CLI 头像上有红色错误角标**。团队始终不可用。
- **日志证明**（aioncore `aionui_team::service`）：
  - 团队 rebuild 以 `max_concurrency:3, start_stagger_ms:3000` 启动 6 个 agent。
  - 终态错误反复出现：`team agent rebuild attach failed … error:"Invalid request: failed to warm up rebuilt agent <slot>: Invalid request: ACP error"` —— Codex CLI(`gpt-5.5`) 与 CodeBuddy(`gemini-3.1-pro-preview`) 都是这句。底层原因被压平成一句无信息的 **"ACP error"**。
  - Codex CLI 进程**确实拉起了**（pid 68378/71227/72152），随后 ACP warmup 握手在约 750–890ms 内失败。
  - **全有或全无拆队**：一旦有单个失败，`cleaning up successfully attached agent after rebuild failure` 会把已成功 attach 的所有 agent（含 Claude Code lead）用 `kill_and_wait(TeamMcpRebuild)` 干掉，接着 `POST /api/teams/.../session` 返回 **400 BAD_REQUEST**。一个 teammate 失败 → 整队死掉。
  - 无限重试（06:53:21 → 06:53:57 → 06:54:25 …）每次都在 codex 处失败 —— 与截图 7 分钟后仍"正在唤醒团队"吻合。
  - 附带：`ERROR Failed to send SIGKILL to process group … Operation not permitted (os error 1)` —— 清理无法杀进程组 → 进程泄漏。
- **db 证明**：team/agent/conversation 记录已 provision；但 db **不记录** ACP warmup 失败原因（无 codex 原始 stderr / 握手报文）—— 所以仅凭 db 无法解释 codex 为何失败。
- **检查的版本链**：AionUi `v2.1.37` → AionCore `v0.1.48` → aionrs `v0.2.6`。代码读的是 AionCore `v0.1.48`（匹配）与 `v0.1.50`（当前）。
- **代码证明**（版本匹配）：
  - `crates/aionui-team/src/provisioning.rs:390`（v0.1.48）：`warmup_agent_process(...).map_err(|e| TeamError::InvalidRequest(format!("failed to warm up rebuilt agent {}: {e}")))` —— 包装 ACP 错误，内层 `{e}` 塌成 "Invalid request: ACP error"。
  - `crates/aionui-ai-agent/src/protocol/error.rs` `Display for AcpError`：`StartupCrash` 明确注释 **"stderr intentionally NOT included — may carry secrets"**，且 JSON-RPC 默认消息（"Invalid request"、"Internal error"…）被当作 `SDK_DEFAULT_MESSAGES`"carry no useful information" → codex 真正失败细节被抑制。
  - `crates/aionui-team/src/service.rs:1476-1484`（**v0.1.48 与 v0.1.50 均存在**）：rebuild 后若有任一失败，遍历已成功 attach 的 agent 逐个 `kill_and_wait(...)`，再 `Err(InvalidRequest("failed to attach rebuilt agent: {first_error}"))`。**"全有或全无"是设计使然，当前 release 仍未变 ⇒ 未修复。**
- **结论**：**我方产品缺陷（两处）** —— (A) 单个 teammate warmup 失败会中止并拆掉整个团队；(B) 可操作的失败原因（codex ACP 握手原因）被映射成不透明的 "ACP error"，用户与 logs/db 都看不到为什么。符合"first-party 操作脆弱 + 通用错误码 + 结构化细节丢失"的模式。
- **现在能否解决/定位**：**部分**。(A) 可直接定位并修复；(B) 可以不再吞掉细节，但此用户这次 codex 的具体失败原因在采集时已被丢弃，现有物料无法复原。
- **修复追踪**：暂无（本报告不修复代码）。建议方向：(1) team rebuild 容忍部分成功（启动可用 agent，把失败 teammate 标 `Failed` 并支持单 agent 重试），而非杀整队；(2) 把底层 ACP/CLI 失败原因（exit code、脱敏后的 stderr 分类、协议码）透传到面向用户的错误与 `feedback.runtime.*` 诊断字段；(3) 修复 `SIGKILL to process group … Operation not permitted` 清理路径。
- **建议新增诊断**：逐 teammate 的 warmup 结果 + 结构化原因 `{acp_code, exit_code, signal, stderr_class}`；db-diagnostics 增加 `team.rebuild.summary`（每个 slot 成功/失败），让今后 team 类 case 自解释。

---

## 深挖 2 — 流式 CJK 乱码（乱码）——我方缺陷（已确认，版本匹配）

样本：**ELECTRON-3NH**。同类：3P5（同 provider）。影响面**很广**：OpenAI 兼容路径上任何流式多字节（CJK）文本。

- **Case**：对话与会话："Aion CLI 会话中出现乱码，模型用的是 OpenCode Zen 的 deepseek-v4-flash-free"。app 2.1.38，macOS，module `conversation-session`。
- **生命周期**：previous 无 → **active / new**。确认我方 bug，当前 release 及 aionrs `main` 均存在。
- **检查证据**：截图 PNG、`logs.gz`、`db-diagnostics.json.gz`；版本匹配 aionrs `v0.2.6` 源码。
- **截图证明**（决定性）：渲染出的中文助手文本里，**U+FFFD(�) 替换符恰好落在 CJK 字符边界**，以孤立的 1–2 字为一段、周围文本完全正确 —— 例如 `权�模式`(权限)、`���理 外部技能路径`(管理)、`MCP ���务器`(服务器)、`技能指��`(指令)。这是**UTF-8 多字节序列在流式 chunk 边界被拆开、各 chunk 独立解码**的教科书特征。
- **日志证明**：aioncore 把该自定义 provider 按 OpenAI 兼容路由（`Resolved image input capability … provider=openai model=deepseek-v4-flash-free conversation_id=136f433e`）。流式模型文本**从不落日志**（日志里 0 个 U+FFFD 字节）—— 所以乱码只能在截图看到，日志无字节级证据。
- **db 证明**：`providers[].platform=custom`、`base_url_host=opencode.ai`(OpenCode Zen)、`api_key_configured=true`、`unhealthy_model_count=0`，涉事会话 `resolved_model_id=deepseek-v4-flash-free`。provider 健康 → 非鉴权/传输失败。（3P5 的 db 有个次要异常：多条 `model_id != resolved_model_id`，值得单独查"显示不全"。）
- **检查的版本链**：AionUi `v2.1.38` → AionCore `v0.1.49` → aionrs `v0.2.6`(`3cb928d4`)。Electron/TS 层**不做**流式字节解码（grep 已确认）；自定义 OpenAI 兼容流式完全在 aionrs 里。
- **代码证明**（版本匹配，aionrs `v0.2.6` `crates/aion-providers/src/stream_process.rs`）：
  - `process_openai_sse_stream`(121 行) 与 `process_openai_responses_sse_stream`(57 行)，以及第三条路径(182 行)，都是：
    ```rust
    let text = String::from_utf8_lossy(&chunk);      // 对每个原始 bytes_stream() chunk
    for frame in framer.push_text(&text, "[DONE]") { … }
    ```
    `SseLineFramer` 累积的是已解码的 `&str`，**不是原始字节**。一个 3 字节 CJK 字符若横跨两个网络 chunk，会被分别 `from_utf8_lossy` 成两半 → 每半不完整片段各变成一个 U+FFFD。非确定性、边界对齐，正是观测到的形态。
  - **aionrs `origin/main` HEAD 仍是这样**（57/121/182 行未变），当前 release 也 pin 了 aionrs `v0.2.6` ⇒ **未修复；影响所有流式 provider 的多字节输出，不止 deepseek。**
- **结论**：**我方 SDK 缺陷**，位于 aionrs 流式解码 —— 每个 chunk 急切地 `from_utf8_lossy`，缺少字节级 carry buffer 来保留未完成的尾部 UTF-8 字节。
- **现在能否解决/定位**：**能**。根因与修复位置已锁定。修复方向：在 `Vec<u8>`/`BytesMut` 里缓存原始字节，只解码跨 chunk 边界完整的 UTF-8 序列（把不完整尾字节带到下一个 chunk），即先按字节成帧再解码，或用增量 UTF-8 解码器。
- **修复追踪**：✅ 已实现（据用户授权）。aionrs 分支 `fix/sse-utf8-chunk-boundary`（worktree `~/Documents/github/aionrs-worktrees/fix-sse-utf8`，基于 origin/main@386c6fe，**未 commit/合并**）：`framing.rs` 新增 `Utf8StreamDecoder`（字节级 carry buffer），三条 SSE 路径改用 `decoder.push(&chunk)` + 循环后 `flush()`；Bedrock 路径本就按字节缓冲未动。`cargo build/test -p aion-providers` 全绿（222+4+9+11 passed），含"权限管理服务器"跨 chunk 拆字、零 U+FFFD 单测。后续：审阅→PR 到 aionrs main→aioncore 更新 aionrs pin→随新 AionUi 版本发布验证。详见 `sentry-feedback-resolutions/ELECTRON-3NH.json`。
- **建议新增诊断**：定位本 bug 无需额外诊断（截图已足够）。可选：`stream_diagnostics` 增加 `stream.decode.replacement_char_count` 计数器，今后无需截图即可自动标记编码回归。

---

## 深挖 3 — 自定义模型图片识别失败 —— 我方缺陷（已确认，跨 3 案 + 代码机制坐实）

样本：**ELECTRON-3M4 / 3M5 / 3P8**。

**跨案根因**：AionUi 把上传/粘贴的图片存到**每会话的 OS 临时目录**（Windows `…AppData\Local\Temp\aionui\<convId>\image-N.png`；macOS 同理），该目录**位于 agent 工作区/沙箱之外**（如 `D:\AionUiWS\PPTMake`），并且**没有把图片作为多模态 vision 内容嵌入**，只把文件路径塞进文本上下文。叠加两个失败模式：

1. **能力缺口**：自定义/自配 provider `capability_count: 0`（未声明 vision）；内建 aionrs 路径日志 `image_input_capability: "Unknown"`(source `catalog`) → 不嵌入图片。
2. **沙箱缺口**：临时图片路径触发 `/api/fs/image-base64` 返回 **`403 PATH_OUTSIDE_SANDBOX`**（"Path is outside the allowed sandbox"），连能读文件的 ACP 后端（Codex/Claude Code）也拿不到像素。结果：模型只收到一个文本路径 → 幻觉 / "无法读图"。

**代码机制坐实**（aioncore）：

- `crates/aionui-file/src/routes.rs:137/433` `/api/fs/image-base64` → `service.rs:1019 get_image_base64(path, extra_root)`：受 workspace 沙箱约束（`extra_root`），路径在工作区外即 `PATH_OUTSIDE_SANDBOX`（`routes.rs:785` 测试印证错误码）。
- `crates/aionui-ai-agent/src/capability/image_input`（`resolve_image_input_capability`）：能力为 `Unknown` 时不走 vision 嵌入。
- `crates/aionui-ai-agent/src/manager/aionrs/content.rs:9`：`ViewImage` 工具"仅当 vision 模型请求时才加载图片"—— 未声明 vision 则不会加载。

### ELECTRON-3M4 — 内建 agent + 自定义 Kimi-K2.7-Code

- app 2.1.37（Win x64），event `287c437616984c53a89a46c897b7055c`。内建 aionrs("Aion CLI")，模型 `Kimi-K2.7-Code`，provider `cb07eca2`(custom, host `cch.qrswzql.cn`, `capability_count:0`)。
- **截图**：会话"识别这张图"。Kimi 先幻觉成"《原神》…派蒙"，被质问后自认："我实际接收到的只有那段文字路径 `…\Temp\aionui\general\image-1.png`，没有收到图片本身的视觉数据/图像 token…可能是 AionUi 只把路径塞进文本上下文"。
- **日志证明图片未作 vision 传入**：`image_input_capability:"Unknown"`(1803 行)；workspace `D:\AionUiWS\PPTMake`，图片在 temp；多条 `/api/fs/image-base64 … status:403 … PATH_OUTSIDE_SANDBOX`；turn 诊断 `saw_tool_or_side_effect:false`。
- **db 证明**：provider `capability_count:0`；反馈会话 `71cd51d5` 所有消息 `image_count:0, attachment_count:0`。
- **结论**：**AionUi 丢弃了图片 / 能力配置缺口**。Kimi vision 能力未声明(`Unknown`)，AionUi 从未嵌入图片，仅转发 temp 路径文本 → 幻觉。非"模型没有 vision"，而是"未打能力标 + 临时路径在沙箱外"。

### ELECTRON-3M5 — Codex 后端 + 粘贴图片（与 3M4 同用户/同 session）

- app 2.1.37（Win x64），event `e458c7d6cdf74ea1b97d2140a2fa3c19`。内建 Codex CLI(ACP)，模型 `gpt-5.6-terra`，会话 `0733cfec`/`921b70fb`。
- **截图**：助手反复称图片"未能加载"："附件临时路径受到当前文件访问限制"；引用 `…\Temp\aionui\0733cfec\image-2.png` vs 工作区 `D:\AionUiWS\PPTMake`；判定为"系统在'上传成功'和'代理可用'之间缺少交接层…Windows 沙箱目录权限组合处理不完整"。
- **日志证明**：反馈窗口内 `/api/fs/image-base64` 有 status 200（UI 缩略图加载 OK），但整 session 共 **18 次 `403 PATH_OUTSIDE_SANDBOX`**。Codex(ACP) 只拿到沙箱/cwd 之外的 temp 路径，读不到像素。
- **db 证明**：两个 provider 均 host `cch.qrswzql.cn`，均 `capability_count:0`。
- **结论**：**AionUi 丢弃/拦截了图片**（temp 路径在 Codex 工作区沙箱外 → `PATH_OUTSIDE_SANDBOX`）；能力配置也缺失。

### ELECTRON-3P8 — Claude Code(opus) + 图片，识别错误

- app 2.1.39（macOS arm64），event `2bd0a306fc1f43edb5e48e1bf232c5fe`。内建 Claude Code(ACP)，模型 `opus`（opus 本身是 vision 模型）。会话 `7266025e`，标题"aionui没法识别图片，使用claude code也提示无法读图片，强制让他读结果读出来的是错的"。
- **截图**（`screenshot-1-image.png`）：上传图是 AionUi 项目侧栏视图（tools_skills / daily_work 文件夹），而模型在反馈里描述成"腾讯云 SCF 配置页面"—— 内容完全对不上（幻觉）。
- **日志证明**：`/api/fs/image-base64` 在 macOS 返回 **200 ×79，0 个 403**（沙箱 403 未触发）。本包内 `image_input_capability:"Unknown"` 日志属于 `deepseek-v4-pro` 的 aionrs 会话（非 vision 模型），非涉事 opus 会话。opus/Claude-Code 会话 `7266025e` 有 43 次 `acp_tool_call` 与一次失败的 `Bash` —— agent 是想用文件工具去够图片，而非收到图片内容块。
- **db 证明**：4 个 provider（Moonshot、Ark、DeepSeek、Gemini）**全部 `capability_count:0`**。
- **结论**：**AionUi 未把图片作为 vision 内容交给模型** —— opus 有 vision 却给出完全错误描述，说明图片只以路径/工具目标到达，未作为图像块嵌入。与 3M4/3M5 同类（交付缺口），且与沙箱 403 无关（macOS 未触发 403）。

**修复追踪**：一次修复尝试**已被撤回**（分支 `fix/image-vision-handoff` 已删、worktree 已移除，从未 commit），原因：不加限制地把整张图 base64 内联 + 图像块留在历史每轮重发 → 打爆上下文。**（重要纠正）** 经直接读源码证实：**aionrs 不存在"懒加载 ViewImage"工具**（`Read` 对图片只回 "(binary file)"，无任何返回图像的工具，aioncore 那句注释是错的）；图片到达模型的**唯一机制**就是 base64 `ContentBlock::Image { image_url }` 块——v0.2.6 的 provider（anthropic/openai_messages/openai_responses）确实序列化它。所以被撤回那版**用的 API 是对的**，只错在"无上限 + 留历史重发"。**正确修法（待产品决策）**：仅对视觉模型发 Image 块，并 (1) 先把图片降采样/重编码到小上限（如 ≤1024px / ≤1MB）再 base64；(2) 不把 base64 图像块留在重发历史里——只在上传那一轮附带（历史里存文本路径，仅当前消息展开成图像块），或在 compaction 时剥离旧图像块。另有**版本错位**：aioncore 出 aionrs v0.2.6（有 Image 块），aionrs `main` 已重构掉 `ContentBlock::Image`。详见 `sentry-feedback-resolutions/ELECTRON-3M4.json`。

**图片集群诊断缺口**：日志**不含出站模型请求体**（content parts），所以"图片被丢弃"是靠 (a) capability=Unknown + 无 vision 嵌入、(b) 403 沙箱拦截、(c) 模型自认/内容错配 三者共同证明，而非抓到请求 payload。若能记录请求形态（含 `image_url`/`input_image` vs 纯文本）即可一锤定音。3P8(macOS) 无 403，其具体交付失败点为推断。`db-diagnostics` 只给 `capability_count` 聚合值，不逐模型列 vision 标志。

---

## 深挖 4 — 供应商/连接（商汤限流、更新后 kilo、本地 qwen）—— 混合（非我方核心 bug）

### ELECTRON-3N3 — 商汤免费模型"供应商限流" → **供应商侧**

- app 2.1.38，Windows CN。provider 商汤 SenseNova(`token.sensenova.cn`, custom/OpenAI 兼容)，模型 `deepseek-v4-flash`(免费档)。event `42ad1c278fe74f768e603b877f43cad1`。
- **截图证明**面向用户的错误：`错误码: USER_LLM_PROVIDER_RATE_LIMITED` + 上游报文 `code:"insufficient_quota"`、"You exceeded your current quota…"；发生在一次 agentic 编码任务（大段 Python 脚本）已产出较多内容之后。
- **日志证明**：`feedback.runtime.aionrs_error error_kind="provider" provider_error_class="rate_limited" http_status=429`，映射 `ownership=UserLlmProvider, retryable=true`。07:10–07:17 共 **30 次限流** turn，其间有成功 → 间歇额度耗尽，非连接断死。app 把部分无输出 turn 标 `safe_to_auto_replay=true` → 自动重试，向已被限流的 provider 又压请求。
- **db 证明**：单个商汤 provider，`api_key_configured=true`，配置健康。
- **结论**：**供应商侧** —— SenseNova 免费档额度/RPM 耗尽。"打招呼 OK 但任务失败"= 一次调用 vs 任务的多次快速工具循环调用。非我方 bug。次要加剧因素：AionUi 对限流 turn 的激进自动重试。
- **诊断缺口**：上游 `insufficient_quota` JSON 报文**只在渲染层 UI**，不在可下载日志（grep `insufficient_quota|quota|billing` = 0 命中；日志只有通用 "Rate limited, retry after 5000ms" + `http_status=429`）。未捕获 `Retry-After`/额度重置窗口。

### ELECTRON-3N2 — kilo"一更新就用不了，测试连接报错" → **用户配置/agent 鉴权 + 更新触发 DB 迁移错配**

- app 2.1.38，Windows CN。内建 ACP agent **kilo**(`backend=kilo`)，走托管 Node runtime。event `ae330d32d49f437db974b16d6f924a73`。
- **截图证明**toast：**"CLI 已启动，但初始化失败。请先完成登录或首次设置，然后重新测试连接。"**，agent 列表"不可用 34"。
- **日志证明**：kilo `acp_initialize_success elapsed_ms=265` → `session/new` **成功** → health-check 200 → 随后 `CLI process exited status=ExitStatus(1)` → 分类 `acp_init_failed`。即 **ACP 传输是通的；kilo 自己的 CLI 进程退出**（未登录/首次设置未完成 —— app 提示准确）。之前紧邻有两次启动失败 `BOOTSTRAP_DATA_INIT_FAILED stage=database.migration … "migration 25 was previously applied but is missing in the resolved migrations"` → 典型更新后 DB 迁移错配。"不可用 34"被无关的 npx-ENOENT 和一个 custom agent 30s 初始化超时撑大。
- **db 证明**：`agent_health` kilo `last_check_error_code=acp_init_failed, last_check_status=offline`；其他内建 ACP agent online。
- **结论**：**用户配置/agent 鉴权**，且有**可信的更新触发回归**（migration 25 错配说明更新动了本地 DB/状态，很可能使 kilo 登录失效）。AionUi 里传输并未坏。
- **诊断缺口**：kilo 自身 exit-1 进程的 stderr **未捕获**（只有无关 npx 的 stderr）；启动参数被脱敏(`args=1`)。无更新前快照证明 kilo 曾 online。`migration 25 missing` 本身值得单独查（降级/改名遗留了孤儿 applied 迁移）。

### ELECTRON-3P3 — qwen3.6:35B"被 token 上限截断" → **本地模型上下文占满 + AionUi 缺 context 保护**

- app 2.1.39，Windows ES，**无截图**。本地 OpenAI 兼容服务(`localhost`)，模型 `qwen3.6:35b`，`context_limit=None`。event `cae40408a9944ddcb8d3d6ab41ca3c96`。
- **日志证明**：反复 `provider_stream_summary http_status=200 finish_reason="length" input_tokens≈64800–65412 output_tokens=124–736 content_bytes=0 empty_answer=true`。恢复过程 `generation_phase="max_tokens_finalization" tools_disabled=true` 再次空 length。输入(~64–65k) 几乎占满模型 ~65,536 窗口 → 无空间产出。
- **db 证明**：本地 provider `context_limit=None`，`model_count=12`，`unhealthy_model_count=4`。
- **结论**：**用户配置/本地模型限制** + AionUi 弱点：`context_limit` 未设时 AionUi 不按本地模型真实窗口裁剪/护栏，导致每 turn 都空 `finish_reason=length`。全程 HTTP 200 → 非供应商宕机。次要症状"输入即消失、什么都不显示"是渲染层现象，后端日志**无法确认**（无截图）。
- **诊断缺口**：无截图；日志不记录本地服务 `n_ctx`；渲染层"文字消失"在诊断包内无证据。

---

## 深挖 5 — ELECTRON-3PN "公司内网中 pi 链接不上"（agent-detection）—— 我方产品限制（探测超时過短，跨机转述反馈）

- **Case**：[ELECTRON-3PN](https://iofficeai.sentry.io/issues/ELECTRON-3PN)（issue 136120519），event `e3707675260a444badda8b4c6529e1cf`，2026-07-23T13:12Z。反馈文字仅"公司内网中pi链接不上"。app 2.1.31（macOS 26.1, arm64, KR/Seoul, 时区 Asia/Shanghai）。
- **Lifecycle**：new → active。baseline 报告未含此案（该报告范围 2.1.36–2.1.39，本案 app 2.1.31 但事件在范围时间窗内新出现）。
- **Evidence inspected**：3 个附件全部下载并解包 —— `screenshot-1-企业微信截图_*.png`（已看图）、`logs.gz`（6 个日志段，2026-07-20/21/23）、`db-diagnostics.json.gz`（4 个 profile 全读）。
- **截图证明（本案主证据）**：截图是**企业微信里转发的另一台 Windows 机器上的 AI 排查记录**，结论完整：pi 的 npm 包含 **~19,300 个文件**，`pi.cmd --version` 冷加载实测 **5.6–6.8s**（`PI_OFFLINE=1` 最好压到 4.8s，Defender 已排除），而 AionUi 探活超时 5s → **探测必然超时**，"链接不上"。截图中已指向 `command_override`/`env_override` 作为绕过。
- **日志/db 证明（反馈者本机）**：反馈者自己的 mac（2.1.31 = aioncore v0.1.44）**没有任何 pi 痕迹**：db `agent_health` 21 个 agent 无 pi backend（v0.1.44 registry 尚无 pi）；日志仅有 Claude Code health-check 200(3.7s)。附件对本案根因**无直接贡献**——这是一条替同事/内网环境转述的反馈。
- **Version chain inspected**：AionUi v2.1.31 → aioncore v0.1.44（无 pi builtin）；pi builtin 由 aionCore PR #618（commit `0b9b3a88`，2026-07-15）加入，首个含它的 tag **v0.1.48**（即 AionUi 2.1.37+）。截图机器实际版本未知（≥2.1.37 推断）。
- **What code proves（current main = v0.1.50 同源）**：`aionui-ai-agent/src/cli_probe.rs:8` `CLI_VERSION_TIMEOUT = 5s`，探测跑 `<binary> --version`；`aionui-runtime/resources/acp-registry-npx-lock.json` 中**只有 `sigit` 有 `skip_version_probe: true`，pi 没有**（`registry_npx_lock.rs:154` 测试明确断言 pi 不跳过）。跳过机制已存在，pi 未启用 → 5s 上限对 2 万文件的 pi 包冷加载在 Windows 上不可达。
- **Conclusion**：**我方产品限制（our-bug 类）**——固定 5s 版本探测超时对超大 npx agent 包（pi-acp）不成立；探测失败被呈现为"链接不上"，用户无法自诊断。"公司内网"是环境背景而非根因（截图已排除联网/杀软因素）；内网首次 `npx -y pi-acp` 拉包失败是**另一潜在层**，本案证据无法证明。与 SSL_CERT_FILE 环境泄漏问题**不同源**（那是 TLS 校验失败，本案是探测超时）。
- **Can we solve or locate it now?**：yes（定位完成）。修复候选（按侵入度）：① lock 文件给 pi 加 `skip_version_probe: true`（机制现成，一行）；② 探测超时对 npx 包按包体分级/放宽；③ 探测结果缓存首个成功后免再冷探。
- **Fix tracking**：[AionCore#675](https://github.com/iOfficeAI/AionCore/issues/675) → **[PR#678](https://github.com/iOfficeAI/AionCore/pull/678)**（2026-07-24，分支 `fix/agent-probe-pipeline`，4 commits）。实现：失败分类（version_probe_failed/timeout + 耗时）、超时落 Unchecked + 后台 30s 复检（持久化 startup 快照）、自适应 inline 跳过（按实测历史，无静态名单）、手动检测去短路可翻案、claude/codex 及 commandless builtin 补 PATH+--version（无 ACP 握手）、删除 cli_detect PATH-only 旁路、新错误码 guidance。验证：nextest workspace 7431 绿、clippy 干净、migration-check 过。resolution note：`sentry-feedback-resolutions/ELECTRON-3PN.json`（candidate-fixed）。
- **Diagnostics to add**：探测失败时把 probe 命令、耗时、超时上限写入 `last_check_error_message`（现在只有笼统状态）；feedback 事件附带 agent 探测最近一次失败详情，可免去"截图转述"依赖。

---

## 深挖 6 — ELECTRON-3S4「为什么我没有助手」（assistant-preset）—— aioncore 启动失败（已确认，版本匹配 v2.1.41）

> 增量案件（AionUi@2.1.41，2026-07-28）。用户假设「aioncore 启动失败」**经证据链确认成立**。
> **2026-07-28 二次修正**：初版结论「间歇性/环境性（盘掉线或锁）」**错误**。完整时间线证明这是**确定性 bug**：11:13 首次启动用**默认 workDir（C:\）成功**；用户随后在设置里把工作目录改成**盘符根 `D:\`**（11:19 退出重启）；此后 **3/3 次启动**（11:19:24、11:35:34、12:12:08）全部在 ~3ms 内同因失败，期间用户 3 次重开被单实例锁挡回（11:27/11:29/11:30）。**D 盘全程在线且健康——应用本体就装在 `D:\aionUI` 运行**。根因是 Node 文档明载的 Windows 行为：对盘符根 `fs.mkdir` **必然抛 EPERM**（即使 `recursive:true`、即使盘存在；Windows `CreateDirectory` 对盘符根返回 `ERROR_ACCESS_DENIED` 而非「已存在」，Node recursive 只吞 EEXIST）。对照变量法可锁定失败目录：成功与失败两组启动间 dbPath/logDir/cacheDir 完全相同，**唯一变化就是 workDir**。首选修复：`ensureBackendStartupDirectory` 改为 **stat-first**（已存在目录直接跳过 mkdir）；次选：设置时校验盘符根/不存在路径 + 启动失败日志补 errno/失败目录。引入源：PR #3536（`a516ac5db`，v2.1.31 首发，仅在 macOS 验证——macOS 无盘符根概念，测不到此路径）。

- **Case**：ELECTRON-3S4 / issue 136922682 / AionUi 2.1.41 / Windows 10 / 中国佛山 / zh-CN。反馈文本「为什么我没有助手吧」，module=assistant-preset。附件：screenshot + logs.gz（**无 db-diagnostics.json.gz**，仅 2 个附件）。
- **Lifecycle**：new → active。首次在本报告范围分析（scope 从 2.1.36–2.1.39 增量扩展到 2.1.41）。
- **Evidence inspected**：截图 PNG（实际查看）；logs.gz 解压后 `2026-07-28.aioncore.log` + `2026-07-28.log`（1451 行，实际解压 grep）。
- **两次会话（关键）**：
  - 会话 A（UTC 03:13 / 北京 11:13）：aioncore **成功启动** —— `Server listening on 127.0.0.1:52456`、`/health 200`、`GET /api/assistants 200`（word/excel/ppt/dashboard 等内置助手头像全部加载）、`acquired data-dir instance guard`；用户还主动启用了一批助手（`assistants.enabledOrder` 数组 51→210 bytes 持续增长）。
  - 会话 B（UTC 04:12 / 北京 12:12，**即提交反馈那次**，app_start_time 04:12:05、反馈 04:13:45）：aioncore **启动失败**。
- **What logs prove（会话 B 决定性）**：
  - `[aioncore] starting: ...\bundled-aioncore\win32-x64\aioncore.exe --port 0 --data-dir C:\...\aionui --work-dir D:\ --local`
  - `[error] Failed to start aioncore: BackendStartupError: aioncore startup directory preparation failed`（启动后 **4ms 同步失败**，未到 spawn/等端口）堆栈 `makeStartupError → BackendLifecycleManager.attemptStart`。
  - `[error] [WebUI] Failed to read preferences from backend: TypeError: fetch failed`（后端未起 → 前端连不上）。
  - app **未退出**（degraded 模式）→ UI 正常渲染（截图有「助手」菜单）但助手数据全空 → 用户看到「没有助手」。
- **What db proves**：本 case **无 db-diagnostics 附件**，仅日志。db 维度对本 case 无增量。
- **Version chain inspected**：AionUi `v2.1.41`；aioncore `v0.1.52`（package.json）——但**错误发生在 AionUi/web-host 侧目录准备，aioncore.exe 根本未 spawn**，故 aioncore/aionrs 版本对根因不适用。
- **Code version inspected / What code proves（v2.1.41）**：
  - `packages/web-host/src/backend-launcher.ts:641-648`：spawn 前对 5 个目录逐一 `ensureBackendStartupDirectory()`：`dbPath`(data-dir C:\)、`logDir`(C:\)、`cacheDir`、**`workDir`=`D:\`(盘符根)**、`logDir`；任一失败即 `throw makeStartupError('spawn','aioncore startup directory preparation failed', error)`。
  - `:382` `ensureBackendStartupDirectory` = `mkdirSync(dir,{recursive:true})`。`recursive:true` 吞掉 EEXIST，故失败必为 **ENOENT（盘/路径不存在，如 `D:\` 可移动/网络盘未挂载）** 或 **EPERM/EACCES（权限/被锁，如杀软或残留实例占用 data-dir）**。
  - `packages/desktop/src/process/startup/backendStartupFailure.ts:46` 将此归类 `STARTUP_DIRECTORY_UNAVAILABLE`；同文件注释引用 **Sentry 135525166**（并发启动竞争 / data-dir instance-guard / assistant bootstrap contention）——本 case 与之**相邻但不同类**（目录 mkdir 失败 vs 并发 peer）。若会话 A 实例残留占锁，可桥接两者。
- **Conclusion**（已按顶部「二次修正」更正）：**我方确定性缺陷**。用户假设 aioncore 启动失败 **CONFIRMED**。~~会话 A 同参数成功 → 间歇性~~ **错误**：会话 A 用的是**默认 workDir（C:\）**；改成盘符根 `D:\` 后 3/3 必挂——Windows 对盘符根 mkdir 必然 EPERM（Node 文档明载），与盘在不在无关（应用本体就在 D 盘上跑）。
- **Can we solve or locate it now?**：**yes**。失败目录经对照变量法锁定为 workDir（成功/失败两组间唯一变化项）；errno 为 Node 文档明载的 EPERM。日志缺 `causeMessage` 仍是诊断缺口（本可一眼定位），但已不阻塞本案结论。
- **Fix tracking**：无 PR。见 `sentry-feedback-resolutions/ELECTRON-3S4.json`。
- **Diagnostics to add**：① 把 `causeMessage + 失败目录 + errno` 写进 `[AionUi] Failed to start aioncore` 日志与 Sentry startup-failure details（当前完全缺失，是定位阻塞点）；② 评估**不要对 `workDir=D:\` 盘符根做 mkdir**（盘符根非 app 所有，其 ENOENT/EPERM 不应阻断后端启动）；③ degraded 模式给明确 UI 提示（「后端不可用，助手无法加载」）而非静默空列表 + 有界重试。

## 深挖 7 — ELECTRON-3RD「充值换 key 后 AionUi 内 claude 仍 Invalid API key」（conversation-session）—— cc-switch env 注入静默为空（版本匹配 v2.1.41 / aioncore v0.1.52）

> 增量案件（2026-07-27，macOS M1）。用户链路：claude 走 DeepSeek（cc-switch 风格）→ 欠费报错（合理）→ 升级 AionUi + 充值 + 换 key → 终端 claude 正常、AionUi 内 claude 一直「Invalid API key · Fix external API key」。

- **Evidence inspected**：截图（claude 会话报 Invalid API key，模型 Default）；logs.gz 9.5 万行（07-23/24/27 三天，aioncore+app+aionrs 段）；db-diagnostics.json.gz（providers / agent_metadata / acp_session）。
- **What logs prove**：
  - 07-23：claude turn 报 `UserLlmProviderBillingRequired`（text_len=35）——请求**到达 DeepSeek**，key 有效、账户欠费。
  - 07-27：每次 claude turn ~3s 内 `UserLlmProviderAuthFailed`（text_len=39 = "Invalid API key · Fix external API key"）。
  - 07-27 spawn 走 **session-port SessionAgentTask**（非 AcpAgentManager），`resolved bundled cli: claude 2.1.215`（**捆绑版**，非用户 PATH 版）。
  - spawn env 只有 `AIONUI_*` 四个变量；**全程零 cc-switch 日志行**——`read_claude_provider_env()` 静默返回空（静默路径仅两种：`~/.cc-switch/settings.json` 读不到，或 `currentProviderClaude` 为空；其余失败路径都会打 warn，日志中没有）。
- **What db proves**：DeepSeek provider（custom，api.deepseek.com）`updated_at=07-27 02:22`（用户换过 key）且 02:54 health check 成功 → **新 key 对 OpenAI 端点有效**；Claude Code agent `last_check_error_code=auth_required`、`last_success_at=07-23 09:32`；agent 自身 env 为空（env_bytes=2）。
- **Version chain**：AionUi v2.1.41 / aioncore v0.1.52（session-port）/ 捆绑 claude CLI 2.1.215。
- **What code proves**（aionCore v0.1.52）：`session_agent.rs:1227`（GAP #5）claude spawn 的 DeepSeek 凭据**只来自 cc-switch 配置读取**（`~/.cc-switch/settings.json` 的 `currentProviderClaude` + `cc-switch.db` 的 `providers.settings_config.env`）；**AionUi 自己的 provider 配置从不进入 claude spawn**——所以用户在 AionUi 里换 key 无效（"换key也不行" 的直接解释）。
- **Conclusion（proven + inferred）**：注入为空 + 捆绑 claude 回退到本机残留的外部 key 来源（`~/.claude` settings env / apiKeyHelper 中**换 key 前的旧 key**）→ DeepSeek 401；终端 claude 能用是因为 shell env 带新 key，GUI 启动的 AionUi 看不到。升级可能是干扰项：cc-switch 注入或许一直静默为空，欠费前能用只是因为旧 key 当时有效；**换 key（旧 key 作废）才是断点**。
- **Can we solve or locate it now?**：partial——机制链条已证，但用户 cc-switch 版本/布局（v2 config.json vs v3 settings.json+db）与 `~/.claude` 内实际残留的 key 来源无法从附件确认。
- **Diagnostics to add**：① cc-switch 读取静默为空时打一行 info/warn（缺哪个条件）——本案有这一行即可秒诊；② 记录 spawn 的 claude 实际命中的 auth 来源。
- **Fix tracking**：无 PR。见 `sentry-feedback-resolutions/ELECTRON-3RD.json`（含用户侧 workaround 与产品侧三个方向）。

## 已解决 / candidate-fixed

- **窗口控制回归**（最小化/最大化/关闭失效、右上角区域点不动）—— 14 个 case（3NS、3M7、3KS、3KN、3KH、3KG、3KD、3KC、3KB、3KA、3K9、3K6、3K5、3K4），跨 zh/en/ja/es、Win11/macOS/Linux，多个明确写"升级/更新后"。**用户告知此问题已修复。** 修复 commit/版本尚未在 `main` 上定位到（`main` 的 titlebar/WindowControls 历史未见对应修复，可能在单独分支、原生窗口框改动或其他文件/未合并）。已记入 `sentry-feedback-resolutions/ELECTRON-3NS.json`（集群 note）。下一步：确认确切修复 commit 与发布版本后，把该集群转 `fixed`/`verified` 并 resolve 对应 Sentry issue。

## Skipped Existing Cases

无（baseline 运行，无历史 ledger 可跳过）。

---

## 聚合分组（仅 active 反馈）

- **我方产品/工具缺陷**：team-wakeup 全有或全无 + ACP 错误不透明（3MD/3ME/3MF/3NC/3NB/3NJ）；流式 CJK 乱码解码（3NH/3P5）；图片未作 vision 交付 + 沙箱路径缺口（3M4/3M5/3P8）；pi 探测 5s 超时不适配超大 npx 包（3PN，深挖 5）。
- **供应商/用户环境**：3N3（商汤额度耗尽，供应商侧）；3N2（kilo 需登录 + 更新 DB 迁移错配）；3P3（本地模型上下文占满）。
- **需求（非 bug）**：3P9、3P0、3NX、3NR、3N6、3M3、3M0、3KZ、3KY、3MQ、3KV、3KP。
- **描述不足**：3P7、3NM、3NK、3N7、3MR、3MN、3MM、3MH、3MY、3M1、3M9。
- **历史已修（据用户）**：窗口控制集群（14 个）。
- **待进一步检查**：3M2（模型/agent 全消失 —— 疑似数据丢失 bug）、具体 UI 清单（3P4/3P1/3NN/3NZ/3N5/3N4/3N0/3MW/3MT/3M8/3M6/3MJ/3KW/3MG/3MK/3MX/3MV/3KX）。

## db-diagnostics 有效性（skill 核心问题）

- **相对日志新增**：provider/model 配置 + 健康、resolved-model 映射、conversation/agent/team 状态、能力标志 —— 足以对乱码与 team 类 case 确认"配置健康"并排除鉴权因素。
- **对根因仍缺**：(1) team warmup 的终态 ACP/CLI 失败原因（采集时被丢弃）；(2) 流式模型内容的任何字节级痕迹（编码 bug 只能在截图看到）；(3) 图片类的出站请求体（无法直接证明图片被丢）。补上"逐 teammate warmup 结果 + 结构化原因"、"流式替换符计数"、"图片请求形态（含 image_url vs 纯文本）"三项，能让这三类集群仅凭 db+logs 自解释。
