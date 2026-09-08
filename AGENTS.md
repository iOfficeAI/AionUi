# AionUi 项目约定

## 项目事实

- AionUi 是 Electron、WebUI 和移动端的产品与编排层；Agent 运行时、业务 API 和主数据由外部 AionCore 提供。
- 桌面入口是 `packages/desktop/src/index.ts`；前端在 `packages/desktop/src/renderer/`；仅原生能力经 `packages/desktop/src/preload/` 连接。
- 业务调用经 `packages/desktop/src/common/adapter/` 的 HTTP/WS 契约完成；不要为后端业务新增绕过该层的 Electron IPC。

## 高风险约束

- Main 进程只能使用 Node.js/Electron Main API；Renderer 只能使用浏览器/React API。跨进程能力只能经 preload 暴露。
- 新增或修改的用户可见文本必须使用 i18n key；新 UI 优先复用项目已有业务组件与封装，其次使用 `@arco-design/web-react`，禁止新增原生交互元素。布局、间距和交互状态沿用同类页面的现有风格，颜色使用语义 Token 或 CSS 变量。
- 开始代码修改、Git 操作或全量门禁前，确认当前 checkout、branch、upstream、worktree 和 dirty/untracked 状态；无关改动可能被扫描或修改时，改用隔离 worktree。
- 创建工作树使用 `$worktree-lifecycle-guidance`。仅在本任务需要 CodeGraph 调用链或影响分析时建立或更新目标索引，不复制其他工作树的 `.codegraph`。
- 源文档已有 `*.zh-CN.md` 对应版本时，修改源文档必须同步更新译文；命令、路径、URL、环境变量和代码块保持可执行。

## 条件资料

- 创建、移动或拆分文件/模块时，阅读 [文件与目录结构](docs/contributing/file-structure.zh-CN.md) 的相关章节。
- 运行 Electron E2E 时读 [E2E 测试指南](tests/e2e/README.zh-CN.md) 的“快速开始”；编写测试读“编写测试”，运行态缺陷复现按症状查“故障排除”。UI、IPC、启动验收保留本次所需的真实客户端证据。
- 修改开发脚本、构建/发布链或 PR 规则时，阅读 [贡献指南](CONTRIBUTING.zh.md) 的对应章节；普通业务修改不因此预读整份指南。
- 修改 WebUI、AionCore 启动或本地后端配置时，阅读 [开发指南](docs/contributing/development.zh-CN.md) 的对应章节。

## Agent skills

### Issue tracker

管理 `CleverC2200/AionUi` 的 Issue、依赖或 PR 关闭关系时，按 [Issue tracker](docs/agents/issue-tracker.md) 读取对应章节；Wayfinding 操作仅在处理地图与决策票时读取。

### Triage labels

分类或管理标签时，按 [Triage labels](docs/agents/triage-labels.md) 使用既有角色映射。

### Domain docs

采用 single-context：根目录 `CONTEXT.md` + `docs/adr/`；新增或修改领域术语、状态权威、跨模块契约或 ADR 时，阅读 [Domain docs](docs/agents/domain.md)。

## 验证与交付

- 跨包契约、依赖、平台边界和发布改动补齐对应门禁，不弱化断言或 required checks；定向验证与记录复用遵循全局约定。
- 普通构建只编译客户端；用户要求安装包时才打包，本地默认本机架构。正式发布也只交付 macOS DMG 与 Windows NSIS EXE，不生成 ZIP 或附带 Linux/Web CLI 包，除非用户明确要求；同步维护发布校验、上传、重试和更新元数据。
- 只有用户明确要求时才推送。泛称 push、publish 或创建 PR 时默认目标是 `origin` 个人 Fork，并在执行前说明 push remote 与 PR base；官方/upstream 目标必须由用户明确指定。推送前使用 `just push`，不要直接执行 `git push`。
- `docs/` 只保存长期有效、由团队维护的当前事实：已确认的集成说明放入 `docs/integrations/`，已冻结接口放入 `docs/specs/`，长期架构决策放入 `docs/adr/`。
- 调查草稿、技术计划、PRD、设计验收、可行性研究、执行记录、验收 HTML 和截图默认放入已忽略的 `.workspace/docs/<主题>/<日期>/`；PR 前只提炼长期有效结论，只有用户明确授权对应内容和范围时才纳入公共 push 或 PR。不得通过忽略 `docs/**` 或削弱门禁隐藏过程文件。
- 用户明确要求提交 PR 时，默认创建个人 Fork 的 Ready for review PR，并按 [贡献指南](CONTRIBUTING.zh.md) 的“Agent 管理的 PR 跟进”持续处理检查、审查、修复和合并；官方/upstream PR 或合并仍需用户明确指定。
- Commit 和 PR 标题使用英文 Conventional Commit 格式；不得添加 AI 签名。
