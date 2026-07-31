# CSBU WorkMate

CSBU WorkMate 是供 CSBU 内部使用的 AI 日常办公工作台，用于对话协作、文档处理、文件管理、自动化任务与多智能体工作流。

## 内部使用

- 本项目仅面向 CSBU 内部环境分发。
- 桌面端、WebUI 与移动端统一使用 **CSBU WorkMate** 品牌。
- 自动更新已关闭，避免内部构建连接公共发行源；后续应接入受控的内部发布系统。
- 广告、赞助、捐赠、推广活动和 affiliate 链接均不得加入应用或文档。

## 开发

环境准备、架构和质量要求见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。常用命令：

```bash
bun install
bun run dev
bun run lint
bunx tsc --noEmit
bun run test
bun run audit:branding
```

## 同步上游

功能代码可持续从原开源项目同步，但合并时必须保留本仓库的品牌与内部发布策略：

1. 优先接受上游功能、修复和依赖更新。
2. 保留 `CSBU WorkMate` 的产品名、应用 ID、协议、图标与内部说明。
3. 不恢复公共更新源、官网/社区引流、广告、赞助、捐赠或 affiliate 内容。
4. 合并后运行 `bun run audit:branding`、i18n 校验、类型检查和测试。

内部兼容标识（例如已有环境变量、存储键、数据迁移名与后端协议名）可能继续保留，以避免破坏用户数据和上游兼容性；它们不得作为用户可见品牌展示。

## 许可证与来源

本项目基于 Apache License 2.0 授权的开源代码进行内部二次开发。原代码版权声明、第三方许可证和必要署名继续保留，详见 [LICENSE](LICENSE) 及各源文件头部。
