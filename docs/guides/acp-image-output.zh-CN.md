# ACP 图片输出展示

AionUi 对 ACP 工具调用中的图片结果使用文件路径展示，不依赖 inline base64。

## 数据约定

后端会把 Codex 图片生成工具的大型 `raw_output.result` base64 清洗掉，并保留小型字段：

- `rawOutput.image.path` 或 `raw_output.image.path`：生成图片的本地路径
- `rawOutput.saved_path` 或 `raw_output.saved_path`：兼容 Codex 当前返回结构的本地路径
- `rawOutput.result_omitted`：表示原始图片 base64 已被省略
- `rawOutput.result_bytes`：被省略内容的原始字节长度

## 渲染流程

`MessageAcpToolCall` 优先读取 `image.path`，没有时回退到 `saved_path`。
本地图片通过 `/api/fs/image-base64` 按需读取，再交给 `LocalImageView`
渲染。这样可以避免聊天消息列表、WebSocket 事件和 SQLite 消息记录承载
MB 级 base64。

对话列表会把工具调用聚合到 `View Steps` 摘要中。ACP 图片工具调用在进入
`MessageToolGroupSummary` 前会通过标准化层保留 `image.path`，因此聚合视图
展开后也能展示同一张本地图片，并提供下载按钮把图片保存到本机。

## 前端兜底

后端是主要清洗边界。前端在 `mergeAcpToolCallContent` 和消息列表快速合并路径中
保留兜底清洗：如果收到包含 `saved_path` 且超出阈值的 `result` 字符串，会移除
`result` 并补齐 `image.path`、`result_omitted` 和 `result_bytes`。

## 测试覆盖

相关单测位于 `tests/unit/chat/`：

- `acpToolCallOutput.test.ts` 覆盖图片路径提取、文件名生成和 base64 清洗。
- `messageHooks.dom.test.tsx` 覆盖空列表、非空列表和 `add=true` 路径下的 ACP 图片消息清洗。
- `MessageAcpToolCall.dom.test.tsx` 与 `MessageToolGroupSummary.dom.test.tsx` 覆盖图片预览、下载成功调用和下载失败提示。
