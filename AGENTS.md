# AionUi 项目约定

## 项目事实

- AionUi 是 Electron、WebUI 和移动端的产品与编排层；Agent 运行时、业务 API 和主数据由外部 AionCore 提供。
- 桌面入口是 `packages/desktop/src/index.ts`；前端在 `packages/desktop/src/renderer/`；仅原生能力经 `packages/desktop/src/preload/` 连接。
- 业务调用经 `packages/desktop/src/common/adapter/` 的 HTTP/WS 契约完成；不要为后端业务新增绕过该层的 Electron IPC。

## 高风险约束

- Main 进程只能使用 Node.js/Electron Main API；Renderer 只能使用浏览器/React API。跨进程能力只能经 preload 暴露。
- 新增或修改的用户可见文本必须使用 i18n key；新 UI 优先复用项目已有业务组件与封装，其次使用 `@arco-design/web-react`，禁止新增原生交互元素。布局、间距和交互状态沿用同类页面的现有风格，颜色使用语义 Token 或 CSS 变量。
- 保持变更聚焦。不得因当前改动顺带清理既有目录结构或单文件目录问题，也不要改动不属于本次任务的脏文件。
- 源文档已有 `*.zh-CN.md` 对应版本时，修改源文档必须同步更新译文；命令、路径、URL、环境变量和代码块保持可执行。

## 条件资料

- 创建、移动或拆分文件/模块时，阅读 [文件与目录结构](docs/contributing/file-structure.zh-CN.md)。
- 修改运行行为、修复缺陷或新增测试时，阅读 [E2E 测试指南](tests/e2e/README.zh-CN.md) 中相关部分，并运行与改动最接近的检查。
- 修改开发、构建、发布或 PR 流程时，阅读 [贡献指南](CONTRIBUTING.zh.md)。
- 修改 WebUI、AionCore 启动或本地后端配置时，阅读 [开发指南](docs/contributing/development.zh-CN.md)。

## 验证与交付

- 行为变更至少运行相关测试或静态检查；未运行时说明原因和风险边界。
- 只有用户明确要求时才推送。推送前使用 `just push`，不要直接执行 `git push`。
- Commit 和 PR 标题使用英文 Conventional Commit 格式；不得添加 AI 签名。
