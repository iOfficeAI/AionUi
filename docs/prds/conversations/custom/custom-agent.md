# 设置页 → Agent 管理 → Custom Agent (F-CAGENT)

> 本文档覆盖「设置 → Agents → 本地 Agents」页面中 **Custom Agent** 相关的全部功能，包括列表展示、创建/编辑/删除/启用禁用、连接测试、Agent 自动检测机制。
> 基于静态代码分析和动态 UI 验证综合整理，经 DA 质疑和 Tester 反馈修正定稿。

---

## (F-CAGENT-01) Agent 设置页入口与 Tab 切换 [已实现]

**用户故事**：作为用户，我希望在设置中有一个统一的 Agent 管理入口，可以分别管理本地 Agent 和远端 Agent。

**正常流程**（用户视角）：

1. 用户点击左侧导航栏「AI 核心」分类下的「Agents」菜单项
2. 进入 Agent 设置页（路由 `#/settings/agent`）
3. 页面顶部显示两个 Tab：「本地 Agents」（默认激活）和「远端 Agents」
4. 点击 Tab 切换内容区域，URL 同步更新 `?tab=local` / `?tab=remote`
5. 内容区域使用滚动容器，支持长列表滚动

**异常情况**：

- URL 中 `tab` 参数非 `local`/`remote`：保持当前 Tab 选中状态不变（首次加载时为 `local`）（`AgentModalContent.tsx:22-29`——useEffect 不执行时 activeTab 保持上一次设置的值）
- 页面模式（`viewMode === 'page'`）下禁用自定义滚动，走原生滚动

**验收标准**：

- [ ] 点击「Agents」菜单进入设置页
- [ ] 默认激活「本地 Agents」Tab
- [ ] Tab 切换时 URL query param 同步更新
- [ ] 直接访问 `?tab=remote` 可定位到远端 Tab

---

## (F-CAGENT-02) Detected Agents 列表展示 [已实现]

**用户故事**：作为用户，我希望看到系统自动检测到的本地已安装 Agent CLI 工具，了解哪些 Agent 可用。

**前置条件**：系统启动时已通过 `which` 命令扫描 `POTENTIAL_ACP_CLIS` 列表

**正常流程**（用户视角）：

1. 「本地 Agents」Tab 顶部显示说明文字（i18n key: `settings.agentManagement.localAgentsDescription`），末尾有"识别自定义 Agent"链接按钮（i18n key: `settings.agentManagement.detectCustomAgent`）
2. 说明文字下方为「已检测」区域标题（i18n key: `settings.agentManagement.detected`）
3. 已检测 Agent 以卡片网格布局展示（Tailwind 响应式断点：sm 及以下 2 列、md 3 列、lg 4 列、xl 5 列）
4. 每张卡片包含：Agent Logo（40px 方形）、Agent 名称（最多 2 行截断）、"已检测"标签、"设置"按钮
5. 卡片排列顺序：Aion CLI 置顶 → Gemini CLI 次之 → 其他按检测顺序排列。若 Aion CLI / Gemini CLI 未检测到，对应位置跳过，其他 Agent 紧邻排列
6. Aion CLI 和 Gemini CLI 的"设置"按钮可用，点击分别跳转 `/settings/aionrs` 和 `/settings/gemini`
7. 其他 detected Agent 的"设置"按钮为 disabled 状态（hover 时显示 Tooltip 提示，i18n key: `settings.agentManagement.settingsDisabledHint`）

**异常情况**：

- IPC 调用 `getAvailableAgents` 失败或返回 `success === false`：列表为空，显示空状态文案（i18n key: `settings.agentManagement.localAgentsEmpty`）
- 无任何 Agent 被检测到：同上

**技术说明**：

- 数据获取：`ipcBridge.acpConversation.getAvailableAgents.invoke()` → 主进程 AgentRegistry
- 过滤逻辑（**设置页专用**）：排除 `backend === 'remote'`、`backend === 'custom'`、`isPreset === true`（`LocalAgents.tsx:30`）。注意此过滤规则与 `useDetectedAgents` hook 不同——后者仅排除 `isPreset` 和 `remote`，不排除 `custom`（详见 F-CAGENT-15）
- SWR key：`acp.agents.available.settings`
- Logo 解析优先级：扩展资产 URL → 内置 `resolveAgentLogo` 映射 → fallback emoji '🤖'

**验收标准**：

- [ ] 页面加载后显示已检测 Agent 卡片网格
- [ ] Aion CLI 和 Gemini CLI 排列在前，"设置"按钮可用
- [ ] 其他 Agent 的"设置"按钮 disabled
- [ ] 无检测结果时显示空状态文案（验证策略：单元测试——mock `getAvailableAgents` 返回空数组）
- [ ] 卡片网格响应式列数：sm 及以下 2 列、md 3 列、lg 4 列、xl 5 列

---

## (F-CAGENT-03) Custom Agent 列表展示 [已实现]

**用户故事**：作为用户，我希望看到我手动添加的自定义 Agent 列表，包括名称、命令、启用状态，以便管理。

**正常流程**（用户视角）：

1. 「已检测」区域下方为「自定义 Agents」区域（i18n key: `settings.agentManagement.customAgents`）
2. 仅当存在 custom agent 或编辑器弹窗打开时才显示该区域标题
3. 每个 custom agent 以行卡片展示，包含：
   - 左侧：Avatar 容器 32px 方形，emoji 字号 18px，有 emoji 时背景为 `color-fill-2`，无 emoji 时透明背景 + Robot 图标
   - 名称（无名称显示 "Custom Agent"）
   - 名称下方灰色小字显示 CLI 命令路径及参数（`defaultCliPath` + `acpArgs` 空格拼接），单行截断
   - 右侧：启用/禁用 Switch + 编辑按钮（EditTwo 图标）+ 删除按钮（Delete 图标，红色）
4. Switch 默认开启状态（`enabled !== false`，即 undefined 和 true 均视为开启）

**异常情况**：

- ConfigStorage 返回 null/undefined：使用空数组，不显示「自定义 Agents」区域
- 无 custom agent 且编辑器未打开：不渲染区域标题

**技术说明**：

- 数据来源：`ConfigStorage.get('acp.customAgents')` — 渲染进程本地读取
- SWR key：`acp.customAgents.settings`
- 类型：`AcpBackendConfig[]`

**验收标准**：

- [ ] 存在 custom agent 时显示行卡片列表
- [ ] 每行显示 Avatar、名称、命令路径+参数
- [ ] Switch 状态与 `enabled` 字段一致
- [ ] 无 custom agent 时不显示区域标题

---

## (F-CAGENT-04) 创建 Custom Agent [已实现]

**用户故事**：作为用户，我希望通过表单添加一个新的自定义 Agent，配置其 CLI 命令和参数后保存使用。

**正常流程**（用户视角）：

1. 用户点击顶部说明文字中的"识别自定义 Agent"链接按钮
2. 弹出 Modal 对话框，标题为 `settings.agentManagement.detectCustomAgent`（中文参考：识别自定义 Agent），右上角有关闭按钮
3. 弹窗内显示 InlineAgentEditor 表单（新建模式，所有字段为空/默认值）：
   - Avatar：默认 '🤖'，点击弹出 EmojiPicker
   - 显示名称：空，placeholder `settings.agentNamePlaceholder`（中文参考：请输入代理名称）
   - 命令：空，placeholder `settings.commandPlaceholder`（中文参考：例如 my-agent 或 /usr/local/bin/my-agent）
   - 参数：空，placeholder `settings.argsPlaceholder`（中文参考：例如 --acp --verbose）
   - 环境变量：空列表 + "添加变量"按钮
   - 测试连接按钮（disabled，需填入命令才启用）
   - 高级 (JSON) 折叠面板（默认收起）
   - 底部：取消 + 保存（disabled，需填入名称和命令才启用）
4. 用户填写表单并点击"保存"
5. 系统生成 uuid 作为 agent id，构建 `AcpBackendConfig` 对象
6. 写入 `ConfigStorage('acp.customAgents')`，追加到列表末尾
7. 弹窗关闭，列表刷新显示新 agent

**异常情况**：

- 用户可通过右上角关闭按钮、编辑器内取消按钮、或点击遮罩层（AionModal 默认行为）关闭弹窗，均不保存数据
- ConfigStorage 写入失败：无 try-catch，异常 bubble up，弹窗可能未关闭（已知局限）

**验收标准**：

- [ ] 点击"识别自定义 Agent"打开创建弹窗
- [ ] 弹窗标题为 `settings.agentManagement.detectCustomAgent`
- [ ] 表单字段全部为空/默认值
- [ ] 名称和命令均填写后"保存"按钮启用（`InlineAgentEditor.tsx:221`）
- [ ] 保存后弹窗关闭，列表中出现新 agent
- [ ] 取消/关闭/点击遮罩层不保存数据

---

## (F-CAGENT-05) 编辑 Custom Agent [已实现]

**用户故事**：作为用户，我希望修改已有 custom agent 的配置（如名称、命令、参数等）。

**正常流程**（用户视角）：

1. 用户点击 custom agent 行卡片上的编辑图标按钮
2. 弹出 Modal 对话框，标题为 `settings.agentManagement.editCustomAgent`（中文参考：编辑自定义 Agent）
3. 表单预填现有 agent 数据：
   - Avatar：当前 emoji（或 fallback '🤖'）
   - 显示名称：当前名称
   - 命令：当前 `defaultCliPath`
   - 参数：当前 `acpArgs` 以空格拼接
   - 环境变量：当前 `env` 对象转为 key-value 列表
4. 高级 JSON 编辑器默认收起（`InlineAgentEditor.tsx:131`——`setShowAdvanced(false)` 在 agent effect 中执行）
5. 测试状态重置为 idle
6. 用户修改字段后点击"保存"
7. 系统按 id 查找并替换原有配置，写回 ConfigStorage
8. 弹窗关闭，列表刷新

**异常情况**：

- `agent.acpArgs` 为 undefined：参数字段显示为空
- `agent.env` 为 undefined 或空对象：环境变量列表为空

**验收标准**：

- [ ] 点击编辑图标打开编辑弹窗
- [ ] 弹窗标题为 `settings.agentManagement.editCustomAgent`
- [ ] 表单预填现有数据
- [ ] 修改后保存成功，列表反映变更
- [ ] 保存时保留原有 id 和 enabled 状态

---

## (F-CAGENT-06) InlineAgentEditor 表单 — Avatar 选择 [已实现]

**用户故事**：作为用户，我希望为自定义 Agent 选择一个 emoji 头像，以便在列表中快速识别。

**正常流程**（用户视角）：

1. 表单左上角显示方形 Avatar（48px，圆角 12px）
2. 点击 Avatar 弹出 EmojiPicker
3. EmojiPicker 显示分类标签（当前默认分类，由 EmojiPicker 组件决定，可能随组件版本变化）
4. 选择 emoji 后立即更新 Avatar 显示
5. 默认 Avatar 为 '🤖'

**异常情况**：无

**验收标准**：

- [ ] 点击 Avatar 弹出 EmojiPicker
- [ ] 选择 emoji 后立即更新显示
- [ ] 默认值为 '🤖'

---

## (F-CAGENT-07) InlineAgentEditor 表单 — 名称与命令输入 [已实现]

**用户故事**：作为用户，我希望输入自定义 Agent 的名称和 CLI 命令，这是配置 Agent 的最基本信息。

**正常流程**（用户视角）：

1. **显示名称**字段：
   - 标签：`settings.agentDisplayName`（中文参考：显示名称）
   - Input size=large，placeholder `settings.agentNamePlaceholder`
   - 影响保存按钮状态
2. **命令**字段：
   - 标签：`settings.commandLabel`（中文参考：命令）
   - Input size=large，placeholder `settings.commandPlaceholder`
   - 下方帮助文案：`settings.commandHelp`（中文参考：运行 agent CLI 的可执行命令）
   - 影响保存按钮和测试连接按钮状态

**按钮禁用逻辑**（`InlineAgentEditor.tsx:221-222`）：

| 条件                  | 保存按钮    | 测试连接按钮 |
| --------------------- | ----------- | ------------ |
| 名称为空 AND 命令为空 | disabled    | disabled     |
| 名称有值 AND 命令为空 | disabled    | disabled     |
| 名称为空 AND 命令有值 | disabled    | enabled      |
| 名称有值 AND 命令有值 | **enabled** | enabled      |

**异常情况**：

- 无最大长度限制（名称和命令均无）

**验收标准**：

- [ ] 名称和命令字段均有明确标签和 placeholder
- [ ] 命令字段有帮助文案
- [ ] 名称和命令均填写后保存按钮启用
- [ ] 仅命令填写后测试连接按钮启用，但保存按钮仍为 disabled
- [ ] E2E 应显式验证：仅填命令时保存按钮仍为 disabled

---

## (F-CAGENT-08) InlineAgentEditor 表单 — 参数输入 [已实现]

**用户故事**：作为用户，我希望为 CLI 命令配置额外的启动参数（如 `--acp`、`--verbose`）。

**正常流程**（用户视角）：

1. 标签：`settings.argsLabel`（中文参考：参数）
2. Input size=large，placeholder `settings.argsPlaceholder`（中文参考：例如 --acp --verbose）
3. 下方帮助文案：`settings.argsHelp`（中文参考：传递给命令的空格分隔参数）
4. 用户输入空格分隔的参数字符串
5. 支持引号包裹（单引号/双引号）包含空格的参数

**解析规则**（`parseArgsString`，`InlineAgentEditor.tsx:34-59`）：

- 空格分隔 token
- 单/双引号内的空格不分割
- 引号不保留在结果中
- 未闭合引号：当前 token 照常推入（不报错不提示）

**异常情况**：

- 输入为空：提交时 `acpArgs` 设为 `undefined`（不传空数组）
- 未闭合引号：静默处理，可能导致参数解析不符合用户预期

**验收标准**：

- [ ] 参数字段有标签、placeholder 和帮助文案
- [ ] 空格分隔的参数正确解析为数组
- [ ] 引号包裹的参数作为整体保留

---

## (F-CAGENT-09) InlineAgentEditor 表单 — 环境变量管理 [已实现]

**用户故事**：作为用户，我希望为 Agent CLI 进程配置自定义环境变量（如 API Key、DEBUG 开关等）。

**正常流程**（用户视角）：

1. 标签：`settings.envLabel`（中文参考：环境变量）
2. 初始为空列表
3. 用户点击"添加变量"按钮（`settings.addEnvVar`），底部追加一行：Key 输入框 + Value 输入框 + 删除按钮
4. 布局：三列网格（Key 1fr, Value 1.4fr, 删除按钮 auto）
5. 用户填写 Key 和 Value
6. 可继续添加多行
7. 点击行末删除按钮移除该行

**异常情况**：

- Key 为空（仅空格）的行：提交时被跳过，不写入配置
- 多行同名 Key：后面的覆盖前面的（Record 语义）
- 无 Key/Value 格式校验、无数量限制
- 提交时所有 Key 为空：`env` 设为 `undefined`（不传空对象）

**验收标准**：

- [ ] "添加变量"按钮可追加 Key-Value 行
- [ ] 每行的删除按钮可移除该行
- [ ] Key 和 Value 输入框可编辑
- [ ] Key 为空的行提交时被忽略

---

## (F-CAGENT-10) 高级 JSON 编辑器 [已实现]

**用户故事**：作为高级用户，我希望直接编辑 Agent 配置的 JSON 源码，方便批量修改或精确控制配置。

**正常流程**（用户视角）：

1. 表单底部有可折叠面板"高级 (JSON)"（i18n key: `settings.advancedMode`），创建和编辑模式下均默认收起（`InlineAgentEditor.tsx:131`——`setShowAdvanced(false)`）
2. 点击展开后显示 CodeMirror JSON 编辑器（高度 200px）
3. 编辑器内容为当前表单数据的 JSON 表示：
   ```json
   {
     "name": "TestAgent",
     "defaultCliPath": "bun",
     "enabled": true,
     "acpArgs": ["run", ".../agent.ts", "acp"],
     "env": {}
   }
   ```
4. JSON 语法高亮、行号显示、代码折叠
5. **双向同步**：
   - 修改表单字段 → JSON 编辑器自动更新
   - 修改 JSON → 表单字段实时同步（name, defaultCliPath, acpArgs, env）
6. `avatar` 字段不在 JSON 中——Emoji 头像仅通过 EmojiPicker 设置

**异常情况**：

- JSON 格式错误：编辑器边框变红，下方显示 "Invalid JSON" 错误提示（此文案为硬编码，未做 i18n）
- JSON 中的 `enabled` 字段完全不被 handleSubmit 读取（`InlineAgentEditor.tsx:214`——`enabled: agent?.enabled !== false`）。新建时 enabled 固定为 `true`（`undefined !== false` → `true`）；编辑时保留 props 传入的原值
- JSON 中添加额外字段：不被表单消费，且保存时会被丢弃（handleSubmit 重新构建对象，仅包含表单字段——详见附录 D）
- JSON 编辑后 500ms 内修改表单字段：JSON 编辑器可能短暂保持旧值（`isJsonEditingRef` 竞争窗口）

**技术说明**：

- 同步方向由 `isJsonEditingRef` 控制：JSON 编辑后 500ms（setTimeout）自动切回表单主导

**验收标准**：

- [ ] 折叠面板可展开/收起，创建和编辑模式下均默认收起
- [ ] JSON 内容与表单数据保持同步（双向）
- [ ] JSON 格式错误时显示红色边框和错误提示
- [ ] 修改 JSON 中的 name/defaultCliPath/acpArgs/env 后表单相应更新

---

## (F-CAGENT-11) 连接测试 [已实现]

> 建议验证策略：Step 1 CLI 检测可通过单元测试覆盖；Step 2 ACP 连接通过集成测试（mock ProcessAcpClient）；E2E 验证 UI 状态切换（有 fake agent 可触发三种结果）

**用户故事**：作为用户，我希望在保存前测试 Agent 的连接是否正常，确认 CLI 命令可用且 ACP 协议能正常工作。

**前置条件**：命令字段已填写（非空）

**正常流程**（用户视角）：

1. 用户点击"测试连接"按钮（全宽 outline 样式，i18n key: `settings.testConnectionBtn`）
2. 按钮变为 loading 态（旋转动画 + `settings.testConnectionTesting` 文案）
3. 后端执行两步检测：
   - **Step 1 — CLI 检测**：使用 `which`（macOS/Linux）或 `where`（Windows）检查 `command.split(' ')[0]` 是否存在（超时 5 秒，`execFileSync` + `timeout: 5000`）
   - **Step 2 — ACP 连接**：通过 `ProcessAcpClient.start()` 启动并连接 CLI 进程（内部包含进程 spawn 和 ACP 协议初始化），成功后调用 `client.close()` 清理
4. 结果以 Alert 显示在按钮下方（`role="alert"` + `aria-live="assertive"`）：

| 结果           | Alert 类型      | 图标     | i18n Key                         | 当前中文参考                            |
| -------------- | --------------- | -------- | -------------------------------- | --------------------------------------- |
| 成功           | success（绿色） | CheckOne | `settings.testConnectionSuccess` | 连接成功！CLI 存在且 ACP 协议正常工作。 |
| CLI 未找到     | error（红色）   | CloseOne | `settings.testConnectionFailCli` | 未找到命令。请确保已安装并在 PATH 中。  |
| ACP 初始化失败 | warning（黄色） | CloseOne | `settings.testConnectionFailAcp` | 找到 CLI 但 ACP 初始化失败。            |

5. 测试完成后可再次点击重新测试

**异常情况**：

- 测试进行中关闭弹窗：后台进程不会被取消（已知局限：无取消机制。非 bug，为设计约束）
- ACP 连接步骤（Step 2）无超时机制：如果 CLI 进程 hang，测试可能永远不返回（已知局限）
- IPC 调用本身抛出异常时（如 IPC 通道断开，非后端正常错误返回）：统一显示为 fail_cli（`InlineAgentEditor.tsx:201-203`）
- 每次打开编辑器或切换 agent 时，测试状态重置为 idle

**技术说明**：

- IPC 链路：`acpConversation.testCustomAgent.invoke({ command, acpArgs?, env? })` → 主进程 `testCustomAgentConnection()`
- Step 1 使用 `execFileSync`（同步阻塞），timeout 5000ms
- Step 2 使用 `ProcessAcpClient` + `spawnGenericBackend('custom', ...)`，工作目录为 `os.tmpdir()`
- 测试仅验证可连接性，不验证功能完整性

**验收标准**：

- [ ] 命令为空时测试按钮 disabled
- [ ] 点击测试后显示 loading 状态
- [ ] 三种测试结果分别显示对应的 Alert（颜色、图标、i18n 文案）
- [ ] 测试成功后可重新测试
- [ ] CLI 不存在时在 5 秒（Step 1 超时限制）内返回 fail_cli 结果

---

## (F-CAGENT-12) 保存 Custom Agent [已实现]

**用户故事**：作为用户，我希望保存自定义 Agent 配置后立即在列表中看到更新。

**正常流程**（用户视角）：

1. 用户在表单中填写/修改完毕，点击"保存"按钮（i18n key: `common.save`）
2. 系统构建 `AcpBackendConfig` 对象：
   - 新建时 `id = uuid()`，编辑时保留原 `id`
   - `enabled`：新建时固定为 `true`；编辑时保留 props 传入的原值（`agent?.enabled !== false`）
   - `acpArgs`：解析参数字符串，为空则 `undefined`
   - `env`：转换 key-value 列表，为空则 `undefined`
3. 从 ConfigStorage 读取最新列表（非 SWR 缓存，避免并发问题）
4. 按 id 查找：存在则替换（更新），不存在则追加（创建）
5. 写回 ConfigStorage
6. 触发 SWR mutate 刷新列表
7. 弹窗关闭，表单状态清空

**异常情况**：

- ConfigStorage 读写失败：无 try-catch，异常 bubble up（弹窗可能不关闭）
- 无重名校验（允许多个同名 agent）
- 无命令重复校验

**技术说明**：

- handleSubmit（`InlineAgentEditor.tsx:206-219`）重新构建 `AcpBackendConfig` 对象，仅包含表单暴露的 5 个字段（name, avatar, defaultCliPath, acpArgs, env）+ id + enabled。JSON 高级编辑器中手动添加的额外字段会被丢弃——详见附录 D

**验收标准**：

- [ ] 新建保存后列表追加新 agent
- [ ] 编辑保存后列表反映修改
- [ ] 保存后弹窗自动关闭
- [ ] 编辑保存时保留原 id 和 enabled 状态

---

## (F-CAGENT-13) 删除 Custom Agent [已实现]

**用户故事**：作为用户，我希望删除不再需要的自定义 Agent。

**正常流程**（用户视角）：

1. 用户点击 custom agent 行卡片右侧的删除按钮（红色 Delete 图标）
2. **无确认对话框** — 直接执行删除
3. 从 ConfigStorage 读取列表，按 id 过滤掉目标 agent，写回
4. SWR 刷新，列表中该 agent 立即消失

**异常情况**：

- 操作不可撤销，无 undo 机制
- ConfigStorage 读写失败：无 try-catch
- 删除正在对话中使用的 agent：可能导致该对话异常（需进一步验证）

**已知局限**：

- 缺少删除确认对话框是一个 UX 风险，用户可能误触删除

**验收标准**：

- [ ] 点击删除按钮后 agent 立即从列表消失（无确认弹窗）
- [ ] 删除后 ConfigStorage 中不再包含该 agent
- [ ] 删除是不可恢复操作

---

## (F-CAGENT-14) 启用/禁用 Custom Agent [已实现]

**用户故事**：作为用户，我希望临时禁用某个自定义 Agent 而不删除它，需要时再启用。

**正常流程**（用户视角）：

1. 每个 custom agent 行卡片右侧有 Switch 开关（size=small）
2. 默认为开启状态（`enabled !== false`）
3. 用户切换 Switch：
   - Switch `onChange` 回调传入切换后的目标 `enabled` 值（非取反逻辑），直接写入 ConfigStorage
   - 从 ConfigStorage 读取最新列表，按 id 更新目标 agent 的 `enabled` 字段
   - 写回 ConfigStorage，SWR 刷新
4. 禁用后 agent 仍在列表中显示，仅 Switch 为关闭态

**异常情况**：

- 如果 id 在列表中不存在（极端情况）：安全检查 `updatedAgents.some()` 阻止写入
- 禁用后对 agent 可用性的影响：`useCustomAgentsLoader` 通过 `availableCustomAgentIds` 过滤，禁用的 agent 不会出现在对话选择中

**验收标准**：

- [ ] Switch 切换后立即更新 enabled 状态
- [ ] 禁用的 agent 仍在列表中显示
- [ ] 禁用的 agent 不出现在对话选择的 agent 列表中
- [ ] 无额外确认步骤

---

## (F-CAGENT-15) Agent 自动检测机制 [已实现]

> 建议验证策略：检测逻辑为后端实现，E2E 仅验证已检测列表的显示结果

**用户故事**：作为用户，我希望系统能自动检测本地安装的 Agent CLI 工具，无需手动配置即可使用。

**正常流程**（用户视角）：

1. 系统启动时自动扫描已知 ACP CLI 工具列表
2. 对每个候选 CLI 执行 `which` 命令检测是否安装
3. 检测结果以 `DetectedAgent` 类型返回，包含 kind-specific 字段
4. 用户在设置页看到已检测 Agent 的卡片列表
5. `useDetectedAgents` hook 提供 `refreshAgentDetection()` 方法可触发重新扫描

**检测范围**：

- 所有在 `ACP_BACKENDS_ALL` 中 `enabled=true` 且有 `cliCommand` 的后端（排除 `custom`）
- 执行引擎层分类（`DetectedAgentKind`，`detectedAgent.ts:27`）：`gemini`、`acp`、`remote`、`aionrs`、`openclaw-gateway`、`nanobot`。注意此类型与 ACP 协议层分类 `AcpBackendAll`（18 种 ACP 后端）是不同维度——DetectedAgentKind 区分执行引擎/通信协议，AcpBackendAll 区分具体 ACP CLI 产品

**过滤规则差异**：

- 设置页 `LocalAgents.tsx:30`：排除 remote + custom + preset
- `useDetectedAgents.ts:26`：仅排除 preset + remote（不排除 custom）——此 hook 用于后端选择器（如 AssistantEditDrawer），需要包含 custom 类型

**异常情况**：

- IPC 调用失败：返回空数组（`fetchDetectedAgents` catch → []）
- `refreshCustomAgents.invoke()` 失败：静默忽略

**技术说明**：

- `POTENTIAL_ACP_CLIS` 使用 Proxy 延迟初始化，从 `ACP_BACKENDS_ALL` 自动生成，避免数据冗余和循环依赖
- Custom agent 走不同的数据通路（ConfigStorage），不参与自动检测

**验收标准**：

- [ ] 系统启动后自动显示已检测的 Agent
- [ ] 刷新检测后列表更新（验证策略：内部行为，由 SWR revalidation 自动触发；手动触发场景建议通过单元测试覆盖）
- [ ] Custom agent 不出现在 detected 列表中

---

## (F-CAGENT-16) Custom Agent 数据加载（GuidPage 场景）[已实现]

> 建议验证策略：合并逻辑通过 React Testing Library mock ConfigStorage 和 IPC 覆盖；E2E 仅验证最终显示结果

**用户故事**：作为用户，我希望在新建对话选择 Agent 时看到所有可用的 custom agent，包括预设助手和扩展贡献的 agent。

**正常流程**（用户视角）：

1. 用户进入 GuidPage（引导页/对话选择页）
2. 系统加载并合并三个数据源：
   - 预设助手（`ConfigStorage('assistants')` 中 `isPreset === true`）
   - 用户自定义 agent（`ConfigStorage('acp.customAgents')` 中被 `availableCustomAgentIds` 过滤的条目）
   - 扩展贡献的助手（`ipcBridge.extensions.getAssistants.invoke()`，去重——已有 id 跳过）
3. 返回合并后的列表及 `customAgentAvatarMap`（id → avatar 映射）

**异常情况**：

- `extensions.getAssistants.invoke()` 失败：catch → 空数组，不影响其他数据
- `loadCustomAgents` 整体失败：`console.error`，不影响应用其他功能

**技术说明（两次加载机制）**：

`useCustomAgentsLoader` 内部有两个独立的 useEffect：

1. **Initial load**（`useCustomAgentsLoader.ts:73-75`）：仅读 ConfigStorage + extensions，触发条件为 `loadCustomAgents` 引用变化
2. **Refresh**（`useCustomAgentsLoader.ts:88-90`）：调用 IPC `refreshCustomAgents.invoke()` → SWR mutate(`DETECTED_AGENTS_SWR_KEY`) → 重新读 ConfigStorage。触发条件为 `refreshCustomAgents` 引用变化

两次加载可能导致列表短暂闪烁（已知局限）。

**验收标准**：

- [ ] GuidPage 显示可用的 custom agent
- [ ] 预设助手、用户自定义和扩展贡献正确合并（验证策略：单元测试）
- [ ] 扩展贡献的 agent 去重（验证策略：单元测试）
- [ ] 仅显示后端确认可用的 custom agent

---

## 附录 A：IPC 通信链路

```
┌──────────────────────────────────────────────────────────────────┐
│ 渲染进程 (Renderer)                                               │
│                                                                   │
│  LocalAgents                                                      │
│    ├─ ConfigStorage.get('acp.customAgents')      → 本地读取       │
│    ├─ ConfigStorage.set('acp.customAgents', [...])→ 本地写入       │
│    └─ ipcBridge.acpConversation                                   │
│         .getAvailableAgents.invoke()             → IPC invoke     │
│                                                                   │
│  InlineAgentEditor                                                │
│    └─ acpConversation                                             │
│         .testCustomAgent.invoke({...})           → IPC invoke     │
│                                                                   │
│  useDetectedAgents                                                │
│    ├─ acpConversation.getAvailableAgents.invoke() → IPC invoke    │
│    └─ acpConversation.refreshCustomAgents.invoke()→ IPC invoke    │
│                                                                   │
│  useCustomAgentsLoader                                            │
│    ├─ ConfigStorage.get('assistants')             → 本地读取      │
│    ├─ ConfigStorage.get('acp.customAgents')       → 本地读取      │
│    ├─ extensions.getAssistants.invoke()           → IPC invoke    │
│    └─ acpConversation.refreshCustomAgents.invoke()→ IPC invoke    │
└────────────────────────┬─────────────────────────────────────────┘
                         │ IPC Bridge
┌────────────────────────▼─────────────────────────────────────────┐
│ 主进程 (Main)                                                     │
│                                                                   │
│  testCustomAgentConnection.ts                                     │
│    ├─ Step 1: execFileSync('which'/'where', [baseCmd]) — 5s 超时  │
│    └─ Step 2: ProcessAcpClient.start() → spawn + ACP init        │
│                                                                   │
│  AgentRegistry (getAvailableAgents provider)                      │
│    └─ 扫描 POTENTIAL_ACP_CLIS + ConfigStorage custom agents       │
│                                                                   │
│  refreshCustomAgents provider                                     │
│    └─ 重新扫描并更新 agent 可用性                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 附录 B：Toast / Alert 消息汇总

> 以 i18n key 为权威列，中文文案为当前参考（以 i18n 翻译文件为准）

| 场景           | 组件            | 类型 | i18n Key                         | 当前中文参考                            |
| -------------- | --------------- | ---- | -------------------------------- | --------------------------------------- |
| 连接测试成功   | Alert (success) | 绿色 | `settings.testConnectionSuccess` | 连接成功！CLI 存在且 ACP 协议正常工作。 |
| CLI 检测失败   | Alert (error)   | 红色 | `settings.testConnectionFailCli` | 未找到命令。请确保已安装并在 PATH 中。  |
| ACP 初始化失败 | Alert (warning) | 黄色 | `settings.testConnectionFailAcp` | 找到 CLI 但 ACP 初始化失败。            |
| JSON 解析失败  | 内联文本        | 红色 | **硬编码**                       | "Invalid JSON"（未 i18n）               |

---

## 附录 C：已知局限汇总

| #   | 功能点      | 局限描述                                                              |
| --- | ----------- | --------------------------------------------------------------------- |
| 1   | F-CAGENT-13 | 删除无确认对话框，不可撤销，存在误操作风险                            |
| 2   | F-CAGENT-11 | ACP 连接步骤（Step 2）无超时机制，CLI 进程 hang 时测试永远不返回      |
| 3   | F-CAGENT-11 | 测试进行中关闭弹窗，后台进程不会被取消（设计约束，非 bug）            |
| 4   | F-CAGENT-10 | "Invalid JSON" 错误信息未 i18n                                        |
| 5   | F-CAGENT-10 | handleSubmit 重建对象时丢弃 JSON 高级编辑器中的额外字段（详见附录 D） |
| 6   | F-CAGENT-12 | ConfigStorage 读写操作无 try-catch，失败时弹窗可能异常                |
| 7   | F-CAGENT-07 | 名称和命令字段无最大长度限制                                          |
| 8   | F-CAGENT-09 | 环境变量无数量限制，无 Key/Value 格式校验                             |
| 9   | F-CAGENT-08 | 未闭合引号静默处理，可能导致参数解析不符合用户预期                    |
| 10  | F-CAGENT-16 | useEffect 双重加载（initial + refresh）可能导致列表短暂闪烁           |

---

## 附录 D：设计约束

### D-1: Custom Agent 编辑器字段覆盖范围

`AcpBackendConfig` 接口（`acpTypes.ts:124-302`）包含 30+ 字段，但 Custom Agent 编辑器（InlineAgentEditor）仅暴露以下 5 个字段供用户配置：

| 表单字段 | AcpBackendConfig 字段 | 说明                                           |
| -------- | --------------------- | ---------------------------------------------- |
| 显示名称 | `name`                | 必填                                           |
| Avatar   | `avatar`              | emoji，仅通过 EmojiPicker 设置（不在 JSON 中） |
| 命令     | `defaultCliPath`      | 必填                                           |
| 参数     | `acpArgs`             | 可选，空格分隔解析为数组                       |
| 环境变量 | `env`                 | 可选，key-value 对                             |

以下字段由系统自动管理，不在编辑器中暴露：

- `id`：新建时自动生成 uuid，编辑时保留原值
- `enabled`：通过列表中的 Switch 控制

其余 AcpBackendConfig 字段（如 `authRequired`, `supportsStreaming`, `skillsDirs`, `isPreset`, `context`, `models`, `enabledSkills` 等）对 custom agent 不适用或不可配置。如果用户通过 JSON 高级编辑器手动添加这些字段，handleSubmit 会丢弃它们（重新构建对象仅包含上述字段）。

### D-2: Agent Hub 入口（仅开发环境）

`LocalAgents.tsx:104-132` 包含一个 Agent Hub 市场入口横幅，仅在 `process.env.NODE_ENV === 'development'` 时渲染。生产环境用户不可见。该功能为开发中的 Agent 市场预留入口，不属于当前正式功能范围。
