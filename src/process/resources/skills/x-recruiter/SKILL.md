---
name: x-recruiter
description: 用于在 X (x.com) 发布招聘帖子。包含文案规范、图片生成提示和自动化发布脚本。发布 AI 相关岗位或设计类岗位时优先使用。
---

# X Recruiter (X 招聘助手)

本技能用于快速在 X 发布招聘信息，包含文案规则、封面/详情图提示与自动化发布脚本。

## 核心工作流

### 1. 信息收集

向用户确认：

- **岗位名称**
- **核心职责 & 要求**
- **投递邮箱/链接**

### 2. 生成视觉素材

使用 `scripts/generate_images.js` 生成图片。

- **操作**：
  ```bash
  node scripts/generate_images.js
  ```
- **产出**：`cover.png`, `jd_details.png`

### 3. 生成文案

生成符合 X 调性的文案，控制在 280 字符内。

- **规则**：参考 `assets/rules.md`。
- **要求**：简洁、清晰、带核心职责与投递方式。

### 4. 自动化发布

使用 `scripts/publish_x.py` 启动浏览器进行发布。

**前置要求**：

- 安装 Playwright: `pip install playwright`
- 安装浏览器驱动: `playwright install chromium`

**执行命令**：

```bash
python3 scripts/publish_x.py "post_content.txt" "cover.png" "jd_details.png"
```

**交互流程（更清晰的步骤说明）**：

1. 观察浏览器窗口：脚本已打开 X 首页或发帖页。
2. 若出现登录页，请完成登录。
3. 登录完成后，脚本会自动填充文案与图片。
4. 请在浏览器中检查内容，确认无误后点击“Post”。

## 资源文件

- **assets/rules.md**: 文案规则与限制。
- **assets/design_philosophy.md**: 视觉风格指南。
- **scripts/generate_images.js**: 图片生成脚本。
- **scripts/publish_x.py**: 发布自动化脚本。
