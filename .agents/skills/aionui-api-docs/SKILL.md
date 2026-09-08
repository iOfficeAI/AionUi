---
name: aionui-api-docs
description: 更新 AionUi 客户端 HTTP/OpenAPI/WebSocket 文档，或启动、复用并打开本地 Scalar 接口 UI。适用于“更新接口文档”“打开接口 UI”；不用于修改业务接口或操作其他项目的 OpenAPI。
---

# AionUi 接口文档

完成用户要求的生成或打开操作，返回实际可用地址。复用仓库 `scripts/api-docs/cli.ts`，不手改生成产物，不隐含提交、推送或部署。

## 确定源码与运行目录

- 优先使用用户指定 checkout，其次当前 AionUi checkout；不在项目中时使用本技能所在的 AionUi 仓库根目录。核实 Git 根、分支及 `package.json` 的 `api:docs` 命令，避免读到另一工作树的旧源码。
- 使用目标仓库 `docs/guides/openapi.md` 的操作说明；缺失时读 `docs/integrations/client-api-reference.zh-CN.md`。只有排查扫描边界才深入读取扫描实现。
- 依赖可用则直接执行。缺依赖时优先复用已验证、扫描脚本与依赖版本一致的 AionUi 运行目录，通过 `bun run api:docs --root <目标仓库绝对路径>` 明确源码目标；否则在目标仓库执行 `bun install --frozen-lockfile`，保留用户改动，不更新锁文件解决失败。
- 输出默认属于目标仓库的 `.workspace/api-docs/`。自定义 `--out` 时传绝对路径；它相对进程工作目录解析，与 `--root` 不同。

## 更新与打开

- **更新接口文档**：执行 `bun run api:docs`（跨工作树运行时加 `--root`），等进程成功退出，核对生成摘要和产物。只要求更新时不额外启动浏览器。
- **打开接口 UI**：先检查本机文档服务。通过监听进程的命令、工作目录与输出目录确认服务属于目标源码；仅端口响应或页面标题相同不足以确认归属。可复用匹配服务打开现有文档，并说明未重新生成。
- **更新并打开**：重新生成；若复用服务，核对它能提供最新 `documents.json` 中每份 OpenAPI。当前服务启动时固定文件白名单，新增服务目标可能产生新文件，因此不能只刷新旧页面就认定更新完成。
- 没有匹配服务，或旧服务不能提供全部新产物时，使用支持保活的终端会话运行 `bun run api:docs --serve --port 8088`（必要时加 `--root`）。该命令先生成再启动。端口占用时使用 `--port 0` 并读取实际地址；不终止不明进程。只有确认归属的本任务旧文档服务才可停止或重启。
- 不硬编码历史临时端口。探测实际地址的首页、`documents.json` 及其 OpenAPI 资源成功后，用可用的 Codex 浏览器打开工具打开页面；不可用则给可点击链接。不要仅声称“已打开”。
- WebSocket 使用同服务的 `/websocket.md` 或 `/websocket.json`；HTTP 总览使用 `/inventory.md`。Scalar 本身没有专用 WebSocket 交互页。

## 完成证据

更新报告目标 checkout、生成是否成功，以及 unknown/未导出记录；打开报告实际 URL、服务是否复用。正常使用不重跑全量测试；页面异常时按需运行仓库 `api:docs:smoke` 或浏览器检查。

这是手动触发、源码自动生成的客户端视角文档，没有后台监听。只在后端新增但客户端未调用的接口不会自动出现，未知字段和类型冲突仍保留诊断。页面不执行业务请求；不能据此声称真实后端验收通过。
