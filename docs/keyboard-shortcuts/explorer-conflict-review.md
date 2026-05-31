# explorer-conflict 快捷键冲突审查

工作区：`C:\Projects\AionUI\keyboard_shortcuts`
审查角色：explorer-conflict
审查范围：基于 explorerA 顶层设计、三个 explorer 分项报告和 `C:\Projects\AionUI\raw\shortcuts_function_merged.md`。本文只做实现 scope 与冲突审查，不修改业务代码。

## 总体结论

AionUI 第一版不应继续新增分散的 `window.addEventListener('keydown')`。应先建立 renderer-first 的 command registry 与 scoped shortcut registry，把现有会话、搜索、预览保存等快捷键迁移到统一模型，再启用少量低风险默认绑定。

第一版默认绑定应以“已有功能、语义稳定、可做上下文过滤”为准。命令面板、自定义快捷键、模型选择器、MCP、Agent 切换、权限批准、主题语言切换等可以进入命令清单或快捷键设置页展示，但不应在第一版直接默认启用。

## 冲突矩阵

| 冲突对象                                    | 涉及快捷键/候选                                | 冲突类型           | 冲突说明                                                                                                                    | V1 决策                                                                                                               |
| ------------------------------------------- | ---------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 新建会话 vs 浏览器新标签                    | `Ctrl/Cmd+T`                                   | 逻辑冲突           | AionUI 已用作新建会话并导航 `/guid`；Codex 清单中也可表示浏览器新标签。AionUI 当前顶层对象是会话，不是浏览器 tab。          | 保留 `conversation.new`，不要绑定浏览器 tab。WebUI/browser 模式不抢浏览器原生 `Ctrl+T`。                              |
| 当前搜索 vs 分享会话                        | `Ctrl/Cmd+F`                                   | 逻辑冲突           | OpenCode 曾把 `Ctrl+F` 用于分享；AionUI 已用于当前聊天 minimap 搜索。                                                       | 保留查找语义。分享只作为命令面板/菜单命令。                                                                           |
| 全局聊天搜索 vs 其他搜索                    | `Ctrl/Cmd+Shift+F`, `Ctrl+G`                   | 逻辑冲突           | AionUI 已有 `Ctrl/Cmd+Shift+F` 全局聊天搜索；`Ctrl+G` 在其他产品中可能是聊天搜索或工作区切换。                              | 保留 `Ctrl/Cmd+Shift+F`，不引入 `Ctrl+G` 默认绑定。                                                                   |
| 命令面板 vs 打开文件                        | `Ctrl/Cmd+K`                                   | 逻辑冲突           | merged 清单中 `Ctrl+K` 可表示命令面板或打开文件。                                                                           | 预留给命令面板；文件搜索用 `Ctrl/Cmd+P`。命令面板未实现前不默认启用。                                                 |
| 快速打开文件 vs 打印                        | `Ctrl/Cmd+P`                                   | 上下文冲突         | Electron/WebUI/browser/preview 中 `Ctrl+P` 常见为打印；AionUI 工作区中更适合搜索文件。                                      | 可作为 V1 候选，但必须限定 conversation/workspace 上下文，并在 webview、编辑器、浏览器模式中放行。                    |
| 打开项目 vs 更换当前工作区 vs 外部打开      | `Ctrl/Cmd+O`                                   | 模块边界冲突       | AionUI 同时有新会话选择 workspace、已有会话替换 workspace、外部工具打开当前 workspace。                                     | V1 不默认启用全局 `Ctrl+O`。先在命令清单展示，待产品语义拆清后再启用。                                                |
| 关闭 tab/window/preview                     | `Ctrl/Cmd+W`                                   | 上下文冲突         | 可能关闭预览 tab、内嵌浏览器、当前会话或主窗口。Preview README 与实际实现也不一致。                                         | V1 不做全局默认。若做，只能是预览面板局部关闭当前预览 tab。                                                           |
| 刷新 app vs 刷新 webview vs 强刷            | `Ctrl/Cmd+R`, `Ctrl/Cmd+Shift+R`               | IPC/主渲染边界冲突 | Electron menu role 已可能处理 reload/forceReload；webview 也有局部 reload。`Ctrl+Shift+R` 还与 review 候选冲突。            | 保留 Electron 菜单/开发行为，不新增 renderer 默认绑定。                                                               |
| 缩放                                        | `Ctrl/Cmd + +`, `Ctrl/Cmd + -`, `Ctrl/Cmd + 0` | IPC/主渲染边界冲突 | 已在 main process `before-input-event` 中处理并持久化到 `ui.zoomFactor`。                                                   | 视为 main-process reserved，registry 中展示为保留，不由 renderer 二次处理。                                           |
| 自动接受权限 vs 归档                        | `Ctrl/Cmd+Shift+A`                             | 高风险逻辑冲突     | 自动允许、始终允许、归档/删除都可能产生不可逆或高影响结果。                                                                 | 必须避免默认绑定。权限批准只在确认窗口/请求上下文局部生效。                                                           |
| 思考强度 vs 听写                            | `Ctrl/Cmd+Shift+D`                             | 逻辑冲突           | merged 清单中可表示思考强度或听写；AionUI 有 STT，但没有统一快捷命令。                                                      | V1 只展示未绑定。若后续启用，必须限定 SendBox 或模式选择器上下文。                                                    |
| Prompt 模式 vs 文件树                       | `Ctrl/Cmd+Shift+E`                             | 逻辑冲突           | OpenCode 可用于 Prompt 模式；Codex 用于文件树。AionUI 当前无 Prompt/Shell 输入模式，有 workspace 面板。                     | V1 可绑定 `workspace.togglePanel`，仅 conversation/team 且非输入/编辑器上下文。                                       |
| 复制工作目录 vs 终端复制                    | `Ctrl/Cmd+Shift+C`                             | 上下文冲突         | 终端常用复制；未来 terminal/webview/editor 也可能占用。                                                                     | V1 不默认绑定。复制路径类命令仅命令面板/上下文菜单。                                                                  |
| Agent 切换 vs 焦点导航                      | `Tab`                                          | 可访问性冲突       | `Tab` 是系统焦点导航和输入控件关键键。                                                                                      | 永不做全局默认。Agent 选择只能是命令面板、下拉框或显式上下文快捷键。                                                  |
| 主题切换 vs 恢复关闭标签                    | `Ctrl/Cmd+Shift+T`                             | 平台习惯冲突       | 浏览器/桌面用户常将其理解为恢复关闭 tab。                                                                                   | V1 不默认绑定主题。主题命令只展示/命令面板。                                                                          |
| 配色切换/Trace/新会话                       | `Ctrl/Cmd+Shift+S`                             | 多语义冲突         | merged 清单中至少对应新会话、配色、Trace recording；也接近保存语义。                                                        | V1 不默认绑定。                                                                                                       |
| WebUI 登出 vs 桌面全局                      | `Ctrl/Cmd+Shift+L`                             | 平台/产品边界冲突  | 现有实现只在 WebUI 登录态可见时处理 logout。桌面端低频且高影响。                                                            | 保留现有条件行为，不扩大到桌面默认。                                                                                  |
| 输入框/编辑器/IME vs 全局命令               | 多数全局键                                     | 上下文冲突         | SendBox、slash command、textarea、contenteditable、CodeMirror/Monaco、webview、终端、IME composition 都应优先拥有输入语义。 | ShortcutProvider 必须统一过滤：`defaultPrevented`、`isComposing`、editable target、webview/editor/terminal contexts。 |
| scoped local handlers vs app global handler | `Enter`, `Escape`, arrow keys, `Ctrl/Cmd+S`    | 优先级冲突         | pet confirm、modal、search result、preview editor 都有局部快捷行为。                                                        | 优先级固定为 modal/component > route/page > app global > main-process reserved。                                      |

## 必须避免的默认绑定

| 快捷键             | 不应默认绑定到            | 原因                                         |
| ------------------ | ------------------------- | -------------------------------------------- |
| `Tab`              | 切换 Agent                | 破坏焦点导航和可访问性。                     |
| `Ctrl/Cmd+Shift+A` | 自动接受权限、归档、删除  | 高风险动作，且候选语义冲突。                 |
| `Ctrl/Cmd+Shift+S` | 新建会话、配色切换、Trace | 多语义冲突，并接近保存心智。                 |
| `Ctrl/Cmd+Shift+R` | review toggle、强制刷新   | 与 Electron/browser 强刷冲突，可能中断会话。 |
| `Ctrl/Cmd+R`       | 聊天重做                  | 平台上更常见为刷新。                         |
| `Ctrl/Cmd+X`       | 从消息分叉                | 覆盖剪切。                                   |
| `Ctrl/Cmd+Shift+C` | 复制工作目录              | 与终端复制和开发工具习惯冲突。               |
| `Ctrl/Cmd+Shift+T` | 切换主题                  | 与恢复关闭标签页冲突。                       |
| `Ctrl/Cmd+W`       | 全局关闭                  | 关闭对象不明确，误触风险高。                 |
| `Ctrl/Cmd+O`       | 未限定的“打开项目/文件夹” | AionUI 工作区语义尚未统一。                  |
| `Ctrl/Cmd+L`       | 单一全局动作              | 聚焦输入框、地址栏、webview URL 的语义冲突。 |
| `Enter` / `Escape` | 全局批准/拒绝请求         | 只能在确认 UI、modal 或请求上下文内生效。    |
| `Ctrl/Cmd + +/-/0` | renderer 命令             | 已由 main process 缩放逻辑拥有。             |

## 第一版建议启用的默认快捷键

第一版默认启用应分两类：保留现有行为，以及在统一 registry 后新增低风险行为。

| 命令 ID 建议                   | 默认快捷键         | Scope                        | 状态         | 说明                                                                         |
| ------------------------------ | ------------------ | ---------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `conversation.new`             | `Ctrl/Cmd+T`       | app global, Electron desktop | 保留现有     | 新建会话/进入 `/guid`。WebUI 不应抢浏览器新标签。                            |
| `conversation.nextVisible`     | `Ctrl+Tab`         | app global, Electron desktop | 保留现有     | 文案应称“下一个可见会话”，不是 MRU。                                         |
| `conversation.previousVisible` | `Ctrl+Shift+Tab`   | app global, Electron desktop | 保留现有     | 同上，反向循环。                                                             |
| `conversation.findCurrent`     | `Ctrl/Cmd+F`       | conversation route           | 保留现有     | 仅 desktop conversation 上下文拦截；WebUI/browser 放行浏览器查找。           |
| `conversation.searchAll`       | `Ctrl/Cmd+Shift+F` | app/conversation             | 保留现有     | 打开全局聊天消息搜索。                                                       |
| `preview.save`                 | `Ctrl/Cmd+S`       | preview component            | 保留现有局部 | 仅 dirty editable preview 挂载时生效。                                       |
| `app.openSettings`             | `Ctrl/Cmd+,`       | app global                   | V1 新增      | 导航页面式设置，建议 `/settings/model` 或最近设置子页。                      |
| `app.toggleSidebar`            | `Ctrl/Cmd+B`       | app global                   | V1 新增      | 切换左侧栏，移动端需单独判断。                                               |
| `navigation.back`              | `Ctrl/Cmd+[`       | app global                   | V1 新增      | 调用现有 navigation history back。                                           |
| `navigation.forward`           | `Ctrl/Cmd+]`       | app global                   | V1 新增      | 调用现有 navigation history forward。                                        |
| `workspace.togglePanel`        | `Ctrl/Cmd+Shift+E` | conversation/team route      | V1 新增      | 仅有 workspace/右侧面板上下文时生效。                                        |
| `workspace.searchFiles`        | `Ctrl/Cmd+P`       | workspace route/component    | V1 可选      | 展开 workspace 并聚焦搜索框；必须在 webview、editor、browser、输入框中放行。 |
| `shortcuts.showHelp`           | `Ctrl/Cmd+Shift+/` | app global                   | V1 条件新增  | 只有当 `/settings/shortcuts` 或只读帮助面板由 registry 驱动时启用。          |

V1 不建议同时启用 `Ctrl/Cmd+K` 和 `Ctrl/Cmd+Shift+P`，除非命令面板本身已作为第一版交付并复用同一 command registry。否则这两个键只应显示为“预留”。

## 建议只展示但禁用/未绑定的命令

| 命令                                                | 展示状态        | 不启用默认绑定的原因                                                               |
| --------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `commandPalette.open`                               | 预留            | 命令面板尚未实现时不能绑定。实现后可用 `Ctrl/Cmd+K`，可选兼容 `Ctrl/Cmd+Shift+P`。 |
| `keyboardShortcuts.edit`                            | 未绑定          | 自定义快捷键需要冲突检测、录入 UI、持久化、恢复默认。                              |
| `workspace.openFolder`                              | 未绑定          | `Ctrl/Cmd+O` 的目标在 Guid、已有会话、外部打开之间冲突。                           |
| `workspace.attachFile`                              | 未绑定          | 需要 SendBox vs Workspace 焦点上下文分派。                                         |
| `workspace.openExternal`                            | 未绑定          | 适合命令面板或 workspace 菜单，不适合默认全局键。                                  |
| `conversation.pinToggle`                            | 未绑定          | 有功能但当前动作封装在列表 hook 内，默认键价值不如命令面板。                       |
| `conversation.rename`                               | 未绑定          | 需要统一当前会话标题编辑和列表 rename modal。                                      |
| `conversation.copyMarkdown`                         | 未绑定          | 适合命令面板；要处理大消息和附件。                                                 |
| `conversation.copySessionId`                        | 未绑定          | 偏诊断。                                                                           |
| `conversation.copyDeeplink`                         | 未绑定          | 需要 deeplink 生成规范。                                                           |
| `model.openSelector`                                | 未绑定          | 不同 Agent/backend 的 selector 不统一；建议先命令面板或上下文按钮。                |
| `agent.openSelector`                                | 未绑定          | 不能用 `Tab`；已建会话是否可切 Agent 需产品规则。                                  |
| `mcp.openSettings`                                  | 未绑定          | 可展示为打开 `/settings/capabilities?tab=tools`，不直接 toggle。                   |
| `mode.openSelector`                                 | 未绑定          | 权限/思考模式影响执行行为，不应快捷键直接循环。                                    |
| `speech.toggleDictation`                            | 未绑定          | 仅能作为 SendBox 上下文能力，且需处理权限、录音中断、IME。                         |
| `permission.approve` / `permission.reject`          | 局部绑定        | 只在 pet confirm 或 inline permission 明确聚焦时使用 `Enter`/`Escape`。            |
| `theme.toggle` / `theme.setLight` / `theme.setDark` | 未绑定          | 低频设置，适合命令面板。                                                           |
| `language.select`                                   | 未绑定          | 低频设置，适合设置页和命令面板。                                                   |
| `diagnostics.exportLogs`                            | 未绑定          | 低频诊断，涉及隐私提示和导出目标。                                                 |
| `developer.openDevTools`                            | 未绑定          | 保留 Electron menu role / DevSettings，不面向普通默认。                            |
| `developer.startTrace`                              | 未绑定          | 仅开发模式，且与 `Ctrl/Cmd+Shift+S` 冲突。                                         |
| `app.logout`                                        | 条件绑定/未绑定 | 保留 WebUI 登录态下现有 `Ctrl/Cmd+Shift+L`，不扩展为桌面全局。                     |

## 第一版实现 Scope

### V1 必做

1. 建立 renderer command registry：命令 ID、分类、标题、默认快捷键、scope、when 条件、risk、run adapter。
2. 建立 shortcut registry：accelerator 解析/归一化、平台显示、冲突检测、active binding lookup、优先级排序。
3. 在 `Layout` 附近挂载一个 app-level ShortcutProvider，要求可访问 router、layout、navigation history 和命令执行上下文。
4. 迁移现有分散快捷键到 registry，行为保持不变：新建会话、会话切换、当前聊天搜索、全局聊天搜索、preview save、WebUI logout 条件行为。
5. 把 main-process zoom 和 Electron menu reload/devtools 标记为 reserved，不由 renderer registry 抢占。
6. 新增低风险默认：打开设置、切换侧栏、路由返回/前进、切换 workspace 面板；`Ctrl/Cmd+P` 和 `Ctrl/Cmd+Shift+/` 取决于 UI 是否同时落地。
7. 新增 `/settings/shortcuts` 的只读总览或帮助面板，数据必须来自 command registry，不手写静态清单。

### V1 暂不做

1. 不做完整自定义快捷键录入与持久化，除非 Worker B 已完成冲突检测与 versioned config。
2. 不启用命令面板默认键，除非命令面板复用同一 command registry。
3. 不做 OS-global shortcut，不使用 Electron `globalShortcut`。
4. 不迁移 main-process zoom 到 renderer。
5. 不为高风险动作、低频设置、诊断/开发功能分配默认全局键。

## Worker A UI 责任边界

Worker A 负责用户可见 UI 和交互承载，不负责底层快捷键匹配或 IPC 新增通道。

| 责任                       | 说明                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/settings/shortcuts` 页面 | 展示命令分类、标题、默认快捷键、当前有效快捷键、scope、冲突/保留状态。第一版可以只读。                    |
| 快捷键帮助面板             | 若启用 `shortcuts.showHelp`，内容必须从 command registry 读取，不维护第二份静态表。                       |
| Command UI shell           | 若做命令面板，Worker A 只负责搜索、列表、空态、禁用态、执行入口；命令定义和可执行性来自 registry。        |
| 设置侧栏集成               | 将 `shortcuts` 放入页面式设置，不塞进旧 `SettingsModal` 首版编辑路径。建议位于 `display` 后、`webui` 前。 |
| 冲突呈现                   | 展示 Worker B 给出的 conflict diagnostics，包括 duplicate、reserved、context-blocked、platform-only。     |
| 可访问性                   | 表格/列表可键盘导航，搜索框不被全局快捷键抢焦点，禁用命令有明确原因。                                     |

Worker A 不应：

- 直接注册全局 `keydown`。
- 直接解析 accelerator 字符串。
- 直接导入 Electron 或新增 preload API。
- 为同一命令维护独立标题、快捷键、分类清单。
- 在 UI 内绕过 registry 执行高风险命令。

## Worker B registry/IPC 责任边界

Worker B 负责命令语义层、快捷键匹配层、冲突检测和 renderer/main 边界约束。

| 责任                 | 说明                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command schema       | 定义 `id`、`titleKey`、`category`、`defaultShortcut`、`scope`、`when`、`risk`、`run(ctx)`。                                                                    |
| Accelerator parser   | 支持 `CtrlOrCmd` 展示与平台展开，处理大小写、numpad、符号键、`Shift+/` 等特殊组合。                                                                            |
| ShortcutProvider     | 统一 document/window listener 生命周期，处理 priority、`preventDefault`、`stopPropagation` 策略。                                                              |
| Context guard        | 统一跳过 IME composition、`event.defaultPrevented`、input/textarea/contenteditable、CodeMirror/Monaco、terminal、webview、browser mode。                       |
| Conflict diagnostics | 检测同 scope 重复、跨 scope 覆盖、reserved main-process accelerator、platform-native 冲突、高风险默认绑定。                                                    |
| Persistence adapter  | 若进入自定义阶段，使用 `configService` 存 `keyboard.shortcuts` versioned overrides；不要写 main-process `ProcessConfig`，除非快捷键必须 renderer boot 前生效。 |
| IPC adapter          | renderer command 只能通过现有 `ipcBridge`、`configService`、路由/context adapter 调用能力，不直接导入 Electron。                                               |
| Reserved registry    | 维护 main-process zoom、Electron menu reload/devtools、pet confirmation local shortcuts、modal Enter/Escape 等保留项。                                         |

Worker B 不应：

- 在 main process 注册普通 UI 快捷键。
- 为 V1 引入 Electron `globalShortcut`。
- 通过 preload 增加临时 `keyboard:*` ad hoc API。
- 把权限批准、删除、归档等高风险动作设为默认全局命令。

## 测试建议

| 测试层级                      | 建议覆盖                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit: accelerator             | `CtrlOrCmd` 平台展开、`Ctrl+Shift+/`、`Ctrl+[`/`]`、`+`/`-`/`0` reserved、大小写、重复 modifier、非法字符串。                                     |
| Unit: conflict registry       | 同 scope 重复、route 覆盖 app、component 覆盖 route、reserved main-process 冲突、高风险默认绑定报错或 warning。                                   |
| Unit: context guard           | `isComposing`、`defaultPrevented`、input、textarea、contenteditable、CodeMirror/Monaco marker、webview、terminal、modal open。                    |
| Integration: migration parity | 迁移后 `Ctrl/Cmd+T`、`Ctrl+Tab`、`Ctrl+Shift+Tab`、`Ctrl/Cmd+F`、`Ctrl/Cmd+Shift+F`、`Ctrl/Cmd+S` 行为与现状一致。                                |
| Integration: routing/layout   | `Ctrl/Cmd+,` 打开设置；`Ctrl/Cmd+B` 切侧栏；`Ctrl/Cmd+[`/`]` 调 navigation history；`Ctrl/Cmd+Shift+E` 只在 conversation/workspace 上下文切面板。 |
| Integration: input safety     | SendBox、slash command、文件搜索框、设置页输入框、预览编辑器中不触发 app global 命令，除非命令显式允许 editable context。                         |
| Electron/main boundary        | 缩放快捷键仍由 main process 处理；renderer registry 不消费 `Ctrl/Cmd + +/-/0`；reload/devtools 仍走 Electron menu role。                          |
| WebUI/browser mode            | 没有 `window.electronAPI` 或处于 browser/webview 时，不抢浏览器 `Ctrl+T`、`Ctrl+F`、`Ctrl+P`、`Ctrl+R`。                                          |
| Playwright smoke              | 桌面窗口中验证设置页、侧栏、导航、workspace 面板、聊天搜索弹窗；移动 viewport 下确认侧栏/设置页布局不被快捷键 UI 破坏。                           |
| Accessibility                 | `/settings/shortcuts` 可用键盘浏览；快捷键文本不溢出；禁用命令可读出原因；`Tab` 焦点顺序不被全局 handler 干扰。                                   |

## 关键结论

第一版的核心不是“多加几个默认键”，而是建立一个可证明边界的快捷键系统。默认启用只应覆盖现有行为和低风险导航/布局动作；其余候选先进入 command registry 与设置页展示，等冲突检测、上下文守卫和产品语义稳定后再开放默认绑定或用户自定义。
