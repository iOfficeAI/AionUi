# Connect Baizhi Cloud Browser

[Baizhi Cloud Browser](https://baizhibrowser.cloud/), also known as CapyBrowser, provides hosted MCP tools for cloud browser runs, saved browser state, human handoff and downloads. Page navigation, clicks and reading require a separate compatible CDP client available to your agent; this connection does not install that client.

Browser startup and runtime are billed. Check your account and current prices before calling tools that create runs. Disabling an MCP connection or closing AionUi does not end existing cloud runs.

## Import the connection

1. Obtain a browser-service key using the [setup guide](https://capybrowser.app.baizhi.cloud/docs/installation.md). Baizhi Cloud Browser and Baizhi Cloud Agent Toolkit are separate services; do not assume a Toolkit application key applies.
2. Open [the importable JSON](baizhi-cloud-browser.json). Replace `REPLACE_WITH_BROWSER_KEY` locally with your complete browser key. Keep exactly one `Bearer` prefix and the space after it. The `headers` object uses `"Authorization": "Bearer YOUR_KEY"`; do not paste Cherry-style `Authorization=Bearer ...` into its value. No npm installation or OAuth flow is part of this remote configuration.
3. In Settings, open MCP management and choose **Add MCP → Import from JSON**. Paste the complete object, retaining its top-level `mcpServers` key. Import only this entry and keep unrelated servers. If the name already exists, inspect and edit that entry instead of overwriting it blindly.
4. Save and inspect the connection test and discovered tool names. JSON import enables the connection and starts a discovery test in the current UI. The template contains no automatic run-creation command; connection/discovery is separate from authorizing an agent to call billable tools. A discovered catalog does not prove full tool permission or a complete browser task.

The importer accepts `streamable_http` and normalizes it to the backend's `http` transport. Keep the remote endpoint `https://capybrowser.app.baizhi.cloud/mcp`. An authentication failure calls for checking the URL, key applicability and complete header value; do not retry run-creation tools to test authentication.

Do not share real keys, configuration exports or screenshots that show them. Before allowing agent use, inspect the chosen agent's tool-permission settings and keep confirmation for operations that create runs, write data or incur charges. Agent-specific permissions and page-control setup are separate from MCP discovery.

## Rotate, disable or remove

Disable only this entry before editing its header. Replace the key, save, inspect discovery and enable it when ready. To stop using the local connection, turn its switch off; to remove it, delete only `baizhi-cloud-browser` and retain other connections. These actions do not revoke the browser-service key or stop cloud billing.

When a browser task finishes, explicitly end the runs you created through the browser service's tools or [console](https://capybrowser.app.baizhi.cloud/). Check resource release and final charges separately. During human handoff, pause agent actions and continue the same run after control is returned.

Tool inputs reach Baizhi Cloud, and page actions reach the visited sites. Read the provider's terms and privacy information before use.

[中文指南](baizhi-cloud-browser.zh-CN.md)

## Maintenance and support

Maintained by [ctcbyzx](https://github.com/ctcbyzx), a contributor to [Chaitin's public integration guides](https://github.com/chaitin/baizhi-cloud-browser). See [other browser integrations](https://github.com/ctcbyzx/baizhi-cloud-browser).

For setup help, use the [integration issue tracker](https://github.com/ctcbyzx/baizhi-cloud-browser/issues) and include the client version and a redacted error. Use the service console for private account or billing questions.
