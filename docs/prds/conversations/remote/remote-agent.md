# 设置页 → Agents → 远端 Agents (F-RAGENT)

> 本文档覆盖「设置 → Agents → 远端 Agents」页面的全部功能，包括 Remote Agent 的列表展示、创建/编辑/删除 (CRUD)、连接测试、OpenClaw 配对握手、会话管理、消息收发与流式响应、工具调用展示、权限审批、连接状态管理。
> 基于静态代码分析和动态 UI 验证综合整理，经 DA 质疑（23 条）和 Tester 反馈（8 条）修正定稿。

---

## (F-RAGENT-01) Remote Agent 列表展示 [已实现]

**用户故事**：作为用户，我希望在远端 Agents 页面看到所有已配置的远端 Agent 列表，了解它们的名称、状态和协议类型。

**前置条件**：用户已进入「设置 → Agents → 远端 Agents」Tab

**正常流程**（用户视角）：

1. 用户打开「设置 → Agents」页面，点击「远端 Agents」Tab（URL query: `?tab=remote`）
2. 页面顶部显示说明横幅："目前只支持远程连接 OpenClaw，其他 Agent 正在开发中。" + "查看配置指南"链接
3. 右上角显示"+ 添加"按钮
4. 下方以响应式网格布局展示已配置的 Agent 卡片
   - 小屏: 1 列 (`grid-cols-1`)
   - 中屏: 2 列 (`md:grid-cols-2`)
   - 大屏: 3 列 (`xl:grid-cols-3`)
5. 每张卡片显示：
   - 居中的 Avatar（48x48px, 方形 borderRadius=12, emoji 字号 24px；无 avatar 时显示 Robot outline 图标 18px, @icon-park/react）
   - 名称（14px 加粗，最多 2 行截断 `line-clamp-2`）
   - 标签区域：连接状态标签（条件渲染）+ 协议标签（始终渲染, arcoblue）
   - URL（12px 次级文字，最多 2 行截断 `line-clamp-2`）
   - 底部操作按钮："编辑" + "删除"（红色 danger 样式）

**状态标签渲染**：

渲染条件：`agent.status` 存在且不为 `'unknown'` 时渲染标签。`status` 为 `undefined` 时同样不渲染。

颜色映射（`statusColor` 函数）：

| status 值                           | 颜色                   |
| ----------------------------------- | ---------------------- |
| `'connected'`                       | green                  |
| `'pending'`                         | orange                 |
| `'error'`                           | red                    |
| 其他（含 `'unknown'`, `undefined`） | gray（但渲染层不渲染） |

**空列表状态**：

- 居中文案提示（14px, `settings.remoteAgent.emptyTitle`）+ "添加"按钮（`settings.remoteAgent.emptyAction`）
- 无卡片渲染

**"查看配置指南"链接**：

- 点击通过 `openExternalUrl` 在系统浏览器中打开 `https://github.com/iOfficeAI/AionUi/wiki/Remote-Agent-Guide-Chinese`
- 说明横幅和弹窗内的警告 banner 中均有此链接

**异常情况**：

- 外部链接打开失败：仅 `console.error`（通过 `.catch(console.error)`），无用户提示

**验收标准**：

- [ ] Tab 切换正确，URL query parameter `?tab=remote` 双向同步
- [ ] 响应式网格在三种屏幕宽度下正确布局（1/2/3 列）
- [ ] 卡片信息完整（头像、名称、状态标签、协议标签、URL、操作按钮）
- [ ] `status` 为 `'unknown'` 或 `undefined` 时不显示状态标签
- [ ] 空列表显示引导文案（`settings.remoteAgent.emptyTitle`）和添加按钮
- [ ] "查看配置指南"链接在系统浏览器中打开目标 URL

---

## (F-RAGENT-02) 创建 Remote Agent [已实现]

**用户故事**：作为用户，我希望通过表单配置一个新的远端 Agent，填写连接信息并保存，以便后续使用该 Agent 进行对话。

**正常流程**（用户视角）：

1. 用户点击"+ 添加"按钮
2. 弹出"添加远程 Agent"弹窗（AionModal + 遮罩层）
3. 弹窗顶部显示黄色警告 banner（说明文案 + "查看配置指南"链接）
4. 用户填写表单：
   - **Avatar**：点击头像区域打开 Emoji 选择器（8 个分类 Tab），选中后立即应用。默认值 `🤖`（`\u{1F916}`，固定值非随机）
   - **名称**（必填）：Input size=large，placeholder `settings.remoteAgent.namePlaceholder`
   - **URL**（必填）：placeholder `wss://example.com/gateway`
   - **认证方式**（必填）：下拉选择，选项："无" (none) / "Bearer Token" (bearer)。默认"无"。注：类型定义支持 `'password'` 但 UI 不暴露此选项（见设计约束）
   - **认证令牌**（条件必填）：仅当认证方式为 "Bearer Token" 时显示，Input.Password（有眼睛图标切换可见性），placeholder `settings.remoteAgent.tokenPlaceholder`
   - **允许不安全连接**（条件显示）：仅当 URL 以 `wss://` 开头时显示，Switch 默认关闭，附说明 `settings.remoteAgent.allowInsecureHint`
5. 用户可选择先"测试连接"（见 F-RAGENT-05）
6. 用户点击"保存"
7. 表单验证通过后，创建配置并自动触发 OpenClaw 握手（见 F-RAGENT-06）

**内部机制 — 创建流程**：

1. 渲染进程调用 `ipcBridge.remoteAgent.create.invoke(payload)`
2. 主进程 Bridge 生成:
   - `id`: UUID
   - OpenClaw 协议: 生成 Ed25519 密钥对（`deviceId` = 公钥 SHA256 指纹, `devicePublicKey`, `devicePrivateKey`）
   - 其他协议: 无密钥生成
   - `status`: `'unknown'`
   - `createdAt` / `updatedAt`: 当前时间戳
3. 写入 SQLite `remote_agents` 表
4. 触发 `agentRegistry.refreshRemoteAgents()` 刷新检测列表（fire-and-forget）
5. 返回完整 `RemoteAgentConfig`

**协议说明**：

UI 当前不暴露协议选择器，新建 Agent 硬编码为 `'openclaw'` 协议。类型定义支持 `'openclaw' | 'zeroclaw' | 'acp'` 三种协议。编辑时从 DB 回填实际协议值。

**异常情况**：

- 表单验证失败：名称或 URL 为空时，字段下方显示红色错误文字（`settings.remoteAgent.nameRequired` / `settings.remoteAgent.urlRequired`），使用 `role="alert"` + `aria-live="assertive"`
- 创建/保存 API 失败：catch 块为空（无用户提示），finally 块恢复 saving 状态（已知局限）
- DB 写入失败：抛出异常 "Failed to create remote agent"

**验收标准**：

- [ ] 弹窗标题为"添加远程 Agent"（`settings.remoteAgent.addTitle`）
- [ ] 表单验证：名称和 URL 为必填，Bearer Token 模式下令牌为必填
- [ ] Emoji 选择器正常工作，默认头像为 `🤖`（固定值）
- [ ] 认证方式切换时，令牌字段正确显示/隐藏
- [ ] URL 为 `wss://` 时正确显示不安全连接开关
- [ ] 保存后自动触发 OpenClaw 握手流程
- [ ] 创建成功后列表自动刷新（SWR mutate）

---

## (F-RAGENT-03) 编辑 Remote Agent [已实现]

**用户故事**：作为用户，我希望修改已配置的远端 Agent 信息（名称、URL、认证等），修改后重新验证连接。

**正常流程**（用户视角）：

1. 用户点击卡片底部"编辑"按钮
2. 弹出"编辑远程 Agent"弹窗（AionModal）
3. 所有已保存数据完整回填：
   - Avatar emoji
   - 名称
   - URL
   - 认证方式（自动选中）
   - Token（密文显示）
   - 允许不安全连接（保持之前的状态）
   - 协议从 DB 回填（`setActiveProtocol(editAgent.protocol)`）
4. 用户修改字段后点击"保存"
5. 调用 `ipcBridge.remoteAgent.update.invoke({ id, updates })`
6. 对 OpenClaw 协议 Agent，编辑保存后同样触发握手流程

**内部机制 — 更新流程**：

Bridge 端逐字段映射到 DB 列名（仅更新 `updates` 中不为 `undefined` 的字段）：

| 前端字段        | DB 列名          | 说明          |
| --------------- | ---------------- | ------------- |
| `name`          | `name`           |               |
| `protocol`      | `protocol`       |               |
| `url`           | `url`            |               |
| `authType`      | `auth_type`      |               |
| `authToken`     | `auth_token`     |               |
| `avatar`        | `avatar`         |               |
| `description`   | `description`    |               |
| `allowInsecure` | `allow_insecure` | boolean → 0/1 |

**异常情况**：

- 更新 API 失败：catch 块为空（无用户提示），finally 块恢复 saving 状态（已知局限）
- Agent 已被删除：DB 返回失败，无特殊处理

**验收标准**：

- [ ] 弹窗标题为"编辑远程 Agent"（`settings.remoteAgent.editTitle`）
- [ ] 所有字段正确回填
- [ ] 修改后保存成功，列表刷新
- [ ] OpenClaw 协议 Agent 保存后触发握手流程
- [ ] 关闭弹窗方式：取消按钮 / Escape 键 / X 按钮

---

## (F-RAGENT-04) 删除 Remote Agent [已实现]

**用户故事**：作为用户，我希望删除不再需要的远端 Agent 配置。

**正常流程**（用户视角）：

1. 用户点击卡片底部"删除"按钮（红色 danger 样式）
2. 弹出确认对话框（Arco 原生 `Modal.confirm`，区别于创建/编辑使用的 AionModal 封装）：
   - 标题：`settings.remoteAgent.deleteConfirm`（"删除远程 Agent"）
   - 正文：`settings.remoteAgent.deleteConfirmContent`（"确定要删除「{agent名称}」吗？"，使用直角引号包裹名称）
   - 按钮："取消" / "确定"（确定按钮为 danger 样式）
3. 用户点击"确定"
4. 卡片立即从列表中移除
5. 显示成功 toast：`settings.remoteAgent.deleted`（"远程 Agent 已删除"）

**内部机制**：

1. 调用 `ipcBridge.remoteAgent.delete.invoke({ id })`
2. Bridge 端: `db.deleteRemoteAgent(id)`
3. 成功后: `agentRegistry.refreshRemoteAgents()`（fire-and-forget）
4. 渲染进程: SWR mutate 刷新列表

**异常情况**：

- 删除 API 失败：当前无特殊错误处理

**验收标准**：

- [ ] 删除前弹出确认对话框，包含 Agent 名称
- [ ] 确认后卡片立即从列表移除
- [ ] 删除成功显示 toast 通知（`settings.remoteAgent.deleted`）
- [ ] 确认对话框关闭后 UI 无残留元素（Modal.confirm 默认行为）

---

## (F-RAGENT-05) 连接测试 [已实现]

> 建议验证策略：WebSocket 连接通过集成测试 mock；URL 验证和 SSRF 防护通过单元测试

**用户故事**：作为用户，我希望在保存前测试远端 Agent 的连接是否可用，确认 URL 和认证信息正确。

**正常流程**（用户视角）：

1. 用户在创建/编辑弹窗中填写 URL 和认证信息
2. 点击"测试连接"按钮（全宽 outline 样式，带刷新图标）
3. 按钮进入 loading 状态（源码 `loading={testing}` prop 已传入）
4. 测试完成后显示 toast：
   - 成功：`settings.remoteAgent.testSuccess`（绿色勾号 "连接成功"）
   - 失败（result）：`settings.remoteAgent.testFailed`（红色, 参数 `{ error }`）
   - 失败（catch）：`settings.remoteAgent.testError`（红色, 参数 `{ error }`）

**内部机制**：

1. 从表单获取 `url, authType, authToken, allowInsecure`
2. URL 为空 → warning toast `settings.remoteAgent.urlRequired`，不发起测试
3. 调用 `ipcBridge.remoteAgent.testConnection.invoke({...})`
4. Bridge 端处理:
   - **URL 验证** (`validateWebSocketUrl`):
     - trim 输入
     - 无协议前缀 → 自动补 `ws://`（支持裸 `host:port` 格式如 `127.0.0.1:42617`）
     - 仅允许 `ws:` / `wss:` 协议（防 SSRF）
     - 解析失败 → 返回 `{ success: false, error: 'Invalid URL' }`
   - **WebSocket 连接**:
     - Node.js `ws` 库
     - headers: bearer 认证时添加 `Authorization: Bearer {token}`
     - 选项: `handshakeTimeout: 10_000`, `rejectUnauthorized: !allowInsecure`
     - 超时: 10 秒
     - `ws.on('open')` → `{ success: true }`
     - `ws.on('error')` → `{ success: false, error: err.message }`
     - 通过 `settled` flag 确保只 resolve 一次

**异常情况**：

- URL 为空：warning toast，不发起连接
- 非 ws/wss 协议：返回 `Unsupported protocol: {protocol}`
- 连接超时（10s）：返回 `Connection timed out (10s)`
- WebSocket 构造失败：catch 后返回错误信息
- IPC 调用异常：catch → error toast

**待验证问题**：

- 源码 `RemoteAgentManagement.tsx:398` 传了 `loading={testing}` prop，但动态分析未观察到明显 spinner 效果。需在真实窗口确认 Arco Button `type='outline'` 模式下 `loading` prop 的视觉表现。

**验收标准**：

- [ ] URL 为空时给出 warning 提示（`settings.remoteAgent.urlRequired`），不发起连接
- [ ] 仅允许 ws/wss 协议（SSRF 防护）
- [ ] 支持裸 host:port 格式（自动补 ws://）
- [ ] 10 秒超时后返回明确错误
- [ ] Bearer 认证时正确传递 Authorization header
- [ ] `allowInsecure` 正确控制 TLS 证书验证
- [ ] 成功/失败通过 toast 反馈（`settings.remoteAgent.testSuccess` / `testFailed` / `testError`）

---

## (F-RAGENT-06) OpenClaw 握手与设备认证 [已实现]

> 建议验证策略：握手协议通过集成测试 mock WebSocket；设备密钥生成通过单元测试

**用户故事**：作为用户，当我保存 OpenClaw 协议的远端 Agent 时，系统应自动与远端 Gateway 完成身份验证握手。

**前置条件**：Agent 协议为 `'openclaw'`

**正常流程**（用户视角）：

1. 用户点击"保存"后，按钮显示"握手中..."（`settings.remoteAgent.handshaking`，加载态）
2. 系统自动与远端 Gateway 进行身份验证
3. 成功：toast `settings.remoteAgent.created` 或 `settings.remoteAgent.updated`，弹窗关闭
4. 需要审批：切换到配对等待界面（见 F-RAGENT-07）
5. 失败：warning toast（"已创建/更新 — 握手失败详情"），弹窗关闭

**内部机制 — OpenClaw 握手协议**：

1. 调用 `ipcBridge.remoteAgent.handshake.invoke({ id })`
2. Bridge 端创建 `OpenClawGatewayConnection` 实例
3. **协议握手流程**:
   ```
   Client                                  Gateway
     |── WebSocket connect ───────────────>|
     |                                     |
     |  路径 A: Challenge 到达 (<750ms)    |
     |<── EVENT connect.challenge {nonce} ─|
     |── REQ connect {v2 签名, 含 nonce}  ─|
     |                                     |
     |  路径 B: Challenge 未到达(750ms超时)|
     |── REQ connect {v1 签名, 无 nonce}  ─|
     |                                     |
     |<── RES hello-ok {auth.deviceToken,  |   (成功)
     |     policy, features}               |
     |     或                              |
     |<── RES error {PAIRING_REQUIRED}    ─|   (需审批)
   ```
4. 三个回调（`onHelloOk`、`onConnectError`、`onClose`）共用同一 Promise，依赖 Promise 只能 resolve 一次的语义保证互斥

**设备认证签名**：

使用 Ed25519 私钥对管道分隔字符串签名：

- **v1 格式**（无 nonce，750ms 超时强制 connect 时）: `"v1|{deviceId}|{clientId}|{clientMode}|{role}|{scopes_csv}|{signedAtMs}|{token}"`
- **v2 格式**（有 nonce，收到 challenge 后）: `"v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes_csv}|{signedAtMs}|{token}|{nonce}"`

版本自动判定: `params.nonce ? 'v2' : 'v1'`

**Connect 请求参数**：

| 参数                          | 值                                                 |
| ----------------------------- | -------------------------------------------------- |
| `minProtocol` / `maxProtocol` | 3                                                  |
| `client.id`                   | `'gateway-client'`                                 |
| `client.displayName`          | `'AionUI'`                                         |
| `client.mode`                 | `'backend'`                                        |
| `caps`                        | `['tool-events']`（必须声明以接收 tool call 事件） |
| `role`                        | `'operator'`                                       |
| `scopes`                      | `['operator.admin']`                               |

**技术说明**: password 认证路径在 Bridge 层（`remoteAgentBridge.ts:184`）和 Connection 层（`OpenClawGatewayConnection.ts:263`）已实现，但当前 UI 不暴露 password 选项。如果通过直接修改 DB 将 `auth_type` 改为 `'password'`，握手流程会正确使用 password 认证。

**Hello-ok 处理**：

- 存储 Gateway 签发的 `deviceToken`（远程场景: 回调 `onDeviceTokenIssued` → 写入 DB `device_token` 字段）
- 更新 DB: `status = 'connected'`, `last_connected_at = Date.now()`

**PAIRING_REQUIRED 判定**: `details.recommendedNextStep === 'wait_then_retry'` 或 `/pairing.required/i`

**异常情况**：

- Gateway 不可达：WebSocket 连接失败，15 秒超时后返回错误
- Challenge 未到达：750ms 后强制发送 connect 请求（使用 v1 签名，无 nonce）
- 设备令牌无效：本地场景可清除 token 并降级；远程场景直接返回错误
- handshake 超时（15s）：`conn.stop()` + 返回 `{ status: 'error', error: 'Handshake timed out (15s)' }`
- WebSocket 意外关闭：返回 `{ status: 'error', error: 'Connection closed (code): reason' }`（若已被 onHelloOk/onConnectError resolve 则忽略）

**验收标准**：

- [ ] 保存后按钮显示"握手中..."加载态（`settings.remoteAgent.handshaking`）
- [ ] 握手成功：toast + 弹窗关闭 + 列表刷新
- [ ] 需要审批：进入配对等待界面
- [ ] 握手失败：warning toast 包含错误详情
- [ ] 设备令牌正确持久化到 DB
- [ ] 连接状态正确更新（connected / pending / error）
- [ ] 15 秒超时后正确返回错误

---

## (F-RAGENT-07) 配对等待与轮询 [已实现]

**用户故事**：作为用户，当远端 Gateway 要求设备审批时，我希望看到等待界面和倒计时，并可以随时取消。

**前置条件**：F-RAGENT-06 握手返回 `pending_approval`

**正常流程**（用户视角）：

1. 弹窗切换到等待审批界面：
   - 居中 Spinner 动画（Arco Spin, size=32）
   - 主文案：`settings.remoteAgent.pendingApproval`（"等待网关审批..."）
   - 副文案：`settings.remoteAgent.pendingApprovalHint`（"请在 OpenClaw Gateway 上批准此设备"）
   - 倒计时：`settings.remoteAgent.pendingTimeRemaining`（"剩余时间：M:SS"，从 5:00 开始）
   - 底部仅显示"取消"按钮（`settings.remoteAgent.pendingCancel`）
2. 同时，背景中 Agent 卡片已创建，状态为 `pending`（橙色标签）
3. 系统每 5 秒轮询一次 Gateway（调用 `ipcBridge.remoteAgent.handshake.invoke`）
4. Gateway 审批通过 → 握手返回 `ok` → 成功 toast（固定使用 `settings.remoteAgent.created` key，不区分创建/编辑场景，已知局限）+ 弹窗关闭
5. 5 分钟超时 → 显示超时文案（`settings.remoteAgent.pendingTimeout`，warning 样式）
6. 用户点击"取消" → 停止轮询 + 弹窗关闭（Agent 保持 pending 状态）

**倒计时机制**：

- 总时长: 300,000 ms (5 分钟)
- 更新间隔: 1 秒
- 计算方式: `remaining = max(0, PAIRING_TIMEOUT - (Date.now() - startedAt))`
- 格式化: `M:SS`（如 `4:45`）
- `remaining <= 0` → 停止所有定时器 + `pairingState = 'timeout'`

**轮询机制**：

- 间隔: 5,000 ms
- 每次调用 `handshake.invoke({ id })`
- `status === 'ok'` → 停止轮询 + success toast + 关闭弹窗
- `status === 'pending_approval'` → 继续轮询
- 异常 → 忽略（`catch {}`），继续轮询（已知局限：无错误反馈）

**取消配对行为**：

1. 清除轮询定时器和倒计时定时器
2. `pairingState = 'idle'`
3. 触发 `onSaved()` 刷新列表 + `onClose()` 关闭弹窗
4. Agent 卡片保留在列表中，状态保持 `pending`
5. 无"重试配对"独立入口（需通过编辑再保存触发）

**异常情况**：

- 轮询中 handshake 异常：完全忽略（`catch {}`），继续轮询
- 弹窗关闭后（afterClose）：停止轮询 + 重置 pairingState + 重置表单

**验收标准**：

- [ ] 等待界面正确显示 Spinner + 主副文案 + 倒计时
- [ ] 倒计时从 5:00 开始，每秒递减，格式 M:SS
- [ ] 配对期间定期轮询 Gateway（验证策略：集成测试 mock 网络请求）
- [ ] 审批通过后自动关闭弹窗并显示成功 toast（`settings.remoteAgent.created`）
- [ ] 配对超时后显示超时提示（`settings.remoteAgent.pendingTimeout`）（验证策略：单元测试 mock 时间）
- [ ] 取消后停止轮询，Agent 保持 pending 状态
- [ ] 弹窗关闭时清理所有定时器（验证策略：单元测试）

---

## (F-RAGENT-08) Remote Agent 会话创建与恢复 [已实现]

> 建议验证策略：集成测试；需 mock Gateway sessions API

**用户故事**：作为用户（或系统），当使用远端 Agent 发起对话时，系统应自动创建或恢复与 Gateway 的会话。

**正常流程**（系统视角）：

1. `RemoteAgentCore.start()` 被调用
2. emit 状态消息 `'connecting'`
3. 创建 `OpenClawGatewayConnection` 并启动
4. 等待连接建立（轮询 `isConnected`，100ms 间隔，默认参数 30 秒超时）
5. emit `'connected'`
6. 解析会话 (`resolveSession`)：
   - 有 `resumeKey` → 尝试 `sessions.resolve({ key: resumeKey })`
   - 失败或无 resumeKey → `sessions.reset({ key: conversationId, reason: 'new' })`
   - reset 失败 → 降级 `sessions.resolve({ key: conversationId })`
   - 再失败 → 直接使用 `conversationId` 作为 sessionKey
7. emit `'session_active'`
8. sessionKey 变更时通知上层持久化到 conversation extra

**会话持久化**：

- `RemoteAgentManager.saveSessionKey(sessionKey)`:
  - 读取 conversation（确认 `type === 'remote'`）
  - 更新 `conversation.extra.sessionKey`
  - 下次打开同一对话时可通过 `resumeKey` 恢复会话

**异常情况**：

- 连接超时（默认 30s）：抛出 `Remote agent connection timeout`
- sessions.resolve 失败：降级到 sessions.reset
- sessions.reset 失败：降级到 sessions.resolve
- 所有会话 API 失败：直接使用 conversationId 作为 sessionKey（已知局限：可能导致 Gateway 侧无匹配会话）

**验收标准**：

- [ ] 连接建立后自动创建/恢复会话
- [ ] 支持会话恢复（通过 sessionKey）
- [ ] 三级 fallback 机制正确执行
- [ ] sessionKey 正确持久化到 conversation extra
- [ ] 连接超时（默认 30s）返回明确错误

---

## (F-RAGENT-09) 消息发送与流式响应 [已实现]

> 建议验证策略：集成测试验证流式事件处理；E2E 需要真实 Gateway

**用户故事**：作为用户，我希望向远端 Agent 发送消息后，能实时看到流式响应内容。

**正常流程**（用户视角）：

1. 用户在对话窗口输入消息并发送
2. 页面显示连接状态提示（connecting → connected → session_active）
3. Agent 开始流式回复：文字逐字/逐段出现
4. 回复中可能穿插工具调用展示（见 F-RAGENT-10）
5. 回复完成后，对话结束

**内部机制 — 消息发送**：

1. `RemoteAgentManager.sendMessage(data)`:
   - `cronBusyGuard.setProcessing(conversationId, true)` 标记忙碌
   - 保存用户消息到 DB（非 silent 时）
   - 调用 `RemoteAgentCore.sendMessage()`
   - `cronBusyGuard.setProcessing(conversationId, false)` 在 finish 信号事件或 sendMessage 异常时触发
2. `RemoteAgentCore.sendMessage()`:
   - 检查连接状态，断开时自动重新 `start()`（已知局限：可能导致意外重连和会话重置）
   - 文件附件转换：路径含空格时用 `@"filepath"` 格式，否则 `@filepath`，多文件空格连接后追加到消息内容前
   - 调用 `connection.chatSend({ sessionKey, message, idempotencyKey: UUID })`

**内部机制 — 流式响应处理**：

Gateway 通过 `chat` / `chat.event` 事件推送响应：

- **delta 事件**：
  - 携带累积文本
  - 智能增量计算：若累积文本以已接收文本开头 → 截取增量部分
  - emit `content` 事件到渲染进程
- **final 事件**：
  - 检查是否有遗漏文本（final 中的完整文本 > 已累积文本）
  - 若无 delta 到达但有 `agentAssistantFallbackText` → 使用 fallback（agent.event assistant stream 缓存）
  - 若仍无内容 → `fetchAndEmitHistoryFallback(runId)`: 从最近 5 条消息中反向查找匹配当前 runId 的 assistant 消息（无 runId 时匹配任意 assistant 消息）
  - 触发 `handleEndTurn()`
- **aborted 事件**：触发 `handleEndTurn()`
- **error 事件**：emit 错误消息 + `handleEndTurn()`

**事件转发路径**：

```
RemoteAgentCore → RemoteAgentManager
  → ipcBridge.conversation.responseStream.emit()  → 渲染进程对话 UI
  → channelEventBus.emitAgentMessage()             → Telegram/Lark 频道
  → teamEventBus.emit('responseStream')            → 团队协作（仅 finish/error）
```

**异常情况**：

- 连接断开时发送消息：自动重连后发送
- chatSend 异常：返回 `{ success: false, error }` + emit 错误消息
- Gateway 返回 error 事件：emit 错误消息到对话界面
- history fallback 中所有消息 runId 不匹配：无 fallback 文本，直接 handleEndTurn

**验收标准**：

- [ ] 用户消息正确保存到 DB
- [ ] 流式文本逐步渲染
- [ ] 文件附件正确转换（空格路径带双引号）
- [ ] final 事件后对话状态正确结束
- [ ] error 事件显示错误消息
- [ ] 消息正确转发到频道和团队事件总线

---

## (F-RAGENT-10) 工具调用展示 [已实现]

> 建议验证策略：集成测试 mock agent event 解析

**用户故事**：作为用户，我希望看到远端 Agent 使用的工具调用过程和结果。

**正常流程**（用户视角）：

1. Agent 回复过程中，工具调用以折叠卡片形式展示
2. 卡片显示工具名称、状态（执行中/完成/失败）、参数/结果

**内部机制**：

Gateway 通过 `agent` / `agent.event` 事件推送工具调用信息：

- **stream: tool / tool_call**:
  - phase 映射: `start/update/partialResult` → `in_progress`, `result` → `completed/failed`
  - 工具名称: `toolData.name` 或 `toolData.title`，fallback 为 `"Tool Call"`
  - 工具类型推断 (`inferToolKind`): 基于子串匹配（非单词边界），对组合命名的工具可能误判（如 `'Breadcrumb'` 匹配到 `'read'`，已知局限）
    - `read/view/list/search/grep/glob/find/get/fetch` → `'read'`
    - `write/edit/create/delete/patch/update/insert/remove` → `'edit'`
    - `exec/run/bash/shell/terminal` → `'execute'`
  - 导航工具特殊处理：`NavigationInterceptor` 检测 → 提取 URL → 创建预览消息
  - 通过 `AcpAdapter.convertSessionUpdate()` 转换为 `TMessage` → emit

- **stream: thinking / thought**:
  - emit `thought` 信号事件（subject: "Thinking"）

- **stream: assistant**:
  - 缓存 `agentAssistantFallbackText`（当 chat delta 未覆盖时的后备文本）

**验收标准**：

- [ ] 工具调用状态正确映射（in_progress → completed/failed）
- [ ] 工具类型（read/edit/execute）根据名称正确推断
- [ ] 导航工具触发 URL 预览
- [ ] Thinking 过程显示为 thought 信号

---

## (F-RAGENT-11) 权限审批 [已实现]

> 建议验证策略：集成测试 mock approval request event

**用户故事**：作为用户，当远端 Agent 需要执行敏感操作时，我希望收到权限请求并可以选择允许或拒绝。

**正常流程**（用户视角）：

1. Agent 执行需要审批的操作时，对话界面弹出权限确认卡片
2. 卡片显示：
   - 工具名称
   - 操作参数
   - 三个选项：Allow / Always Allow / Reject
3. 用户选择后，UI 层处理完成
4. 70 秒无响应自动拒绝

**内部机制**：

1. Gateway 发送 `exec.approval.request` 事件
2. `handleApprovalRequest()`:
   - 在 `pendingPermissions` Map 中创建条目
   - emit `acp_permission` 信号事件到渲染进程
   - 默认选项: `allow_once / allow_always / reject_once`
   - 超时: 70 秒自动 reject
3. `RemoteAgentManager.handleSignalEvent()`:
   - 将 `acp_permission` 转换为 `IConfirmation`
   - 调用 `this.addConfirmation(confirmation)`
4. 用户选择后:
   - `confirmMessage({ confirmKey, callId })` 从 `pendingPermissions` 找到条目 → resolve

**已知局限（重要）**：当前 `pendingPermissions` Map 中存入的 `resolve` 函数为空函数 `(_response) => {}`，`confirmMessage` 调用 resolve 不产生实际效果。源码中未找到 `exec.approval.respond` 等将审批结果实际传回 Gateway 的调用。**权限审批的用户选择可能未实际传递给 Gateway**。需确认是否有其他代码路径（如 BaseAgentManager.confirm）处理了实际的 Gateway 通信。

**验收标准**：

- [ ] 权限请求正确展示工具信息和选项
- [ ] 用户选择后 UI 层正确响应
- [ ] 70 秒超时自动拒绝
- [ ] 多个并发权限请求互不干扰

---

## (F-RAGENT-12) 连接状态管理与重连 [已实现]

> 建议验证策略：集成测试 mock WebSocket 断连/重连场景

**用户故事**：作为用户，我希望系统能自动管理与远端 Gateway 的连接状态，在断连时自动重连。

**正常流程**（系统视角）：

1. 连接建立后，Gateway 定期发送 `tick` 心跳事件
2. 客户端监控 tick 间隔，超过 2 倍间隔未收到 → 判定断连
3. 断连后自动重连（指数退避策略）
4. 重连成功后恢复正常工作

**心跳监控 (Tick Watch)**：

- 默认间隔: 30,000 ms（可由 Gateway HelloOk.policy.tickIntervalMs 覆盖）
- 检测逻辑: `gap = Date.now() - lastTick > tickIntervalMs * 2` → 关闭连接 (code 4000, 'tick timeout')
- 检测 timer 间隔: `Math.max(tickIntervalMs, 1000)`
- 生命周期: `scheduleReconnect` 清理旧 tickTimer → 重连成功后 `startTickWatch`（先 clear 再 setInterval）重建 timer

**重连策略**：

- 最大重连次数: 10
- 退避策略: 初始 1s, 每次翻倍, 最大 30s (`1s → 2s → 4s → 8s → 16s → 30s → 30s → ...`)
- 重连时重置 `lastSeq`（事件序列追踪）
- 达到上限 → 触发 `onConnectError` 通知上层

**`closed` flag 互锁**：

- `stop()` 设 `closed = true` → 阻止所有后续重连（`start()` 和 `scheduleReconnect()` 均检查此 flag）
- handshake 场景: `onHelloOk` 调用 `conn.stop()` 后，`onClose` 触发的 `scheduleReconnect` 被 `closed = true` 正确阻止

**事件序列追踪**：

- 每个 event 帧可携带 `seq` 字段
- 检测到 gap (`seq > lastSeq + 1`) → 打印 warn（不做恢复，已知局限）

**连接状态更新到 DB**：

| 触发点                                        | 状态        |
| --------------------------------------------- | ----------- |
| `RemoteAgentManager.initCore()` 成功          | `connected` |
| `RemoteAgentManager.initCore()` 失败          | `error`     |
| handshake `onHelloOk`                         | `connected` |
| handshake `onConnectError` (pairing required) | `pending`   |
| handshake `onConnectError` (other)            | `error`     |

**验收标准**：

- [ ] 心跳超时（2 倍间隔未收到 tick）触发断连
- [ ] 自动重连使用指数退避策略（1s-30s）
- [ ] 最大重连次数为 10
- [ ] 重连成功后恢复正常工作（含 tick timer 重建）
- [ ] 连接状态正确同步到 DB（用于 UI 标签展示）

---

## 附录 A：IPC 通信链路

```
┌──────────────────────────────────────────────────────────────────┐
│ 渲染进程 (Renderer)                                              │
│                                                                   │
│  RemoteAgentManagement.tsx                                        │
│    ├─ useSWR → ipcBridge.remoteAgent.list.invoke()   → 列表     │
│    │                                                              │
│    └─ RemoteAgentFormModal (AionModal)                            │
│       ├─ ipcBridge.remoteAgent.create.invoke()       → 创建     │
│       ├─ ipcBridge.remoteAgent.update.invoke()       → 编辑     │
│       ├─ ipcBridge.remoteAgent.testConnection.invoke()→ 连接测试 │
│       ├─ ipcBridge.remoteAgent.handshake.invoke()    → 握手     │
│       └─ [5s 轮询] handshake.invoke()                → 配对等待 │
│                                                                   │
│  handleDelete (Modal.confirm)                                     │
│    └─ ipcBridge.remoteAgent.delete.invoke()          → 删除     │
│                                                                   │
│  对话窗口 (Chat)                                                  │
│    ├─ ipcBridge.conversation.responseStream.on()     ← 消息流   │
│    └─ confirm → RemoteAgentManager.confirm()         → 权限确认 │
└────────────────────┬─────────────────────────────────────────────┘
                     │ IPC Bridge (invoke/provider)
┌────────────────────▼─────────────────────────────────────────────┐
│ 主进程 (Main)                                                     │
│                                                                   │
│  remoteAgentBridge.ts (7 个 provider)                             │
│    ├─ list / get / create / update / delete → SQLite CRUD        │
│    ├─ testConnection → validateWebSocketUrl + WebSocket (10s)    │
│    └─ handshake → OpenClawGatewayConnection (15s)                │
│                                                                   │
│  RemoteAgentManager → RemoteAgentCore → OpenClawGatewayConnection │
│    ├─ 会话: sessions.resolve / sessions.reset                     │
│    ├─ 消息: chat.send → chat events (delta/final/error)          │
│    ├─ 工具: agent events (tool/thinking/assistant)               │
│    └─ 权限: exec.approval.request → confirm                      │
└────────────────────┬─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│ 外部依赖                                                          │
│  ├─ Remote OpenClaw Gateway (WebSocket, 协议 v3)                  │
│  ├─ SQLite Database (remote_agents 表)                            │
│  └─ AgentRegistry (检测列表同步)                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 附录 B：Toast/Alert 消息汇总

| 场景                   | 类型         | i18n Key / 文案                                           |
| ---------------------- | ------------ | --------------------------------------------------------- |
| URL 为空时测试连接     | warning      | `settings.remoteAgent.urlRequired`                        |
| 连接测试成功           | success      | `settings.remoteAgent.testSuccess`                        |
| 连接测试失败（result） | error        | `settings.remoteAgent.testFailed` (参数 `{ error }`)      |
| 连接测试异常（catch）  | error        | `settings.remoteAgent.testError` (参数 `{ error }`)       |
| 创建成功               | success      | `settings.remoteAgent.created`                            |
| 编辑成功               | success      | `settings.remoteAgent.updated`                            |
| 握手失败但已保存       | warning      | 拼接: `created`/`updated` + error                         |
| 配对成功               | success      | `settings.remoteAgent.created`（固定，不区分创建/编辑）   |
| 删除成功               | success      | `settings.remoteAgent.deleted`                            |
| 远程连接错误           | error (tips) | 直接文案 `Connection error: {msg}`（非 i18n）             |
| 远程 Agent 启动失败    | error        | 直接文案 `Failed to start remote agent: {msg}`（非 i18n） |
| 远程消息发送失败       | error        | 直接文案 `Failed to send message: {msg}`（非 i18n）       |

---

## 附录 C：超时常量汇总

| 超时              | 位置                                   | 用途                   | 备注                         |
| ----------------- | -------------------------------------- | ---------------------- | ---------------------------- |
| 5,000 ms          | UI 配对轮询间隔                        | handshake 轮询         | 常量 `PAIRING_POLL_INTERVAL` |
| 300,000 ms (5min) | UI 配对总超时                          | 配对等待上限           | 常量 `PAIRING_TIMEOUT`       |
| 10,000 ms         | Bridge testConnection                  | WebSocket 连接测试超时 | 含 handshakeTimeout          |
| 15,000 ms         | Bridge handshake                       | 握手超时               |                              |
| 30,000 ms         | RemoteAgentCore.waitForConnection      | 等待连接建立超时       | 默认参数值                   |
| 70,000 ms         | RemoteAgentCore.handleApprovalRequest  | 权限请求超时           | 硬编码                       |
| 750 ms            | OpenClawGatewayConnection.queueConnect | connect challenge 等待 |                              |
| 1s → 30s          | OpenClawGatewayConnection 重连退避     | 指数退避               | 每次翻倍                     |
| 10 次             | OpenClawGatewayConnection 最大重连     | 重连上限               |                              |
| 30,000 ms         | OpenClawGatewayConnection tick         | 默认心跳间隔           | 可由 HelloOk.policy 覆盖     |

---

## 附录 D：已知局限汇总

| #   | 功能点         | 局限描述                                                                                                                    |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | F-RAGENT-02    | 协议默认硬编码 `'openclaw'`，UI 无协议选择器。类型支持三种协议但用户无法选择                                                |
| 2   | F-RAGENT-02    | 认证方式仅 none/bearer 两个选项，缺少 password（Bridge/Connection 层已实现 password 路径，但 UI 不暴露）                    |
| 3   | F-RAGENT-02/03 | 保存时 catch 块为空（无用户提示），finally 块恢复 saving 状态                                                               |
| 4   | F-RAGENT-05    | `allowInsecure` 开关仅在 URL 以 `wss://` 开头时显示                                                                         |
| 5   | F-RAGENT-05    | 测试连接按钮 loading 状态待验证：源码传了 `loading` prop 但动态分析未观察到 spinner 效果                                    |
| 6   | F-RAGENT-07    | 配对轮询中 handshake 异常完全忽略 (`catch {}`)，用户无错误反馈                                                              |
| 7   | F-RAGENT-07    | 取消配对后无"重试配对"独立入口，需通过编辑再保存触发                                                                        |
| 8   | F-RAGENT-07    | 配对成功 toast 固定使用 `settings.remoteAgent.created` key（不区分创建/编辑场景）                                           |
| 9   | F-RAGENT-08    | `waitForConnection` 使用 100ms 轮询检测状态（busy-wait），非事件驱动                                                        |
| 10  | F-RAGENT-09    | `sendMessage` 在连接断开时自动重新 `start()`，可能导致意外重连和会话重置                                                    |
| 11  | F-RAGENT-10    | 工具类型推断基于子串匹配而非单词边界，组合命名的工具可能误判（如 'Breadcrumb' 匹配 'read'）                                 |
| 12  | F-RAGENT-11    | **权限审批的用户选择可能未实际传回 Gateway**：`pendingPermissions` 中 resolve 为空函数，未找到 `exec.approval.respond` 调用 |
| 13  | F-RAGENT-11    | 权限请求超时 70 秒硬编码，超时后自动 reject 无用户可见提示                                                                  |
| 14  | F-RAGENT-12    | 事件序列 gap 仅打印 warn，不做重新同步                                                                                      |

---

## 附录 E：设计约束

| #   | 约束                   | 说明                                                               |
| --- | ---------------------- | ------------------------------------------------------------------ |
| 1   | OpenClaw 协议版本      | 固定 v3 (`OPENCLAW_PROTOCOL_VERSION = 3`)                          |
| 2   | 设备密钥算法           | Ed25519，密钥对随 Agent 创建一次性生成                             |
| 3   | 设备认证签名格式       | 管道分隔字符串，v1（无 nonce）/ v2（含 nonce）两种版本             |
| 4   | WebSocket 最大 payload | 25MB (`maxPayload: 25 * 1024 * 1024`)                              |
| 5   | 默认 Gateway 端口      | 18789                                                              |
| 6   | 客户端标识             | `gateway-client` / backend / operator / operator.admin             |
| 7   | Capabilities           | `caps: ['tool-events']` — 必须声明以接收 tool call 事件            |
| 8   | DB 存储                | SQLite `remote_agents` 表，字段 snake_case                         |
| 9   | 数据加载               | 使用 SWR（key: `'remote-agents.list'`），支持自动重验证            |
| 10  | 弹窗组件               | 创建/编辑使用 AionModal 封装，删除确认使用 Arco 原生 Modal.confirm |

---

## 附录 F：关联模块 — OpenClaw 凭据冲突检测

> 此功能与 Remote Agent 设置页无直接 UI 交互，降级为关联模块说明。

`openclawConflictDetector.ts` 检测 OpenClaw 的 Lark/Telegram channels 是否与 AionUi Channels 使用相同凭据：

- **Lark 冲突**: 比较 `channels.feishu.accounts[*].appId` 与 AionUi appId
- **Telegram 冲突**: 比较 `channels.telegram.botToken` 与 AionUi botToken
- 配置读取路径: 环境变量 → `~/.openclaw/openclaw.json` → 遗留路径

**当前限制**：冲突检测结果通过 `console.warn` 输出，无 UI 呈现。导出的 `getConflictResolutionSteps()` 提供解决方案建议文本，但尚未集成到任何 UI 组件中。
