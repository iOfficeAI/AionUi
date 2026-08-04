# GEAUi 开发指南

本仓库是 GEAUi 的桌面端、WebUI 与移动端工程。它负责界面、桌面原生能力和 GEACore 生命周期编排；实际的 Agent 运行时、业务 API 和主要数据存储由 GEACore 提供。

## 产品介绍

产品功能和多语言介绍已移至 [`docs/readme/`](docs/readme/)：

- [简体中文产品介绍](docs/readme/readme_ch.md)
- [其他语言版本](docs/readme/)
- [官方发布页](https://github.com/iOfficeAI/AionUi/releases)

## 开发前置条件

- Node.js 22 或更高版本
- bun
- Rust stable + Cargo（构建本地 GEACore）
- Python 3.11+（原生模块编译）

完整的系统要求、平台命令和故障排查请阅读 [开发指南](docs/contributing/development.zh-CN.md)。

## 快速启动

建议将两个仓库放在同一级目录：

```text
workspace/
├── AionCore/
└── AionUi/
```

1. 在 `AionCore` 构建并安装 `aioncore`，确保当前终端可执行 `aioncore --help`。
2. 在本仓库安装依赖并启动桌面端：

```bash
bun install
bun run start
```

GEAUi 会自动启动 GEACore，并将后端端口传给渲染进程。无需单独启动后端服务。

## 常用命令

| 目标               | 命令                   |
| ------------------ | ---------------------- |
| 启动桌面开发环境   | `bun run start`        |
| 启动 WebUI         | `bun run webui`        |
| 构建 Electron 产物 | `bun run package`      |
| 格式检查           | `bun run format:check` |
| Lint               | `bun run lint`         |
| 单元测试           | `bun run test`         |
| E2E 测试           | `bun run test:e2e`     |

E2E 运行前需要已构建应用，且执行测试的终端必须能在 `PATH` 中找到 `aioncore`。详见 [E2E 测试指南](tests/e2e/README.zh-CN.md)。

## 目录导航

| 位置                 | 职责                                       |
| -------------------- | ------------------------------------------ |
| `packages/desktop/`  | Electron 主进程、Preload 与 React Renderer |
| `packages/web-host/` | WebUI 静态托管、反向代理和后端生命周期     |
| `packages/web-cli/`  | 独立 WebUI CLI                             |
| `mobile/`            | Expo/React Native 客户端                   |
| `docs/`              | 开发、运行、产品需求和产品介绍文档         |
| `tests/`             | 单元、集成和 E2E 测试                      |

完整目录约定见 [文件与目录结构](docs/contributing/file-structure.zh-CN.md)，全部文档入口见 [docs 索引](docs/README.zh-CN.md)。

## 贡献

提交前请阅读 [贡献指南](CONTRIBUTING.zh.md) 和 [项目约定](AGENTS.md)。仅在用户明确要求推送时，使用 `just push` 完成预推送检查与推送。

## 许可证

[Apache-2.0](LICENSE)
