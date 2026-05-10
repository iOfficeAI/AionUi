# 设置页 → 远程连接 — WebUI 服务 (F-WEBUI)

> 本文档覆盖「设置 → 远程连接」页面 **WebUI Tab** 的全部功能，包括服务启停、远程访问控制、认证管理、QR 码登录、配置持久化、页面结构、状态同步、扩展系统 WebUI 贡献。
> 基于静态代码分析和动态 UI 验证综合整理。
>
> Channels Tab 相关内容见 [channels.md](../channels/channels.md)。

---

## (F-WEBUI-01) WebUI 服务启停 [已实现]

**用户故事**：作为桌面端用户，我希望通过一个开关快速启用或禁用 WebUI 服务，以便在需要时通过浏览器远程访问 AionUi。

**前置条件**：运行在 Electron 桌面端（`isElectronDesktop() === true`）

**正常流程**（用户视角）：

1. 用户进入「设置 → 远程连接」页面，默认选中 "WebUI" Tab
2. 页面显示 WebUI 服务卡片，卡片内第一行为"启用 WebUI"，右侧有 Switch 开关
3. 用户打开开关（OFF → ON）
4. 开关显示 loading 旋转，旁边出现橙色"启动中..."文字
5. 启动成功后：开关变为蓝色 checked 状态，旁边显示绿色"✓ 运行中"，toast 提示"WebUI 启动成功"
6. 下方出现"访问地址"行（见 F-WEBUI-03）
7. 如为首次启动且有初始密码，密码行显示明文（见 F-WEBUI-06）
8. 用户关闭开关（ON → OFF）
9. 访问地址行和 QR 码区域消失，toast 提示"WebUI 已停止"

**异常情况**：

- 启动 IPC 调用失败（网络错误/主进程异常）：Switch 回滚到关闭状态，toast 提示"操作失败"（`settings.webui.operationFailed`）
- 启动 IPC 超时（3 秒未返回）：UI 乐观地认为服务已启动，显示为运行中，**同时持久化 enabled=true**（已知局限：可能导致 UI 与实际状态不一致，且下次启动时循环恢复失败服务）
- 端口被占用：服务器自动尝试下一个端口（`port + 1`），递增上限固定为 `DEFAULT_PORT + 10`（默认端口：生产 25808，开发 25809，上限 25818/25819）；当用户通过 CLI/环境变量指定端口超出此范围时，不触发递增，直接报错
- 停止操作为 fire-and-forget 模式：UI 和 ConfigStorage 先行更新为停止状态 → toast 提示"WebUI 已停止"（`settings.webui.stopSuccess`）→ 然后才异步调用 `webui.stop.invoke()`。**Toast 出现时服务器可能仍在运行**
- 服务器已在运行时再次收到启动请求：先停止旧实例（关闭所有 WebSocket 连接、释放端口），再启动新实例

**验收标准**：

- [ ] Switch 开关可切换 WebUI 服务启停
- [ ] 启动过程显示 loading 状态 + "启动中…" 文字（以 i18n `settings.webui.starting` 实际值为准）
- [ ] 启动成功后显示绿色"✓ 运行中"标记
- [ ] 启动/停止成功各有对应 toast 提示（`settings.webui.startSuccess` / `settings.webui.stopSuccess`）
- [ ] 启动失败时 Switch 回滚到关闭状态 + toast 提示（`settings.webui.operationFailed`）
- [ ] 端口被占用时自动递增，上限固定为 `DEFAULT_PORT + 10`

---

## (F-WEBUI-02) 启动恢复与配置持久化 [已实现]

**用户故事**：作为用户，我希望启用 WebUI 后下次打开应用时能自动恢复服务，无需每次手动开启。

**正常流程**（用户视角）：

1. 用户启用 WebUI 服务（F-WEBUI-01）
2. 系统在启动成功后将 `webui.desktop.enabled = true` 写入 ConfigStorage
3. 用户关闭并重新打开应用
4. 应用在后台自动启动 WebUI 服务（非阻塞，不影响应用启动速度）
5. 进入设置页面时显示为已启动状态

**配置来源**：

端口解析（覆盖式优先级）：CLI 参数（`--port` / `--webui-port`）> 环境变量（`AIONUI_PORT` / `PORT`）> 配置文件（`userData/webui.config.json`）> 默认值（25808/25809）

远程访问（多源 OR 聚合 — 只要任一来源为 true 即启用）：`isRemoteMode` || 环境变量（`AIONUI_ALLOW_REMOTE` / `AIONUI_REMOTE` / `AIONUI_HOST=0.0.0.0`）|| 配置文件（`allowRemote: true`）|| ConfigStorage 偏好

**两种启动路径的配置差异**：

| 启动路径       | 端口解析                                                | 远程访问解析                               |
| -------------- | ------------------------------------------------------- | ------------------------------------------ |
| CLI/服务器模式 | 经过 `resolveWebUIPort`（CLI > env > config > default） | 经过 `resolveRemoteAccess`（多源 OR 聚合） |
| 桌面自动恢复   | 仅从 ConfigStorage 读取（不经过 resolve）               | 仅从 ConfigStorage 读取（不经过 resolve）  |

**异常情况**：

- 自动恢复失败（端口全部占用/其他错误）：仅记录日志，不影响应用正常启动
- 配置文件 JSON 解析失败：使用空配置 `{}`，不报错
- ConfigStorage 读取失败：默认为未启用

**验收标准**：

- [ ] 启用 WebUI 后，重启应用时自动恢复 WebUI 服务 [验证策略：集成测试]
- [ ] 禁用 WebUI 后，重启应用不会自动启动服务 [验证策略：集成测试]
- [ ] 启动失败不影响应用正常使用 [验证策略：集成测试]
- [ ] 持久化在启动成功后才写入（失败不写入，避免循环恢复失败）[验证策略：evaluate_script 读 ConfigStorage]

---

## (F-WEBUI-03) 访问地址展示 [已实现]

**用户故事**：作为用户，我希望 WebUI 启动后能看到访问地址，方便在浏览器中打开或分享给他人。

**前置条件**：WebUI 服务正在运行（`status.running === true`）

**正常流程**（用户视角）：

1. WebUI 启动后，服务卡片内出现"访问地址"行
2. 根据"允许远程访问"开关状态显示不同地址：
   - 远程访问关闭：显示 `http://localhost:{port}`
   - 远程访问开启：显示 `http://{局域网IP}:{port}`（如 `http://192.168.3.15:25809`）
3. 地址以蓝色链接样式显示，点击在系统默认浏览器中打开
4. 地址旁有复制按钮，点击复制到剪贴板，toast 提示"复制成功"

**异常情况**：

- 点击链接打开浏览器失败：仅记录日志，无用户可见提示
- 局域网 IP 获取失败（无网卡/无 IPv4 地址）：退回显示 `localhost`

**验收标准**：

- [ ] 仅在 WebUI 运行时显示访问地址行
- [ ] 远程访问开启时显示局域网 IP 地址
- [ ] 远程访问关闭时显示 localhost
- [ ] 点击地址在系统浏览器中打开
- [ ] 复制按钮可复制地址 + toast 提示

---

## (F-WEBUI-04) 远程访问控制 [已实现]

**用户故事**：作为用户，我希望控制是否允许局域网内其他设备访问 WebUI，以便用手机或其他电脑访问 AionUi。

**正常流程**（用户视角）：

1. 服务卡片内"允许远程访问"行，右侧有 Switch 开关
2. 开关下方显示说明文字（"使用远程软件/服务器可安全远程访问"）和蓝色"查看方式"链接
3. 用户打开开关（OFF → ON）
4. **如果 WebUI 正在运行**：系统执行停止→重启流程（因为需要切换监听地址从 `127.0.0.1` 到 `0.0.0.0`），显示 loading，toast 提示"WebUI 已重启"
5. 访问地址从 `localhost` 变为局域网 IP，QR 码区域出现（见 F-WEBUI-08）
6. **如果 WebUI 未运行**：仅保存偏好，不触发重启

**异常情况**：

- 重启失败（停止后无法重新启动）：系统二次确认服务状态（调用 getStatus），如确认未运行则回滚开关 + toast（`settings.webui.operationFailed`）
- 重启超时：最大等待 6s（停止 1.5s + 启动 3s + 状态确认 1.5s），超时后同上处理
- 持久化失败：回滚开关状态 + toast（`settings.webui.operationFailed`）
- "查看方式"链接：点击打开 GitHub Wiki 远程访问指南页面（`shell.openExternal`）

**验收标准**：

- [ ] 切换开关可启用/禁用远程访问
- [ ] WebUI 运行中切换时，执行自动重启流程
- [ ] 重启成功有 toast 提示（`settings.webui.restartSuccess`）
- [ ] 重启失败回滚开关状态 + toast 提示（`settings.webui.operationFailed`）
- [ ] 设置在 WebUI 未运行时也可修改并持久化，下次启动生效
- [ ] "查看方式"链接可打开指南页面

---

## (F-WEBUI-05) 用户名管理 [已实现]

**用户故事**：作为用户，我希望能查看和修改 WebUI 的登录用户名，以便个性化我的登录凭据。

**正常流程**（用户视角）：

1. 登录信息卡片（始终可见，无论 WebUI 是否启用）显示"用户名:"行
2. 当前用户名明文显示（默认 "admin"）
3. 旁有复制按钮（复制用户名）和编辑按钮（铅笔图标）
4. 点击编辑按钮弹出"设置新用户名"弹窗
5. 输入框预填当前用户名
6. 用户输入新用户名，点击"确定"
7. 提交成功：toast"用户名修改成功"，弹窗关闭，显示更新为新用户名

**表单校验规则**：

| 规则                        | 前端校验 | 后端校验 | 错误提示                               |
| --------------------------- | -------- | -------- | -------------------------------------- |
| 必填                        | 是       | -        | 前端 i18n 提示                         |
| 最少 3 字符                 | 是       | 是       | 前端 i18n / 后端英文原文（未 i18n 化） |
| 最多 32 字符                | 是       | 是       | 前端 i18n / 后端英文原文（未 i18n 化） |
| 仅允许 `[a-zA-Z0-9_-]`      | 是       | 是       | 前端 i18n / 后端英文原文（未 i18n 化） |
| 不能以 `_` 或 `-` 开头/结尾 | 是       | 是       | 前端 i18n / 后端英文原文（未 i18n 化） |
| 用户名已存在（不同用户）    | -        | 是       | "Username already exists"（英文原文）  |

**异常情况**：

- 前端校验失败：表单内行内提示，不提交
- 后端校验失败：toast 显示后端返回的**英文原文**错误信息（注：与密码修改不同，用户名后端错误码未做前端 i18n 翻译）
- IPC 调用异常：toast（`settings.webui.usernameChangeFailed`）
- 用户名与当前相同：后端直接返回成功，不执行更新
- 修改成功后：所有已存在的登录 token 失效（通过 JWT secret 轮转实现，为被动失效 — 已建立的 WebSocket 连接不会立即断开，需等到下次请求或心跳时才被拒绝）

**验收标准**：

- [ ] 用户名默认显示"admin"
- [ ] 复制按钮可复制用户名
- [ ] 编辑按钮打开"设置新用户名"弹窗，预填当前值
- [ ] 前端校验规则全部生效
- [ ] 提交成功后 toast 提示 + 弹窗关闭 + UI 更新
- [ ] 提交失败有明确错误提示
- [ ] 修改后已有 WebUI 登录会话被踢出

---

## (F-WEBUI-06) 密码显示与初始密码 [已实现]

**用户故事**：作为用户，我希望在首次启动 WebUI 时能看到系统生成的初始密码，之后密码显示为遮罩状态，以保护安全。

**正常流程**（用户视角）：

1. 登录信息卡片中"初始密码:"行（始终可见）
2. **首次启动（有初始密码）**：显示明文密码（12 至 16 字符，含两端；含小写 + 大写字母 + 数字 + 特殊字符 `!@#$%^&*`）
3. **非首次启动（无初始密码/已修改密码）**：显示"**\*\***"（密码遮罩）
4. 旁有编辑按钮（铅笔图标），hover 时 tooltip 提示"忘记密码？点击设置新密码（不需要当前密码）"
5. **注意：密码行仅有编辑按钮，无复制功能**（与用户名行不同，用户名行有复制 + 编辑两个按钮）

**异常情况**：

- 服务运行中但无初始密码且无缓存密码：显示"**\*\***"，用户需通过编辑按钮设置新密码
- 密码可见状态（`canShowPlainPassword`）是组件内存状态，页面刷新后重置为遮罩

**验收标准**：

- [ ] 首次启动时密码明文可见
- [ ] 用户修改密码后切换为遮罩显示
- [ ] 编辑按钮 tooltip 提示修改密码不需要当前密码
- [ ] 页面刷新后密码回到遮罩状态
- [ ] 密码行仅有编辑按钮，无复制按钮

---

## (F-WEBUI-07) 密码修改 [已实现]

**用户故事**：作为用户，我希望能设置自定义密码替换系统生成的初始密码，或在忘记密码时直接设置新密码。

**正常流程**（用户视角）：

1. 点击密码行的编辑按钮
2. 弹出"设置新密码"弹窗
3. 输入新密码（Password 输入框，带可见性切换图标，placeholder"请输入新密码（至少8位）"）
4. 输入确认密码（placeholder"请再次输入新密码"）
5. 点击"确定"
6. 提交成功：toast"密码修改成功"，弹窗关闭，密码行切换为"**\*\***"

**表单校验规则**：

| 规则          | 校验端    | 错误提示                         |
| ------------- | --------- | -------------------------------- |
| 新密码必填    | 前端      | "请输入新密码"                   |
| 最少 8 字符   | 前端+后端 | i18n 提示 / `PASSWORD_TOO_SHORT` |
| 最多 128 字符 | 后端      | `PASSWORD_TOO_LONG`              |
| 弱密码黑名单  | 后端      | `PASSWORD_TOO_COMMON`            |
| 确认密码必填  | 前端      | "请再次输入新密码"               |
| 两次密码一致  | 前端      | "两次密码不一致"                 |

**弱密码黑名单**：`password`, `12345678`, `123456789`, `qwertyui`, `abcdefgh`

**异常情况**：

- 前端校验失败：表单内行内提示，不提交
- 后端返回多个错误码（`'; '` 分隔）：前端翻译后合并显示（如 `PASSWORD_TOO_SHORT` → i18n 短密码提示）
- 后端返回未知错误码：显示原始错误信息，或兜底"密码修改失败"
- IPC 调用异常：toast"密码修改失败"

**技术说明**：

- **不需要当前密码验证**：changePassword API 直接设置新密码（安全性依赖 Electron 本地环境）
- **密码修改后全部 token 失效**：通过 JWT secret 轮转（`invalidateAllTokens` 生成新 secret）实现。这是**被动失效**机制 — 旧 token 不会被主动推送下线，而是在下次请求时验证失败被拒绝。已建立的 WebSocket 连接不会立即断开，需等到心跳或重连时才会被拒绝
- **后端清除初始密码**：`clearInitialAdminPassword()` 清除内存中的初始密码，后续 getStatus 不再返回 initialPassword

**验收标准**：

- [ ] 点击编辑按钮打开"设置新密码"弹窗
- [ ] 不需要输入当前密码
- [ ] 新密码和确认密码均有 Password 可见性切换
- [ ] 前端校验（必填、最短 8 位、两次一致）生效
- [ ] 后端校验（最长 128 位、弱密码黑名单）生效
- [ ] 提交成功后 toast 提示（`settings.webui.passwordChanged`）+ 弹窗关闭 + 密码切换为遮罩
- [ ] 修改后已有 WebUI 登录 token 被动失效

---

## (F-WEBUI-08) QR 码登录 [已实现]

**用户故事**：作为用户，我希望在允许远程访问时能通过手机扫描二维码快速登录 WebUI，无需手动输入地址和密码。

**前置条件**：WebUI 服务运行中（`status.running === true`）且允许远程访问（`status.allowRemote === true`）

**正常流程**（用户视角）：

1. 登录信息卡片下方出现分隔线 + "二维码登录"区块
2. 说明文字："使用手机扫描二维码，即可在手机浏览器中自动登录"
3. 系统自动生成二维码（140x140 SVG，纠错级别 M）
4. 二维码下方显示有效期（本地化时间格式，24h 或 12h 取决于系统 locale；使用 `toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })`）
5. 旁有复制按钮（复制二维码对应的 URL）和刷新按钮
6. 用户用手机扫描二维码，自动在手机浏览器打开并登录 WebUI
7. 二维码在过期前自动刷新（token 5 分钟过期，定时器 4 分钟触发刷新）

**QR 码 URL 格式**：`http://{lanIP}:{port}/qr-login?token={64位hex}`

**Token 安全机制**：

| 安全特性   | 说明                                        |
| ---------- | ------------------------------------------- |
| 随机生成   | `crypto.randomBytes(32)` → 64 位 hex        |
| 有效期     | 5 分钟（`QR_TOKEN_EXPIRY = 5 * 60 * 1000`） |
| 一次性使用 | 验证后标记 `used: true` 并立即从内存中删除  |
| IP 限制    | 非远程模式下仅允许本地/局域网 IP 使用       |
| 内存存储   | 存储在进程内 `Map`，进程重启后全部失效      |

**自动生成/清除逻辑**：

- 服务运行 + 允许远程 + 无 QR URL → 自动生成
- 服务停止或关闭远程访问 → 自动清除二维码 + 取消定时器

**异常情况**：

- 生成失败（WebUI 未运行/IPC 异常）：QR 区域显示占位文案（`settings.webui.qrGenerateFailed`）+ toast（同一 i18n key）。注意：初始状态（尚未生成）和生成失败共用同一占位文案，组件无法区分两种状态
- Token 已过期：扫码后提示"QR token has expired"
- Token 已使用（重复扫码）：提示"QR token has already been used"
- 非本地 IP 使用 local-only token：拒绝，提示"QR login is only allowed from local network"
- 加载中：QR 区域显示 `common.loading` 对应文案（以 i18n 实际值为准），刷新按钮显示旋转动画

**验收标准**：

- [ ] 仅在 WebUI 运行 + 允许远程访问时显示 QR 区域
- [ ] 二维码自动生成，无需用户操作
- [ ] 显示有效期（本地化时间格式）
- [ ] QR 码在过期前自动刷新 [验证策略：代码审查 + 单元测试]
- [ ] 可手动点击刷新按钮
- [ ] 可复制二维码链接
- [ ] 扫码后可在手机浏览器中自动登录
- [ ] Token 为一次性使用，重复扫码失败
- [ ] 服务停止或关闭远程时 QR 区域消失

---

## (F-WEBUI-09) 页面结构 — WebUI / Channels 双 Tab [已实现]

**用户故事**：作为用户，我希望在"远程连接"设置页面中方便地切换 WebUI 服务配置和 Channel 渠道配置。

**正常流程**（用户视角）：

1. **桌面端**：页面顶部显示两个 Tab
   - "WebUI"（图标：地球）— 默认选中
   - "Channels"（图标：通讯 + 7 个渠道 logo 缩略图：Telegram/Lark/DingTalk/WeChat/WeCom/Slack/Discord）
2. 点击 Tab 切换内容区域
3. Channels Tab 内容通过懒加载方式加载，加载中显示"加载中..."
4. **非桌面端（WebUI 浏览器访问）**：无 Tab 切换，直接显示 Channels 配置内容（无 WebUI 服务管理功能）

**页面布局**：

- 导航路径：左侧栏"远程连接"（位于"应用"分组下，在"显示"和"桌面宠物"之间）
- URL hash：`#/settings/webui`
- WebUI Tab 内部结构：
  1. 标题"WebUI"（h2）+ 功能描述 + 3 步引导提示条
  2. WebUI 服务卡片（含蓝色提示横幅 + 启用开关 + 访问地址 + 远程访问开关）
  3. 登录信息卡片（含用户名 + 密码 + QR 码登录）

**验收标准**：

- [ ] 桌面端显示 WebUI / Channels 双 Tab
- [ ] 默认选中 WebUI Tab
- [ ] Tab 切换后内容区域渲染完成，Channels 懒加载期间显示 loading 占位
- [ ] 仅在 Electron 桌面端渲染 WebUI 服务配置区域（含 Tab 切换）
- [ ] 非桌面端仅显示 Channels，无 Tab 切换

---

## (F-WEBUI-10) 状态实时同步 [已实现]

**用户故事**：作为用户，我希望设置页面能实时反映 WebUI 服务的最新状态，即使状态由其他来源（如应用菜单、启动恢复）触发变更。

**正常流程**（用户视角）：

1. 组件挂载时自动加载 WebUI 当前状态（偏好设置 + 服务运行状态）
2. 主进程触发的状态变更（启动/停止/端口变化）通过事件实时推送到设置页面
3. UI 自动更新所有相关元素（Switch 状态、运行标记、访问地址、QR 码区域）

**IPC 双通道机制**：

- **Electron 环境**：优先使用 `electronAPI.webuiGetStatus()`（直接 IPC，无超时问题）
- **非 Electron 后备**：使用 `webui.getStatus.invoke()`（bridge 模式，1.5s 超时）
- **实时事件**：`webui.statusChanged.on()` 监听主进程推送的状态变更

**异常情况**：

- 偏好设置读取失败：默认为未启用/不允许远程
- getStatus 调用失败或超时：使用兜底状态（`running: false, port: DEFAULT_PORT, adminUsername: 'admin'`）
- 主进程 emit 的状态事件丢失：不影响 UI 已有状态，仅下次操作时刷新

**验收标准**：

- [ ] 页面进入时自动加载最新状态
- [ ] 状态变更实时反映到 UI（无需手动刷新）
- [ ] 状态加载失败时使用合理的兜底默认值

---

## (F-WEBUI-11) 扩展系统 WebUI 贡献 [已实现] [验证策略：单元测试]

**用户故事**：作为扩展开发者，我希望能通过扩展 manifest 声明 API 路由和静态资源，自动注册到 WebUI 服务器。

**正常流程**（开发者视角）：

1. 在扩展的 `manifest.contributes.webui` 中声明 `apiRoutes` 和/或 `staticAssets`
2. 应用加载扩展时，`resolveWebuiContributions` 校验并注册贡献
3. API 路由和静态资源在 WebUI 服务器上可用

**安全校验规则**：

| 规则               | 说明                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| 命名空间化         | 路径必须以 `/{extensionName}/` 开头                                            |
| 保留路径保护       | 不允许使用 `/`, `/api`, `/login`, `/logout`, `/qr-login`, `/static`, `/assets` |
| 路径冲突检测       | 跨扩展重复路径，后者被跳过                                                     |
| 路径遍历防护       | `isPathWithinDirectory` 确保所有文件在扩展目录内                               |
| 入口存在性检查     | 同时查找 dist 和 source 路径                                                   |
| 静态资源目录存在性 | `existsSync` 检查目录                                                          |

**已知局限**：

- `wsHandlers` 和 `middleware` 已声明但运行时不支持（仅 `console.warn` 提示）

**验收标准**：

- [ ] 合法的扩展 API 路由和静态资源可被注册
- [ ] 命名空间化和保留路径校验生效
- [ ] 路径遍历尝试被阻止
- [ ] 路径冲突时后者被跳过（不覆盖先注册的）

---

## 附录 A：WebUI 状态矩阵

| WebUI 开关 | 允许远程 | 访问地址                  | QR 码区域 | 登录信息 |
| ---------- | -------- | ------------------------- | --------- | -------- |
| OFF        | (any)    | 不显示                    | 不显示    | 显示     |
| ON         | OFF      | `http://localhost:{port}` | 不显示    | 显示     |
| ON         | ON       | `http://{lanIP}:{port}`   | 显示      | 显示     |

---

## 附录 B：IPC 通信链路

```
┌──────────────────────────────────────────────────────────────────────┐
│ 渲染进程 (Renderer) - WebuiModalContent.tsx                          │
│                                                                      │
│  状态加载:                                                            │
│    ├─ ConfigStorage.get('webui.desktop.enabled')                     │
│    ├─ ConfigStorage.get('webui.desktop.allowRemote')                 │
│    ├─ electronAPI.webuiGetStatus() [优先]                             │
│    └─ webui.getStatus.invoke() [后备, 1.5s timeout]                  │
│                                                                      │
│  服务启停:                                                            │
│    ├─ webui.start.invoke({ port, allowRemote }) [3s timeout]         │
│    ├─ webui.stop.invoke() [fire-and-forget]                          │
│    └─ webui.statusChanged.on(callback) [实时监听]                     │
│                                                                      │
│  认证管理 (双通道: electronAPI 优先, bridge 后备):                     │
│    ├─ webuiChangePassword / webui.changePassword.invoke              │
│    ├─ webuiChangeUsername / webui.changeUsername.invoke               │
│    └─ webuiGenerateQRToken / webui.generateQRToken.invoke            │
│                                                                      │
│  外部操作:                                                            │
│    ├─ shell.openExternal.invoke(url) [打开浏览器/指南]                │
│    └─ navigator.clipboard.writeText(text) [复制]                     │
└──────────────────────────────────────────────────────────────────────┘
                      │ IPC Bridge + Direct IPC
┌─────────────────────▼────────────────────────────────────────────────┐
│ 主进程 (Main) - webuiBridge.ts                                        │
│                                                                      │
│  Bridge providers:                                                   │
│    ├─ webui.getStatus → WebuiService.getStatus()                     │
│    ├─ webui.start → startWebServerWithInstance()                     │
│    ├─ webui.stop → server.close() + cleanupWebAdapter()              │
│    ├─ webui.changePassword → WebuiService.changePassword()           │
│    ├─ webui.changeUsername → WebuiService.changeUsername()            │
│    ├─ webui.generateQRToken → generateQRLoginUrlDirect()             │
│    └─ webui.verifyQRToken → verifyQRTokenDirect()                    │
│                                                                      │
│  Emitters (主→渲染):                                                  │
│    ├─ webui.statusChanged.emit({ running, port, localUrl })          │
│    └─ webui.resetPasswordResult.emit({ success, newPassword })       │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 服务层                                                                │
│  WebuiService: getStatus / changePassword / changeUsername /         │
│    resetPassword / getLanIP                                          │
│  webuiQR: generateQRLoginUrlDirect / verifyQRTokenDirect             │
│  AuthService: validatePasswordStrength / validateUsername /           │
│    generateRandomPassword / hashPassword / invalidateAllTokens       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 附录 C：Toast 通知汇总

| 触发操作             | Toast 类型 | i18n Key                              |
| -------------------- | ---------- | ------------------------------------- |
| WebUI 启动成功       | success    | `settings.webui.startSuccess`         |
| WebUI 停止成功       | success    | `settings.webui.stopSuccess`          |
| 远程访问切换重启成功 | success    | `settings.webui.restartSuccess`       |
| 启动/停止/重启失败   | error      | `settings.webui.operationFailed`      |
| 复制成功             | success    | `common.copySuccess`                  |
| 用户名修改成功       | success    | `settings.webui.usernameChanged`      |
| 用户名修改失败       | error      | `settings.webui.usernameChangeFailed` |
| 密码修改成功         | success    | `settings.webui.passwordChanged`      |
| 密码修改失败         | error      | `settings.webui.passwordChangeFailed` |
| QR 码生成失败        | error      | `settings.webui.qrGenerateFailed`     |

---

## 附录 D：已知局限汇总

| #   | 功能点        | 局限描述                                                                                                                            | 来源           |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | F-WEBUI-01    | 启动 IPC 超时 3s 后乐观设置 `running: true`，同时持久化 `enabled=true`，可能导致 UI 与实际状态不一致且下次启动循环恢复失败服务      | R2 初稿 + C-04 |
| 2   | F-WEBUI-01    | 停止操作 fire-and-forget，Toast 出现时服务器可能仍在运行，停止失败用户无感知                                                        | R2 初稿 + C-05 |
| 3   | F-WEBUI-04    | 远程访问切换需重启服务器，期间短暂不可用（最长 6s：停止 1.5s + 启动 3s + 状态确认 1.5s）                                            | R2 初稿 + C-06 |
| 4   | F-WEBUI-06    | 密码首次可见状态是组件内存状态，页面刷新后丢失                                                                                      | R2 初稿        |
| 5   | F-WEBUI-06    | 密码行仅有编辑按钮，无复制功能（与用户名行功能不对称）                                                                              | C-07           |
| 6   | F-WEBUI-07    | 修改密码不需要输入当前密码，安全性依赖 Electron 本地环境信任                                                                        | R2 初稿        |
| 7   | F-WEBUI-05    | 用户名后端校验错误信息为硬编码英文，未做前端 i18n 翻译（密码修改有 errorCodeMap 翻译）                                              | C-10           |
| 8   | F-WEBUI-05/07 | Token 失效通过 JWT secret 轮转实现（被动失效），已建立的 WebSocket 连接不会立即断开                                                 | C-13           |
| 9   | F-WEBUI-08    | QR token 存储在进程内存 Map，主进程重启后全部失效                                                                                   | R2 初稿        |
| 10  | F-WEBUI-08    | `isLocalIP` 不覆盖 IPv6 ULA 地址（`fd00::/8`）                                                                                      | R2 初稿        |
| 11  | F-WEBUI-08    | QR 码初始状态（尚未生成）和生成失败共用同一占位文案，组件无法区分两种状态                                                           | C-11           |
| 12  | F-WEBUI-02    | UI 未暴露端口修改入口，仅可通过配置文件/CLI/环境变量修改                                                                            | R2 初稿        |
| 13  | F-WEBUI-02    | 桌面自动恢复（`restoreDesktopWebUIFromPreferences`）不经过 `resolveWebUIPort`/`resolveRemoteAccess`，CLI 和环境变量在此路径下不生效 | C-08           |
| 14  | F-WEBUI-01    | 端口递增上限固定为 `DEFAULT_PORT + 10`，用户指定端口超出此范围时递增不生效                                                          | C-01           |
