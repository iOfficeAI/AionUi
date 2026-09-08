# OpenAPI 接口文档使用指南

接口信息从 AionUi 客户端源码自动生成，但目前需要手动运行命令更新，没有源码变更监听。无需手工填写或修改生成的 OpenAPI 文件，也无需启动 AionCore。

## 通过 Codex 操作

本仓库提供 `aionui-api-docs` 项目技能，可在支持项目技能的 Codex 环境中直接说：

- “更新 AionUi 接口文档”：重新扫描源码并生成文件。
- “打开 AionUi 接口 UI”：核实并复用已有文档服务，或启动服务后打开页面。
- “更新接口文档并打开 UI”：重新生成并打开最新结果。

也可以显式使用 `$aionui-api-docs`。技能位于仓库的 `.agents/skills/aionui-api-docs/`，随仓库维护，仅针对 AionUi。它代为执行下面的命令，不增加自动监听。

## 首次启动与打开 UI

在 AionUi 仓库根目录执行：

```bash
bun install --frozen-lockfile
bun run api:docs --serve --port 8088
```

在浏览器打开 [Scalar 接口 UI](http://127.0.0.1:8088)。保持终端运行，按 `Ctrl+C` 停止服务。后续依赖未变化时，可省略安装步骤。

如果端口被占用，可换一个端口，例如：

```bash
bun run api:docs --serve --port 8089
```

使用终端打印的地址打开 UI。服务仅监听本机 `127.0.0.1`；无需直接双击生成的 HTML 文件。

## 修改接口后如何更新

1. 修改客户端源码中的接口调用、参数或 TypeScript 类型。
2. 在旧文档服务的终端按 `Ctrl+C` 停止服务。
3. 在仓库根目录重新执行：

   ```bash
   bun run api:docs --serve --port 8088
   ```

4. 命令完成扫描并打印访问地址后，刷新浏览器页面。

每次启动都会重新扫描当前 checkout 的源码并生成文档。不要求先提交代码；仅后端新增、客户端尚未调用的接口不会自动进入这份清单。

如果只需要更新文件，不启动 UI：

```bash
bun run api:docs
```

## 查看 HTTP 与 WebSocket 信息

Scalar UI 展示 HTTP 接口，可切换服务来源、搜索接口、展开模型和下载 OpenAPI。页面用于文档查阅，已关闭请求执行按钮。

使用端口 `8088` 启动后，也可以直接查看：

- [HTTP 调用清单](http://127.0.0.1:8088/inventory.md)
- [WebSocket 清单](http://127.0.0.1:8088/websocket.md)：连接、发送、订阅和消息处理器，目前没有专用交互 UI。
- [OpenAPI 导出诊断](http://127.0.0.1:8088/export-diagnostics.json)：查看因路径未知或类型冲突而未导出的记录。

生成文件位于仓库根目录的 `.workspace/api-docs/`，已被 Git 忽略。手动修改这些文件会在重新生成时被覆盖，应修改源码后再生成。

## 当前范围

这是客户端使用视角的接口文档，不是服务端全部接口的权威契约。静态扫描不能确定的信息会保留为 `partial` 或 `unknown`，因此 HTTP 清单条数不一定等于 UI 中的操作数。移动端 Axios 与专用 Bridge 封装仍未覆盖。

扫描规则、产物说明和验证命令见[客户端接口参考](../integrations/client-api-reference.zh-CN.md)。
