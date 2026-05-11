# 设置页 → 关于 & 检查更新 (F-ABOUT)

> 本文档覆盖「设置 → 关于」页面的全部功能，包括应用信息展示、版本更新（检查/下载/安装）、外部链接导航、问题报告。
> 基于静态代码分析和动态 UI 验证综合整理，经 DA 质疑和 Tester 反馈修正定稿。

---

## (F-ABOUT-01) 应用信息展示 [已实现]

**用户故事**：作为用户，我希望在关于页面看到当前应用的名称、描述和版本号，以便了解我正在使用的版本。

**正常流程**（用户视角）：

1. 用户打开「设置 → 关于」页面
2. 页面顶部居中显示应用名 "AionUi"（h3 标题）
3. 下方显示应用描述（通过 i18n 系统，随语言设置变化）
4. 显示当前版本号 badge（格式 `v{x.y.z}`），版本号来自打包时的 `package.json`
5. 版本号旁有 GitHub 图标，点击在系统浏览器中打开项目仓库 `https://github.com/iOfficeAI/AionUi`

**异常情况**：

- 版本号来自编译时内联的 `package.json`，理论上不为空；若异常为空则显示 `v`
- 外部链接打开失败：仅记录日志，无用户可见提示

**验收标准**：

- [ ] 显示应用名 "AionUi"
- [ ] 显示应用描述（通过 i18n 系统，随语言设置变化）
- [ ] 版本号格式为 `v{x.y.z}`，与 `package.json` 一致
- [ ] GitHub 图标点击打开项目仓库页面

---

## (F-ABOUT-02) 检查更新入口 [已实现]

**用户故事**：作为桌面端用户，我希望有一个明确的"检查更新"按钮，以便我主动查看是否有新版本可用。

**前置条件**：运行在 Electron 桌面端

**正常流程**（用户视角）：

1. 用户在关于页面看到"检查更新"按钮（位于版本号下方的卡片区域内）
2. 按钮下方有"包含预发布/开发版本"开关（见 F-ABOUT-03）
3. 用户点击"检查更新"按钮
4. 系统弹出更新弹窗，自动开始检查

**异常情况**：

- 非 Electron 环境（WebUI / 浏览器）：整个检查更新区域（按钮 + 开关）不渲染，用户不可见

**验收标准**：

- [ ] 仅在 Electron 桌面端显示检查更新区域
- [ ] 点击按钮后弹出更新弹窗
- [ ] 每次触发打开弹窗时，先清空所有上次检查的残留数据（版本信息、错误信息、下载进度等），然后重新开始检查

> 其他触发方式（应用菜单、启动时自动检查）见 F-ABOUT-12

---

## (F-ABOUT-03) 预发布版本开关 [已实现]

**用户故事**：作为用户，我希望可以选择是否接收预发布（beta/dev）版本的更新通知，以便提前体验新功能或保持稳定版。

**前置条件**：运行在 Electron 桌面端

**正常流程**（用户视角）：

1. 检查更新按钮下方有"包含预发布/开发版本"开关（Arco Design Switch, size=small）
2. 默认关闭
3. 用户切换开关，设置立即保存
4. 下次检查更新时生效

**技术说明**：

- 持久化到 `localStorage('update.includePrerelease')`
- UpdateModal 在打开时（visible 变为 true 时）通过 `useMemo` 从 localStorage 读取该值。弹窗已打开状态下修改开关不会立即生效，需关闭后重新打开
- electron-updater 不直接使用此标志（与自定义 channel 名冲突），预发布过滤仅由 GitHub API 手动检查路径处理

**异常情况**：

- localStorage 不可用：默认为关闭（不含预发布）
- 弹窗已打开时修改开关后点击重试：使用的仍是打开弹窗时缓存的值（已知局限，useMemo 依赖 visible）

**验收标准**：

- [ ] 开关默认关闭
- [ ] 切换后立即持久化到 localStorage
- [ ] 关闭弹窗后重新打开，检查更新使用最新设置
- [ ] 仅在桌面端可见

---

## (F-ABOUT-04) 更新检查 [已实现]

> 建议验证策略：双路径 fallback 逻辑通过单元测试验证；E2E 仅验证 checking → upToDate 流程

**用户故事**：作为用户，我希望系统能可靠地检查是否有新版本，即使某种检查方式失败也能通过备用方式完成。

**正常流程**（用户视角）：

1. 更新弹窗打开，显示"正在检查更新..."（旋转动画，约 1-2 秒）
2. 检查完毕后显示结果：
   - 已是最新版本：绿色对勾 + "已是最新版本" + 当前版本号
   - 有新版本可用：显示版本对比 + 更新日志 + 下载按钮（见 F-ABOUT-05）
   - 检查失败：红色错误图标 + 错误信息 + 重试按钮（见 F-ABOUT-08）

**内部机制 — 双路径检查**：

系统使用两种方式检查更新，**串行执行**（路径 A 先于路径 B），路径 B 始终执行：

| 路径            | 方式                                                 | 用途                                  | 执行条件             |
| --------------- | ---------------------------------------------------- | ------------------------------------- | -------------------- |
| A. Auto-update  | electron-updater（查询 GitHub Release yml）          | 支持应用内自动下载安装                | 先执行，失败静默跳过 |
| B. Manual check | GitHub REST API `GET /repos/{owner}/{repo}/releases` | 获取版本信息、release notes、下载资产 | 始终执行             |

**版本比较**：使用 semver 语义化版本比较（`semver.gt`），当前版本来自 `app.getVersion()`。

**异常情况**：

- GitHub API 超时（30 秒）：显示超时错误
- GitHub API 返回非 200 状态码：显示 API 错误 + 状态码
- GitHub API 返回格式异常：显示格式错误
- 当前版本号不是合法 semver：返回"已是最新版本"，不显示错误（已知局限：可能隐藏真实可用更新）
- auto-update 检查失败：静默跳过，继续执行 manual check
- 路径 A 超时/耗时过长时，总检查时间可能超过 60 秒（A 最长约 30s + B 最长 30s）
- 网络完全不可用：两条路径均失败，显示错误 + 重试按钮

**验收标准**：

- [ ] 路径 A 和路径 B 串行执行，路径 B 始终执行
- [ ] 路径 A 超时或失败时，路径 B 仍能正常执行并返回结果
- [ ] 版本比较使用 semver 语义化比较
- [ ] 超时后返回明确错误
- [ ] 检查结果正确区分"已是最新"和"有更新"
- [ ] 有更新时显示新版本号和 release notes
- [ ] 当 `app.getVersion()` 返回非法 semver 时，显示"已是最新版本"而非错误

---

## (F-ABOUT-05) 更新可用 — 版本信息与下载触发 [已实现]

> 建议验证策略：通过 React Testing Library 或 Storybook stories 覆盖 available 状态的 UI 渲染

**用户故事**：作为用户，当有新版本可用时，我希望看到版本号对比和更新日志，并可以一键下载/安装。

**正常流程**（用户视角）：

1. 弹窗切换到"有更新可用"状态，弹窗使用 medium 尺寸（内容高度 420px）
2. 顶部显示版本对比：`当前版本 → 新版本`（新版本号高亮）
3. 中间区域显示 release notes（Markdown 渲染，支持 HTML）
4. 右上角显示操作按钮（根据可用的更新路径不同）：
   - 场景 A — Auto-update 可用：显示"下载并安装"按钮 → 进入 F-ABOUT-06
   - 场景 B — Manual + 有兼容安装包：显示"下载"按钮 → 进入 F-ABOUT-07
   - 场景 C — Manual + 无兼容安装包：显示"前往 Release 页面"按钮 + 黄色警告提示

**平台资产自动匹配**：

系统根据当前平台和架构自动选择最佳安装包：

- 允许的扩展名：`.exe`, `.msi`, `.dmg`, `.zip`, `.deb`, `.rpm`（扩展名之外的 asset 如 `.tar.gz` 在评分前被过滤）
- 评分维度：平台关键词（+20）、架构关键词（+10/+15）、安装包格式偏好
- 格式偏好：Windows .exe > .msi > .zip；macOS .dmg > .zip；Linux .deb > .rpm > .zip
- 架构不匹配直接排除（得分 -1）

**异常情况**：

- 无 release notes：显示占位文案"暂无更新说明"
- 无兼容安装包且非 auto-update：显示黄色警告 banner + "前往 Release 页面"按钮
- release page URL 为空：不显示"前往 Release 页面"按钮
- electron-updater 返回的 releaseNotes 为非 string 类型（如结构化数组）时，release notes 从 manual check 的 body 字段获取

**验收标准**：

- [ ] 版本号对比格式正确（旧 → 新）
- [ ] Release notes 通过 Markdown 渲染
- [ ] 三种按钮场景根据条件正确切换
- [ ] 无兼容安装包时有明确的警告提示
- [ ] 弹窗在 available 状态使用 medium 尺寸，内容区域高度 420px

---

## (F-ABOUT-06) 自动更新下载与安装 [已实现]

> 建议验证策略：通过集成测试（mock autoUpdater 事件）覆盖 UI 状态切换；quitAndInstall 通过手动测试

**用户故事**：作为用户，我希望点击"下载并安装"后系统自动完成下载，并在准备就绪时提示我一键安装。

**前置条件**：electron-updater 确认有更新可用（auto-update 路径）

**正常流程**（用户视角）：

1. 用户点击"下载并安装"
2. 弹窗切换到"正在下载"状态：显示进度条、下载速度、已传输/总大小
3. 下载完成后切换到"准备安装"状态
4. 显示"立即安装"按钮
5. 用户点击"立即安装"
6. 应用退出并自动安装更新，安装完成后重新启动

**平台差异**：

- macOS：`quitAndInstall` 后 1 秒强制 `app.exit(0)`，因为 macOS 的 close-to-tray 行为会阻止 Squirrel 完成安装
- Windows / Linux：标准 `quitAndInstall` 流程

**平台 Channel 映射**（electron-updater 根据平台+架构选择对应 yml）：

| 平台 + 架构   | Channel 文件             |
| ------------- | ------------------------ |
| macOS arm64   | `latest-arm64-mac.yml`   |
| macOS x64     | `latest-mac.yml`         |
| Windows arm64 | `latest-win-arm64.yml`   |
| Windows x64   | `latest.yml`             |
| Linux x64     | `latest-linux.yml`       |
| Linux arm64   | `latest-linux-arm64.yml` |

**异常情况**：

- 下载失败（网络中断、服务器错误）：切换到 error 状态，显示错误信息 + 重试按钮
- quitAndInstall 失败：显示 toast 错误提示，弹窗保持当前状态不关闭
- 下载中关闭弹窗：下载在后台继续运行，不会被取消。重新打开弹窗时状态被重置，之前的下载进度丢失（已知局限：无取消下载机制，无恢复进度机制）

**验收标准**：

- [ ] 下载过程显示实时进度（百分比、速度、已传输/总大小）
- [ ] 下载完成后显示"立即安装"按钮
- [ ] 安装时应用正确退出并更新
- [ ] macOS 上安装流程能正确完成
- [ ] 下载/安装失败有明确错误提示

---

## (F-ABOUT-07) 手动下载更新 [已实现]

> 建议验证策略：安全机制（URL 白名单、HTTPS、重定向限制）通过单元测试覆盖；下载流程通过集成测试

**用户故事**：作为用户，当自动安装更新不可用时，我希望系统能下载安装包到本地，我手动完成安装。

**前置条件**：auto-update 路径不可用，但有兼容的 GitHub Release 安装包

**正常流程**（用户视角）：

1. 用户点击"下载"按钮
2. 弹窗切换到"正在下载"状态，显示进度条、速度、大小
3. 下载完成后切换到"下载完成"状态
4. 显示下载文件路径（路径文本可截断显示，最多 2 行）
5. 提供两个按钮："在文件夹中显示"和"打开文件"
6. 用户手动双击安装包完成安装

**安全机制**：

- URL 白名单：仅允许从以下域名下载：`github.com`, `objects.githubusercontent.com`, `github-releases.githubusercontent.com`, `release-assets.githubusercontent.com`
- 协议限制：仅 HTTPS
- 重定向安全：手动处理 HTTP 重定向，每一跳都校验白名单，最多 8 次
- 文件名清理：取 basename 并 trim，防止路径遍历

**下载位置**：系统"下载"目录（`app.getPath('downloads')`）

**异常情况**：

- URL 不在白名单：拒绝下载，显示错误
- 非 HTTPS：拒绝下载
- 重定向过多（> 8 次）：显示错误
- HTTP 非 200 响应：显示错误
- 下载中断（网络断开、用户操作）：删除部分下载的文件，显示错误
- 文件写入失败：删除部分文件，显示错误
- 下载中关闭弹窗：下载在后台继续运行，不会被取消。重新打开弹窗时状态被重置，之前的下载进度丢失（已知局限：同 F-ABOUT-06）
- 服务器未返回 Content-Length 时：进度条显示 0%，仅速度和已下载大小有意义（已知局限）

**验收标准**：

- [ ] 下载到系统"下载"目录
- [ ] 进度实时更新（250ms 节流）
- [ ] 下载完成后可"在文件夹中显示"或"打开文件"
- [ ] 仅允许从 GitHub 相关域名下载
- [ ] 部分下载的文件在失败时自动清理
- [ ] 文件名冲突追加后缀 (1) 到 (999)；若均已存在，使用时间戳后缀

---

## (F-ABOUT-08) 更新错误处理与恢复 [已实现]

> 建议验证策略：通过 React Testing Library 渲染 error 状态验证 UI；错误码覆盖通过单元测试

**用户故事**：作为用户，当更新检查或下载失败时，我希望看到有意义的错误信息，并能重试或通过备选方式获取更新。

**正常流程**（用户视角）：

1. 发生错误时，弹窗显示红色错误图标 + 错误标题
2. 下方显示具体错误信息（已 i18n 国际化）
3. 提供"重试"按钮（从头开始完整的检查流程）
4. 若已获取到 release page URL，额外提供"前往 Release 页面"按钮

**错误类型汇总**：

| 阶段 | 错误场景                   | 用户可见信息             |
| ---- | -------------------------- | ------------------------ |
| 检查 | GitHub API 网络超时（30s） | 超时错误提示             |
| 检查 | GitHub API HTTP 错误       | API 错误 + 状态码        |
| 检查 | API 返回格式异常           | 格式错误提示             |
| 下载 | URL 不在允许列表           | 域名不允许               |
| 下载 | 非 HTTPS 协议              | 仅支持 HTTPS             |
| 下载 | 重定向次数过多             | 重定向错误               |
| 下载 | 服务器返回错误             | 下载失败 + 状态码        |
| 下载 | 网络中断/取消              | 下载失败/已取消          |
| 安装 | quitAndInstall 失败        | Toast 提示（不影响弹窗） |

**验收标准**：

- [ ] 所有错误显示用户可读的 i18n 提示
- [ ] 重试按钮从头开始完整检查流程
- [ ] 有 release URL 时提供"前往 Release 页面"备选
- [ ] 安装失败以 toast 提示，不阻塞弹窗操作

---

## (F-ABOUT-09) 更新弹窗状态机 [已实现]

**用户故事**：作为用户，我希望更新弹窗在每个阶段都有清晰的视觉反馈，让我知道当前进展。

**状态流转**：

```
[打开弹窗]
    │
    ▼
 checking ──────────────┬──────────────┐
    │                   │              │
    ▼                   ▼              ▼
 upToDate           available        error ←─── [重试]
                       │               ▲
                       ▼               │
                   downloading ────────┘
                    │      │
                    ▼      ▼
               downloaded  success
                    │         │
                    ▼         ▼
               [安装退出]  [打开文件]
```

**各状态 UI 表现**：

| 状态        | 图标     | 弹窗尺寸               | 主要内容                                  |
| ----------- | -------- | ---------------------- | ----------------------------------------- |
| checking    | 旋转动画 | small                  | "正在检查更新..."                         |
| upToDate    | 绿色对勾 | small                  | "已是最新版本" + 当前版本号               |
| available   | 蓝色下载 | medium, 内容高度 420px | 版本对比 + release notes + 操作按钮       |
| downloading | 弹跳下载 | small                  | 进度条 + 速度 + 大小                      |
| downloaded  | 绿色对勾 | small                  | "准备安装" + 安装按钮（auto-update 路径） |
| success     | 绿色对勾 | small                  | 下载路径 + 打开/显示按钮（manual 路径）   |
| error       | 红色叉号 | small                  | 错误信息 + 重试 + 前往 Release            |

**关键区分**：

- `downloaded`：auto-update 路径专用，用户点击"立即安装"后应用退出并安装
- `success`：manual 路径专用，用户点击"打开文件"或"在文件夹中显示"后手动安装

**已知局限**：

- downloading 状态关闭弹窗：下载继续在后台运行，无取消机制。重新打开弹窗时所有状态被重置，之前的下载进度和 downloadId 丢失

**验收标准**：

- [ ] 7 个状态各有独立 UI 表现
- [ ] 状态切换时不出现非预期中间状态的短暂闪现
- [ ] available 状态弹窗使用 medium 尺寸
- [ ] error 状态始终提供重试按钮
- [ ] downloading 状态关闭弹窗后，重新打开弹窗时状态从 checking 重新开始

---

## (F-ABOUT-10) 外部链接导航 [已实现]

**用户故事**：作为用户，我希望在关于页面快速访问帮助文档、更新日志、反馈渠道等外部资源。

**正常流程**（用户视角）：

1. 关于页面下半部分显示 6 个链接项，每项有标题和右箭头图标
2. 鼠标悬停时有背景色变化（hover 效果）
3. 点击打开对应链接或弹窗

**链接列表**：

| 序号 | 标题     | 行为               | 目标                                           |
| ---- | -------- | ------------------ | ---------------------------------------------- |
| 1    | 帮助文档 | 打开外部链接       | `https://github.com/iOfficeAI/AionUi/wiki`     |
| 2    | 更新日志 | 打开外部链接       | `https://github.com/iOfficeAI/AionUi/releases` |
| 3    | 意见反馈 | 打开外部链接       | `https://github.com/iOfficeAI/AionUi/issues`   |
| 4    | 问题报告 | **打开应用内弹窗** | FeedbackReportModal（见 F-ABOUT-11）           |
| 5    | 联系我   | 打开外部链接       | `https://x.com/WailiVery`                      |
| 6    | 官网     | 打开外部链接       | `https://www.aionui.com`                       |

**打开机制**：

- Electron：通过 IPC 调用 `shell.openExternal`，在系统默认浏览器中打开
- WebUI：通过 `window.open(url, '_blank', 'noopener,noreferrer')` 打开

**已知问题**：

- "问题报告"（打开应用内弹窗）与其他外部链接项在视觉上完全相同，用户无法从外观区分行为差异
- 外部链接打开后无任何视觉反馈（无 toast、无状态变化），如果打开失败仅记录日志（console.log 或 console.error），无用户可见提示

**异常情况**：

- 链接打开失败（IPC 调用失败、系统无默认浏览器）：仅记录日志（console.log 或 console.error），无用户提示

**验收标准**：

- [ ] 6 个链接项全部可点击且行为正确
- [ ] Electron 环境在系统浏览器中打开
- [ ] WebUI 环境在新标签页中打开
- [ ] 各链接显示 i18n 化的文案

---

## (F-ABOUT-11) 问题报告 [已实现]

**用户故事**：作为用户，我希望可以直接在应用内提交问题报告，附带截图和描述，无需离开应用去 GitHub Issues。

**正常流程**（用户视角）：

1. 用户在关于页面点击"问题报告"
2. 弹出问题报告弹窗（标题"问题报告"）
3. 选择所属模块（必填，15 个模块可选，选择后显示模块描述）
4. 填写问题描述（必填，最多 2000 字符，显示字数统计）
5. 可选：上传截图（最多 3 张）
   - 支持点击选择文件
   - 支持拖拽到上传区域
   - 支持 Ctrl/Cmd+V 粘贴（弹窗可见时全局监听 paste 事件）
   - 支持格式：PNG、JPG、GIF
   - 重复文件自动去重（基于文件名+大小）
6. 点击"提交"（模块和描述均填写后按钮可用）
7. 系统自动附加最近 3 天的应用日志（gzip 格式）
8. 提交到 Sentry（level: info, tag: user-feedback + module）
9. 显示成功 toast，表单重置并关闭弹窗

**反馈模块列表**（15 个）：

| 模块名称           | Sentry Tag           |
| ------------------ | -------------------- |
| Agent 检测与连接   | agent-detection      |
| 助手与预设         | assistant-preset     |
| 模型与认证         | model-auth           |
| MCP 与工具         | mcp-tools            |
| 技能与插件         | skills-plugin        |
| 频道接入           | channel              |
| 对话与会话         | conversation-session |
| 搜索与历史         | search-history       |
| 工作区、文件与预览 | workspace-preview    |
| WebUI 与远程连接   | webui-remote         |
| 定时任务           | scheduled-task       |
| 团队协作           | agent-team           |
| 显示与桌宠         | display-desktop      |
| 系统设置           | system-settings      |
| 其他               | other                |

**异常情况**：

- 日志收集失败：静默忽略，继续提交（非阻塞）
- `electronAPI` 不存在（WebUI 环境）：跳过日志收集，仍可提交
- Sentry SDK 未初始化或网络不可用：提交失败，在弹窗内显示红色错误 banner
- 截图超过 3 张：超出部分被忽略
- 粘贴无名文件：自动生成文件名 `pasted-screenshot-{timestamp}-{index}.{ext}`
- 上传超大文件（如 >10MB）：可能导致内存压力或 Sentry 提交失败（已知局限：无文件大小校验）

**验收标准**：

- [ ] 模块和描述为必填，未填时提交按钮禁用
- [ ] 截图最多 3 张，支持拖拽 + 选择 + 粘贴三种方式
- [ ] 描述最多 2000 字符，显示字数统计
- [ ] 提交成功后表单重置并关闭弹窗，显示成功 toast
- [ ] 提交失败在弹窗内显示错误信息（非 toast）
- [ ] 应用日志自动附加（失败不阻塞提交）
- [ ] 取消或关闭弹窗时表单重置

---

## (F-ABOUT-12) 更新弹窗的其他触发方式与启动自动检查 [已实现]

> 建议验证策略：通过集成测试（mock autoUpdater 事件）验证；E2E 无法覆盖

**用户故事**：作为用户，我希望除了关于页面按钮外，还能通过应用菜单触发检查更新；同时希望应用启动时自动检查是否有新版本。

**触发方式汇总**：

| 触发方式       | 机制                                                 | 备注               |
| -------------- | ---------------------------------------------------- | ------------------ |
| 关于页面按钮   | 渲染进程 CustomEvent                                 | 见 F-ABOUT-02      |
| 应用菜单       | IPC `ipcBridge.update.open.emit({ source: 'menu' })` | 主进程 → 渲染进程  |
| 启动时自动检查 | `autoUpdater.checkForUpdatesAndNotify()`             | 非阻塞，不影响启动 |

**启动时自动检查**：

1. 应用启动时在后台自动检查更新（非阻塞，不影响启动速度）
2. 启动检查前重置 `allowDowngrade = false`，防止前次预发布设置残留
3. 若有新版本可用，状态事件通过 IPC broadcast 到渲染进程，UpdateModal 自动弹出
4. 若没有新版本或检查失败，无任何用户可见行为

**异常情况**：

- 启动检查失败（网络不可用等）：仅记录日志，不影响应用正常使用
- 启动自动检查与用户手动检查并发时：两组事件可能互相干扰，启动检查的 `available` 事件可能在手动检查的 `checking` 状态中到达，导致显示不完整信息（已知局限）

**验收标准**：

- [ ] 应用菜单可触发更新弹窗
- [ ] 应用启动时自动检查更新（后台非阻塞）
- [ ] 有更新时自动弹出 UpdateModal
- [ ] 无更新或检查失败时无任何用户可见影响
- [ ] 启动检查失败不影响应用正常运行

---

## 附录 A：IPC 通信链路

```
┌─────────────────────────────────────────────────────────┐
│ 渲染进程 (Renderer)                                      │
│                                                          │
│  AboutModalContent                                       │
│    ├─ CustomEvent('aionui-open-update-modal')            │
│    └─ localStorage('update.includePrerelease')           │
│                                                          │
│  UpdateModal                                             │
│    ├─ ipcBridge.autoUpdate.check.invoke()   → 检查(auto) │
│    ├─ ipcBridge.update.check.invoke()       → 检查(manual)│
│    ├─ ipcBridge.autoUpdate.download.invoke()→ 下载(auto) │
│    ├─ ipcBridge.update.download.invoke()    → 下载(manual)│
│    ├─ ipcBridge.autoUpdate.quitAndInstall.invoke() → 安装│
│    ├─ ipcBridge.autoUpdate.status.on()      ← 状态事件   │
│    └─ ipcBridge.update.downloadProgress.on()← 下载进度   │
│                                                          │
│  FeedbackReportModal                                     │
│    ├─ electronAPI.collectFeedbackLogs()     → 收集日志   │
│    └─ Sentry.captureEvent()                 → 提交反馈   │
└────────────────────┬────────────────────────────────────┘
                     │ IPC Bridge
┌────────────────────▼────────────────────────────────────┐
│ 主进程 (Main)                                            │
│                                                          │
│  updateBridge.ts                                         │
│    ├─ update.check.provider → GitHub REST API            │
│    ├─ update.download.provider → allowlisted download    │
│    ├─ autoUpdate.check.provider → autoUpdaterService     │
│    ├─ autoUpdate.download.provider → autoUpdaterService  │
│    └─ autoUpdate.quitAndInstall.provider → quit+install  │
│                                                          │
│  autoUpdaterService.ts (Singleton)                       │
│    └─ electron-updater → broadcastStatus → IPC emit      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 外部服务                                                 │
│  ├─ GitHub REST API (releases 列表)                      │
│  ├─ GitHub Release Assets (安装包下载)                   │
│  ├─ electron-updater yml (latest*.yml)                   │
│  └─ Sentry (反馈事件)                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 附录 B：已知局限汇总

| #   | 功能点        | 局限描述                                                   |
| --- | ------------- | ---------------------------------------------------------- |
| 1   | F-ABOUT-03    | 弹窗已打开时修改预发布开关不会立即生效（useMemo 缓存）     |
| 2   | F-ABOUT-04    | 当前版本非法 semver 时静默返回"已是最新"，可能隐藏真实更新 |
| 3   | F-ABOUT-04    | 双路径串行执行，路径 A 超时会导致总耗时超过 60 秒          |
| 4   | F-ABOUT-06/07 | 下载中关闭弹窗无取消机制，重开后进度丢失                   |
| 5   | F-ABOUT-07    | 服务器未返回 Content-Length 时进度条显示 0%                |
| 6   | F-ABOUT-10    | "问题报告"与外部链接视觉无差异；链接打开失败无用户提示     |
| 7   | F-ABOUT-11    | 截图无文件大小限制，超大文件可能导致内存压力或 Sentry 拒绝 |
| 8   | F-ABOUT-12    | 启动自动检查与手动检查并发时事件可能互相干扰               |
