# 在 AionUi 中连接百智云浏览器

[百智云浏览器](https://baizhibrowser.cloud/zh/)（Baizhi Cloud Browser，也即 CapyBrowser）提供托管 MCP，管理云浏览器运行、保存的浏览器状态、人工交接和下载。网页导航、点击和读取还需要智能体已有兼容 CDP 客户端；本连接不会自动安装页面操作客户端。

浏览器启动和运行计费。调用创建运行的工具前，先核对账号与当前价格。禁用 MCP 或关闭 AionUi 不会结束已有云端运行。

## 导入连接

1. 按[接入指南](https://capybrowser.app.baizhi.cloud/docs/installation.md)取得适用的浏览器 Key。百智云浏览器与 Baizhi Cloud Agent Toolkit 是独立服务，不假定 Toolkit 应用专用 Key 通用。
2. 打开[可导入 JSON](baizhi-cloud-browser.json)，在本地用完整浏览器 Key 替换 `REPLACE_WITH_BROWSER_KEY`。保留一个 `Bearer` 前缀及其后的空格。`headers` 对象写法是 `"Authorization": "Bearer 自己的Key"`，不要把 Cherry 文本框的 `Authorization=Bearer ...` 整行填到值里。此远程连接不需要 npm 安装命令或 OAuth 流程。
3. 在设置中进入 MCP 管理，选择【添加 MCP】→【从 JSON 导入】，粘贴包含顶层 `mcpServers` 的完整对象。仅导入这一个条目，保留其他服务器。若已有同名连接，先核对并编辑原条目，不要盲目覆盖。
4. 保存后检查连接测试和发现的工具。当前界面的 JSON 导入会启用连接并开始发现测试。模板没有自动创建云运行的命令；连接/发现与批准智能体调用计费工具是不同步骤。发现目录不代表全部工具可用，也不代表已具备完整网页任务能力。

导入器接受 `streamable_http`，会归一化为后端 `http` 传输。远程地址保持 `https://capybrowser.app.baizhi.cloud/mcp`。认证失败先检查地址、Key 适用范围和完整请求头，不要用反复创建运行来测试认证。

不要分享真实 Key、含 Key 的配置导出或截图。交给智能体使用前，检查所选智能体的工具权限，保留对创建运行、写入和计费操作的人工确认。各智能体的权限与页面操作客户端需另行配置，发现 MCP 工具不能替代这两项。

## 更换 Key、禁用或移除

编辑请求头前先禁用该条目，替换 Key、保存并检查发现结果，再按需启用。不再使用时关闭开关；需要删除时只移除 `baizhi-cloud-browser`，保留无关连接。这些动作都不会撤销云端 Key，也不会停止云端计费。

任务完成后，通过浏览器服务工具或[控制台](https://capybrowser.app.baizhi.cloud/)明确结束自己创建的运行，分别核对资源释放与最终账单。人工交接时暂停智能体，交还控制后继续同一运行。

工具输入会发送到百智云，网页操作会访问目标网站。使用前阅读服务条款与隐私说明。

[English guide](baizhi-cloud-browser.md)

## 维护与支持

维护者：[ctcbyzx](https://github.com/ctcbyzx)（[Chaitin 公共接入仓](https://github.com/chaitin/baizhi-cloud-browser)贡献者）。更多接入方式见[公开接入材料](https://github.com/ctcbyzx/baizhi-cloud-browser)。

配置问题可到[接入维护仓 Issues](https://github.com/ctcbyzx/baizhi-cloud-browser/issues)反馈，附客户端版本和脱敏错误信息。账号或账务问题请通过服务控制台处理。
