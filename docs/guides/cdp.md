# CDP (Chrome DevTools Protocol) for MCP Development

AionUi supports CDP for external debugging tools integration. In development mode (`just dev`), CDP is enabled by default on port 9230.

## Enable CDP in Production

1. Open AionUi Settings → System → Developer Debug
2. Enable "Enable Remote Debugging (CDP)"
3. Restart the app

## Configure MCP chrome-devtools

Add this to your IDE's MCP configuration. The configuration file location depends on your IDE:

| IDE                | Config Path                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Cursor**         | `~/.cursor/mcp.json`                                                                                                                 |
| **VS Code**        | `~/.vscode/mcp.json`                                                                                                                 |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Codebuddy**      | `~/.codebuddy/mcp.json`                                                                                                              |

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@0.16.0", "--browser-url=http://127.0.0.1:9230"]
    }
  }
}
```

## Other AI-Friendly Development Tools

AionUi can integrate with other MCP tools for enhanced development experience:

| Tool               | Purpose                                             | Config                                    |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| **Playwright MCP** | Browser automation (alternative to chrome-devtools) | `"@playwright/mcp@latest"`                |
| **Puppeteer MCP**  | Browser automation                                  | `"@puppeteer/mcp@latest"`                 |
| **Filesystem MCP** | File operations                                     | `@modelcontextprotocol/server-filesystem` |
| **Git MCP**        | Git repository operations                           | `@modelcontextprotocol/server-git`        |

See [MCP Servers](https://github.com/modelcontextprotocol/servers) for more tools.

## Usage with MCP

Once configured, you can use MCP tools to interact with AionUi:

- `list_pages` — List all open pages in AionUi
- `take_snapshot` — Get accessibility tree snapshot of current page
- `click`, `fill`, `hover` — Interact with UI elements
- `navigate_page` — Navigate to URLs

## Inspect with Chrome DevTools

1. Open `http://127.0.0.1:9230/json` in Chrome
2. Click on a page to inspect it with DevTools
3. Or use Chrome's `chrome://inspect` → Configure → add `127.0.0.1:9230`

---

# CDP (Chrome DevTools Protocol) MCP 开发

AionUi 支持 CDP 用于外部调试工具集成。在开发模式 (`just dev`) 下，CDP 默认在端口 9230 启用。

## 在生产环境启用 CDP

1. 打开 AionUi 设置 → 系统 → 开发者调试
2. 启用"启用远程调试 (CDP)"
3. 重启应用

## 配置 MCP chrome-devtools

将以下配置添加到你的 IDE 的 MCP 配置文件中。配置文件位置取决于你使用的 IDE：

| IDE                | 配置路径                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Cursor**         | `~/.cursor/mcp.json`                                                                                                                 |
| **VS Code**        | `~/.vscode/mcp.json`                                                                                                                 |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 或 `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Codebuddy**      | `~/.codebuddy/mcp.json`                                                                                                              |

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@0.16.0", "--browser-url=http://127.0.0.1:9230"]
    }
  }
}
```

## 其他 AI 友好的开发工具

AionUi 可以集成其他 MCP 工具来增强开发体验：

| 工具               | 用途                                     | 配置                                      |
| ------------------ | ---------------------------------------- | ----------------------------------------- |
| **Playwright MCP** | 浏览器自动化（chrome-devtools 替代方案） | `"@playwright/mcp@latest"`                |
| **Puppeteer MCP**  | 浏览器自动化                             | `"@puppeteer/mcp@latest"`                 |
| **Filesystem MCP** | 文件操作                                 | `@modelcontextprotocol/server-filesystem` |
| **Git MCP**        | Git 仓库操作                             | `@modelcontextprotocol/server-git`        |

更多工具请查看 [MCP Servers](https://github.com/modelcontextprotocol/servers)。

## MCP 使用方式

配置完成后，可以使用 MCP 工具与 AionUi 交互：

- `list_pages` — 列出 AionUi 中所有打开的页面
- `take_snapshot` — 获取当前页面的可访问性树快照
- `click`, `fill`, `hover` — 与 UI 元素交互
- `navigate_page` — 导航到 URL

## 使用 Chrome DevTools 检查

1. 在 Chrome 中打开 `http://127.0.0.1:9230/json`
2. 点击页面链接使用 DevTools 检查
3. 或使用 Chrome 的 `chrome://inspect` → 配置 → 添加 `127.0.0.1:9230`
