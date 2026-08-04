# ext-wecom-bot

AionUI 企业微信 AI Bot 渠道扩展示例。

## 本示例涵盖的内容

- 企业微信 Bot 模式的回调验证（`GET`）
- 加密 Webhook 请求体处理（`POST`）
- 流式轮询响应（`msgtype=stream`）
- 流上下文不可用时，通过仅可使用一次的 `response_url` 回退
- 将入站消息接入 AionUI 统一渠道管线
- 以 `dist/*` 为优先的扩展入口，以及用于开发的源码包装器

## 运行方法

1. 启动应用并加载扩展示例：

```powershell
just dev-ext
```

2. 打开“设置”→“渠道”→`企业微信 AI Bot (Example)`。
3. 填写：
   - `token`：企业微信 AI Bot 回调 Token
   - `encodingAesKey`：43 个字符的 EncodingAESKey
4. 启用该渠道。
5. （可选）在 `Public Base URL` 中填写公网 HTTPS 源地址，例如 `https://bot.example.com`。

## Webhook URL

使用：

```
http://<your-host>:<webui-port>/ext-wecom-bot/webhook
```

本地桌面版的默认地址：

```
http://127.0.0.1:25808/ext-wecom-bot/webhook
```

## 注意事项

- 这是用于验证扩展渠道能力的生态示例。
- 示例有意保持轻量框架（`CommonJS`），以兼容当前扩展加载器。
- 局域网远程访问适合本地测试，但企业微信回调通常要求一个公网可访问的 HTTPS URL。
