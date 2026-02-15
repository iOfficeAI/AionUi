# SillyTavern 兼容性说明

## SillyTavern 标准功能（我们完全兼容）

### 1. 角色卡格式

- ✅ **Tavern Card V2/V3 格式**：SillyTavern 的标准角色卡格式
  - 字段：`name`, `description`, `personality`, `scenario`, `first_mes`, `system_prompt`, `character_book` 等
  - 完全兼容 SillyTavern 导出的 JSON 格式

### 2. 世界信息格式

- ✅ **World Info 格式**：SillyTavern 的标准世界信息格式
  - 结构：`entries` 数组，每个条目包含 `keys`, `content`, `priority`, `enabled` 等
  - 完全兼容 SillyTavern 导出的 JSON 格式

### 3. PNG 图片格式（嵌入 JSON）

- ✅ **角色卡 PNG**：SillyTavern 标准
  - 关键字：`chara` (v2) 或 `ccv3` (v3)
  - 数据位置：PNG 的 tEXt 块中
  - Base64 编码的 JSON 字符串

- ✅ **世界信息 PNG**：SillyTavern 标准
  - 关键字：`naidata`
  - 数据位置：PNG 的 tEXt 块中
  - Base64 编码的 JSON 字符串

### 4. WebP 图片格式

- ✅ **WebP 支持**：SillyTavern 兼容格式
  - 与 PNG 类似的元数据嵌入机制
  - 使用相同的关键字（`chara`/`ccv3` 和 `naidata`）

### 5. Character Book（角色知识库）

- ✅ **Character Book**：SillyTavern 标准功能
  - 角色卡中的 `character_book` 字段
  - 类似世界信息，但绑定到特定角色
  - 关键词触发机制

### 6. 关键词触发机制

- ✅ **World Info 触发**：SillyTavern 标准功能
  - 监控对话内容，检测关键词
  - 当关键词出现时，注入相关内容
  - 按优先级排序

## 我们的扩展功能（AionUi 特有）

### 1. 主动引导创建流程

- **功能**：当没有角色卡或世界信息时，主动引导用户创建
- **3步引导流程**：
  1. 询问故事类型和背景
  2. 询问角色详细信息
  3. 询问世界设定
- **说明**：SillyTavern 需要用户手动创建，我们添加了 AI 引导创建

### 2. 自动创建 JSON 文件

- **功能**：确认信息后，自动创建 `character.json` 和 `world-info.json`
- **说明**：SillyTavern 需要用户手动编辑文件，我们添加了 AI 自动创建

### 3. 持续更新机制

- **功能**：在对话过程中，AI 可以自动更新角色卡和世界信息
- **角色卡更新**：当角色发生重要变化时
- **世界信息更新**：当出现新的设定、地点、规则时
- **说明**：SillyTavern 支持手动编辑，我们添加了 AI 自动识别和更新

### 4. 图片转 JSON 自动保存

- **功能**：解析 PNG/WebP 图片后，自动保存为 JSON 格式
- **说明**：SillyTavern 不会自动转换，我们添加了这个功能方便后续编辑

### 5. 动态解析工具创建

- **功能**：当需要解析 PNG/WebP 时，AI 自动创建 Node.js 解析工具
- **说明**：因为 AionUi 没有内置 PNG 解析库，我们添加了这个动态创建机制

### 6. 工作空间自动检测

- **功能**：自动扫描工作空间，检测角色卡和世界信息文件
- **说明**：SillyTavern 需要手动选择文件，我们添加了自动检测

## 总结

| 功能                 | SillyTavern 标准 | 我们的扩展 |
| -------------------- | ---------------- | ---------- |
| 角色卡格式（JSON）   | ✅               | -          |
| 世界信息格式（JSON） | ✅               | -          |
| PNG 图片格式         | ✅               | -          |
| WebP 图片格式        | ✅               | -          |
| Character Book       | ✅               | -          |
| 关键词触发机制       | ✅               | -          |
| 主动引导创建         | ❌               | ✅         |
| 自动创建文件         | ❌               | ✅         |
| 持续自动更新         | ❌               | ✅         |
| 图片转 JSON          | ❌               | ✅         |
| 动态解析工具         | ❌               | ✅         |
| 工作空间自动检测     | ❌               | ✅         |

## 兼容性保证

- ✅ **完全兼容**：可以直接使用从 SillyTavern 导出的角色卡和世界信息文件
- ✅ **格式兼容**：支持 PNG、WebP、JSON 三种格式
- ✅ **功能扩展**：在兼容的基础上，添加了 AI 自动化和智能引导功能
