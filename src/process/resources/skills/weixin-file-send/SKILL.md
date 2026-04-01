---
name: weixin-file-send
description: |
  Use when the user wants a local file or image sent back, such as "send me the file"
  or "发给我".
---

# Weixin File Send

Use this skill when:

- The user asks you to send a file or image back, for example:
  - "send me the file"
  - "send the image over"
  - "pass the file to me"
  - "发给我"
  - "图片发过来"
  - "把文件传给我"
- A local file already exists and should be delivered to the current chat.

Do not claim a file was sent unless you emit the protocol block exactly.
Without the protocol block, the app will not actually send the file.

## Protocol

Append one or more protocol blocks at the end of the final reply:

```text
[AIONUI_CHANNEL_SEND]
{"type":"image","path":"./output/chart.png","caption":"Chart ready"}
[/AIONUI_CHANNEL_SEND]
```

```text
[AIONUI_CHANNEL_SEND]
{"type":"file","path":"./output/report.pdf","fileName":"report.pdf","caption":"Report ready"}
[/AIONUI_CHANNEL_SEND]
```

## Rules

- `type` must be `image` or `file`.
- `path` must point to a real local file that already exists.
- Use relative paths when the file is inside the workspace.
- `fileName` is optional for `file`.
- `caption` is optional.
- If the user clearly wants the file or image sent back, prefer emitting the protocol block instead of only describing the file in text.
- Place protocol blocks after the user-visible answer.
- Do not wrap the JSON in Markdown code fences.
- Do not emit the protocol block if the file does not exist.
- Do not say the file was sent if you did not emit the protocol block.

## Examples

User-visible text with image:

```text
I generated the chart and sent it below.

[AIONUI_CHANNEL_SEND]
{"type":"image","path":"./output/chart.png","caption":"Sales chart"}
[/AIONUI_CHANNEL_SEND]
```

File only:

```text
[AIONUI_CHANNEL_SEND]
{"type":"file","path":"./output/report.pdf","fileName":"report.pdf","caption":"Weekly report"}
[/AIONUI_CHANNEL_SEND]
```
