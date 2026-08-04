# GEAUi 文档

文档按读者意图组织，而不是按文档类型组织。根目录 `readme.md` 是开发入口；产品介绍位于 `readme/`。

| 目录                            | 面向人群       | 内容                                                                     |
| ------------------------------- | -------------- | ------------------------------------------------------------------------ |
| [`guides/`](guides)             | 用户和运维人员 | 产品的部署、测试和运行指南，包括服务器部署、WebUI、Hub 测试和 CDP 调试。 |
| [`contributing/`](contributing) | 贡献者         | 开发环境配置、文件结构约定和 PR 自动化工作流。                           |
| [`prds/`](prds)                 | 产品团队       | 由产品团队维护的正式产品需求文档。**未经产品团队同意，请勿重新组织。**   |
| [`readme/`](readme)             | 产品用户       | 简体中文及其他已支持语言的产品介绍。                                     |
| [`theming/`](theming)           | UI 贡献者      | 主题 Token 参考和主题编写指南。                                          |

## 快速索引

- 初次了解产品？请从 [`readme/readme_ch.md`](readme/readme_ch.md) 开始。
- 配置开发环境？请参阅 [`contributing/development.md`](contributing/development.md)。
- 编写代码？请从仓库根目录的 [`AGENTS.md`](../AGENTS.md) 开始，再按其中的触发条件读取专项文档。
- 部署服务器？请参阅 [`guides/deploy-server.md`](guides/deploy-server.md)。

## 新文档应该放在哪里

| 内容类型                     | 目标位置                    |
| ---------------------------- | --------------------------- |
| 面向用户或运维人员的操作指南 | `guides/`                   |
| 贡献者约定、工作流或工具规则 | `contributing/`             |
| 由产品团队负责的正式 PRD     | `prds/`（先与产品团队协调） |
| 产品介绍或翻译               | `readme/readme_<locale>.md` |
| 主题 Token 文档              | `theming/`                  |
