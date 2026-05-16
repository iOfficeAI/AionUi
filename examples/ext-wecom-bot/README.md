# ext-wecom-bot

Enterprise WeCom AI Bot channel extension example for AionUI.

## What this example covers

- WeCom Bot-mode callback verification (`GET`)
- Encrypted webhook payload handling (`POST`)
- Stream-style polling response (`msgtype=stream`)
- `response_url` single-use fallback when stream context is unavailable
- Bridging inbound message to AionUI unified channel pipeline
- Dist-first extension entrypoints (`dist/*`) with source wrappers for development

## How to run

1. Start app with extension examples:

```powershell
just dev-ext
```

2. Open Settings -> Channels -> `企业微信 AI Bot (Example)`.
3. Fill:
   - `token`: WeCom AI Bot callback token
   - `encodingAesKey`: 43-char EncodingAESKey
4. Enable the channel.
5. (Optional) Fill `Public Base URL` with your public HTTPS origin, e.g. `https://bot.example.com`.

## Webhook URL

Use:

```
http://<your-host>:<webui-port>/ext-wecom-bot/webhook
```

For local desktop default:

```
http://127.0.0.1:25808/ext-wecom-bot/webhook
```

## Notes

- This is an ecosystem example for extension channel capability validation.
- It intentionally stays framework-light (`CommonJS`) to keep compatibility with current extension loader.
- LAN remote access is useful for local testing, but WeCom callback usually requires a publicly reachable HTTPS URL.
