# ACP 单聊功能 PRD 索引

> 本目录下的文档由 PM 从 `prd-acp-scenarios.md` 抽取 ACP 单聊相关功能点，按模块拆分。
> 排除了 F-TEAM-_（团队协作）和 F-CRON-_（定时任务）。

## 模块文件

| 模块文件                           | 功能点数 | 编号范围                            |
| ---------------------------------- | -------- | ----------------------------------- |
| [session.md](./session.md)         | 10       | F-SESSION-01 ~ 10                   |
| [messaging.md](./messaging.md)     | 9        | F-MSG-01 ~ 08 + F-FILE-02           |
| [config.md](./config.md)           | 10       | F-CONFIG-01 ~ 10                    |
| [permissions.md](./permissions.md) | 5        | F-PERM-01 ~ 04, 06                  |
| [display.md](./display.md)         | 10       | F-DISPLAY-01 ~ 04, 06 ~ 07, 10 ~ 13 |
| [reliability.md](./reliability.md) | 6        | F-RELIABILITY-01 ~ 02, 04 ~ 07      |
| [skills.md](./skills.md)           | 3        | F-SKILL-01 ~ 03                     |

**总计：51 个独立功能点**（F-PERM-05 已合并至 F-PERM-03；F-DISPLAY-05/08/09/14、F-RELIABILITY-03/08/09 已合并至其他功能点）

## 功能点总表

| 编号             | 标题                         | 状态     | 模块        | skip 白名单                     |
| ---------------- | ---------------------------- | -------- | ----------- | ------------------------------- |
| F-SESSION-01     | 创建新会话                   | 已实现   | session     |                                 |
| F-SESSION-02     | 进入会话并建立连接           | 已实现   | session     |                                 |
| F-SESSION-03     | 停止当前 AI 回复             | 已实现   | session     |                                 |
| F-SESSION-04     | 意外断连自动处理             | 已实现   | session     |                                 |
| F-SESSION-05     | 空闲会话自动释放             | 已实现   | session     |                                 |
| F-SESSION-06     | 重置所有会话                 | 已实现   | session     |                                 |
| F-SESSION-07     | 删除会话                     | 已实现   | session     |                                 |
| F-SESSION-08     | 查看会话详情与状态           | 已实现   | session     |                                 |
| F-SESSION-09     | 会话迁移                     | 已实现   | session     |                                 |
| F-SESSION-10     | AI 回复完成处理              | 已实现   | session     | turn 完成边界待确认             |
| F-MSG-01         | 发送文本消息                 | 部分实现 | messaging   |                                 |
| F-MSG-02         | 在消息中引用文件             | 部分实现 | messaging   |                                 |
| F-MSG-03         | 首条消息自动注入 AI 规则     | 已实现   | messaging   |                                 |
| F-MSG-04         | 隐藏消息与静默消息           | 已实现   | messaging   |                                 |
| F-MSG-06         | 输入框历史记录               | 已实现   | messaging   |                                 |
| F-MSG-07         | 重试与撤销上一轮对话         | 未实现   | messaging   | skip: undo/redo 未实现          |
| F-MSG-08         | `/btw` 追加上下文            | 部分实现 | messaging   |                                 |
| F-FILE-02        | AI 读取和写入文件            | 已实现   | messaging   |                                 |
| F-CONFIG-01      | 切换 AI 模型                 | 已实现   | config      |                                 |
| F-CONFIG-02      | 切换会话模式                 | 已实现   | config      |                                 |
| F-CONFIG-03      | 调整 AI 参数选项             | 已实现   | config      |                                 |
| F-CONFIG-04      | 查看模型信息                 | 已实现   | config      |                                 |
| F-CONFIG-05      | 查看当前模式                 | 已实现   | config      |                                 |
| F-CONFIG-06      | AI 响应超时设置              | 已实现   | config      |                                 |
| F-CONFIG-07      | 免确认模式的自动迁移         | 已实现   | config      |                                 |
| F-CONFIG-08      | Codex 后端沙盒安全级别联动   | 已实现   | config      |                                 |
| F-CONFIG-09      | 配置自动保存与恢复           | 已实现   | config      |                                 |
| F-CONFIG-10      | 后端能力信息缓存             | 已实现   | config      |                                 |
| F-PERM-01        | AI 操作权限审批              | 部分实现 | permissions | skip: 30 分钟超时自动拒绝未实现 |
| F-PERM-02        | 权限确认操作                 | 已实现   | permissions |                                 |
| F-PERM-03        | 免确认模式 / YOLO 模式       | 已实现   | permissions | skip: codebuddy 差异待研发确认  |
| F-PERM-04        | 查看待确认操作列表           | 已实现   | permissions |                                 |
| F-PERM-06        | 会话创建时的模式与权限初始化 | 已实现   | permissions |                                 |
| F-DISPLAY-01     | AI 回复实时逐字显示          | 已实现   | display     |                                 |
| F-DISPLAY-02     | AI 思考过程展示              | 已实现   | display     |                                 |
| F-DISPLAY-03     | AI 工具调用展示              | 已实现   | display     |                                 |
| F-DISPLAY-04     | AI 执行计划展示              | 已实现   | display     |                                 |
| F-DISPLAY-06     | 网页预览打开                 | 已实现   | display     |                                 |
| F-DISPLAY-07     | 上下文用量展示               | 已实现   | display     | skip: token 统计双路径待确认    |
| F-DISPLAY-10     | 斜杠命令列表                 | 已实现   | display     |                                 |
| F-DISPLAY-11     | 请求追踪信息                 | 已实现   | display     |                                 |
| F-DISPLAY-12     | 环境检查与 AI 后端健康检查   | 部分实现 | display     |                                 |
| F-DISPLAY-13     | 可用 AI 后端列表             | 已实现   | display     |                                 |
| F-RELIABILITY-01 | 连接超时自动处理             | 已实现   | reliability |                                 |
| F-RELIABILITY-02 | AI 回复超时自动处理          | 已实现   | reliability |                                 |
| F-RELIABILITY-04 | 启动失败友好提示             | 已实现   | reliability |                                 |
| F-RELIABILITY-05 | 本地缓存损坏自动修复         | 已实现   | reliability |                                 |
| F-RELIABILITY-06 | 多候选安装策略               | 未实现   | reliability | skip: 架构改变后可能不适用      |
| F-RELIABILITY-07 | 发送消息异常恢复             | 已实现   | reliability |                                 |
| F-SKILL-01       | AI 技能自动发现与注入        | 已实现   | skills      |                                 |
| F-SKILL-02       | 指定技能注入（高级模式）     | 已实现   | skills      |                                 |
| F-SKILL-03       | MCP 工具服务注入             | 部分实现 | skills      |                                 |

## 状态统计

| 状态     | 数量   |
| -------- | ------ |
| 已实现   | 43     |
| 部分实现 | 6      |
| 未实现   | 2      |
| **合计** | **51** |

> 注：源 PRD 中标注 57 个功能点（含 F-TEAM-_ 3 个 + F-CRON-_ 2 个 + 已合并功能点编号）。本索引仅列出 ACP 单聊范围内的独立功能点。

## skip 白名单

以下功能点或子场景在 E2E 测试中标记为 skip：

| 功能点                                 | skip 原因                        |
| -------------------------------------- | -------------------------------- |
| F-MSG-07                               | undo/redo 未实现                 |
| F-RELIABILITY-06                       | 多候选安装，架构改变后可能不适用 |
| F-PERM-01 的 30 分钟超时自动拒绝       | 未实现                           |
| F-PERM-03 的 codebuddy 差异            | 待研发确认                       |
| F-DISPLAY-07 的 token 统计双路径       | 待确认                           |
| F-SESSION-10 的 turn 完成边界          | 待确认                           |
| F-SESSION-05 的实际 5 分钟空闲触发验证 | E2E 等待成本过高                 |
| 所有首次认证流程                       | 用户跳过                         |
| 所有 Gemini 专属差异                   | 用户跳过                         |
