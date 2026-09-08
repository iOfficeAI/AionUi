# 客户端接口参考

开发期扫描器通过 ts-morph 读取 AionUi 的 TypeScript 源码，生成可追溯的客户端调用清单和本地 Scalar 文档，无需启动应用或连接 AionCore。产物属于客户端使用视角，不能替代服务端权威契约。

## 运行

```sh
bun install --frozen-lockfile
bun run api:docs
bun run api:docs --serve
bun run api:docs --serve --port 8088
```

默认输出到 Git 已忽略的 `.workspace/api-docs`。`--root` 指定读取的 checkout，`--out` 指定输出目录。服务器仅监听 `127.0.0.1`，打印访问地址，通过 Ctrl+C 停止；只提供生成的文档资源，不开放源码目录。Scalar 资源来自锁定版本的本地开发依赖，无需 CDN 或外部代理。

## 产物

| 文件                                      | 用途                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `inventory.json`                          | HTTP 清单、参数、请求 Schema、客户端响应 Schema、源码位置、扫描范围及诊断 |
| `inventory.md`                            | 人工核对的 HTTP 总览                                                      |
| `openapi.json`                            | AionCore 的客户端视角 OpenAPI 3.1                                         |
| `openapi-N.json`、`documents.json`        | 其他已知服务目标的独立文档与 Scalar 来源选择器                            |
| `export-diagnostics.json`                 | 因路径未确定或类型冲突而未导出的记录                                      |
| `websocket.json`、`websocket.md`          | 独立的连接、发送、订阅和消息处理器清单                                    |
| `index.html`、`scalar.js`、`reference.js` | 本地 Scalar 文档                                                          |

文档关闭请求执行按钮、认证持久化、遥测、AI 助手和开发者发布工具；加载页面不发送业务请求，不导入后端认证或运行凭据。首版使用 JSON／Markdown 核对，没有专用 Arco 页面。

## 证据与边界

- 扫描指定 checkout 中存在的 desktop、web-host、web-cli、mobile 源码目录。HTTP 调用发现排除声明文件、测试／样例、依赖及传输实现内部；输出记录范围和排除规则。
- 根据符号来源识别现有 HTTP Bridge 工厂和浏览器／Electron fetch 调用；支持追踪最多三层直线返回式封装，不把其他模块的同名函数当作 Bridge。
- 静态解析常量、简单模板、编码后的路径参数、别名与支持的参数替换。条件目标、可变值、复杂 Query 构造器和不支持的表达式明确保留为未知，不执行任意程序，也不做无界数据流分析。
- 只按已知服务目标、方法和路径归并，保留调用位置；不同服务目标导出独立 OpenAPI。客户端 Schema 冲突保留在清单中，并跳过 OpenAPI 导出。
- `resolved` 表示已提取支持的客户端字段；`partial` 表示路由已知但部分客户端字段缺失或冲突；`unknown` 表示方法或目标／路径未确定。均不证明服务端行为。候选记录包含封装展开，不代表覆盖率或全部服务端接口数。
- `httpRequest<T>` 会对服务端响应解包，泛型表示客户端得到的值。因此文档使用 `x-client-response-schema` 和独立组件模型，不虚构原始 HTTP 响应体或成功状态码；`default` 响应说明这一边界。不推断 Query 必填性、鉴权或服务端错误 Schema。
- Schema 提取最多递归五层，不支持的类型保守留空，保留完整客户端类型表达式。只有传输实现或请求头能证明媒体类型时，才导出请求体媒体类型。
- WebSocket Bridge 订阅和已识别类型的 socket 发送独立于 HTTP。映射后载荷标注为客户端投影；动态事件名和连接归属保留未知。消息处理器单独列示，不从任意处理逻辑中猜测业务事件；排除本地 stub emitter。
- 扫描产物可能包含源码表达式和接口结构，未经明确授权保持本地。已有冻结 OpenAPI 契约保持不变。

Electron fetch 支持导入别名和 `require('electron')` 绑定。显式 URL 输入、`Promise<Response>` 输出的注入函数作为 fetch 契约候选，并标记 `injected-fetch-contract`，不证明实际网络执行。数值加法与字符串拼接按类型区分；对象存在别名、逃逸或不支持的写入时，路径保守留为未知。归并后的状态按完整诊断重新计算。

WebSocket 接收入口同时识别 `addEventListener('message', ...)` 与 `onmessage` 处理器赋值，排除清理时赋空值。具备完整处理器、发送和关闭方法的结构化 WebSocket 契约标记为 `injected-websocket-contract` 候选，不推断实际注入实现。移动端 Axios 与专用 Bridge 封装尚未覆盖；扫描目录不等于支持其中全部传输形态。

## 验证

```sh
bun run api:docs:check
bunx vitest run tests/unit/api-docs/scan.test.ts
bun run api:docs:smoke --url http://127.0.0.1:8088 --channel chrome
```

测试通过生成入口输入源码样例，检查 JSON、Markdown 和经过规范校验的 OpenAPI，覆盖别名、封装、参数、服务区分、可变／条件路径、冲突及 WebSocket 清单。浏览器验收另行检查生成的本地 Scalar 页面能否加载，以及是否产生业务或外部请求。服务端集成和真实业务验收单独执行。
