#!/usr/bin/env node
/**
 * Create assistant.json files in source assistant/ directories
 * based on ASSISTANT_PRESETS data
 */

const fs = require('fs');
const path = require('path');

// Import ASSISTANT_PRESETS (we'll extract the data manually)
const presets = [
  {
    id: 'openclaw-setup',
    avatar: '🦞',
    presetAgentType: 'gemini',
    defaultEnabledSkills: ['openclaw-setup', 'aionui-webui-setup'],
    nameI18n: { 'en-US': 'OpenClaw Setup Expert', 'zh-CN': 'OpenClaw 部署专家' },
    descriptionI18n: { 'en-US': 'Expert guide for installing, deploying, configuring, and troubleshooting OpenClaw. Proactively helps with setup, diagnoses issues, and provides security best practices.', 'zh-CN': 'OpenClaw 安装、部署、配置和故障排查专家。主动协助设置、诊断问题并提供安全最佳实践。' },
  },
  {
    id: 'pptx-generator',
    avatar: '📊',
    presetAgentType: 'gemini',
    nameI18n: { 'en-US': 'PPTX Generator', 'zh-CN': 'PPTX 生成器' },
    descriptionI18n: { 'en-US': 'Generate local PPTX assets and structure for pptxgenjs.', 'zh-CN': '生成本地 PPTX 资产与结构（pptxgenjs）。' },
  },
  {
    id: 'pdf-to-ppt',
    avatar: '📄',
    presetAgentType: 'gemini',
    nameI18n: { 'en-US': 'PDF to PPT', 'zh-CN': 'PDF 转 PPT' },
    descriptionI18n: { 'en-US': 'Convert PDF to PPT with watermark removal rules.', 'zh-CN': 'PDF 转 PPT 并去除水印规则' },
  },
  {
    id: 'ui-ux-pro-max',
    avatar: '🎨',
    presetAgentType: 'gemini',
    nameI18n: { 'en-US': 'UI/UX Pro Max', 'zh-CN': 'UI/UX 专业设计师' },
    descriptionI18n: { 'en-US': 'Professional UI/UX design intelligence with 57 styles, 95 color palettes, 56 font pairings, and stack-specific best practices.', 'zh-CN': '专业 UI/UX 设计智能助手，包含 57 种风格、95 个配色方案、56 个字体配对及技术栈最佳实践。' },
  },
  {
    id: 'planning-with-files',
    avatar: '📋',
    presetAgentType: 'gemini',
    nameI18n: { 'en-US': 'Planning with Files', 'zh-CN': '文件规划助手' },
    descriptionI18n: { 'en-US': 'Manus-style file-based planning for complex tasks. Uses task_plan.md, findings.md, and progress.md to maintain persistent context.', 'zh-CN': 'Manus 风格的文件规划，用于复杂任务。使用 task_plan.md、findings.md 和 progress.md 维护持久化上下文。' },
  },
  {
    id: 'human-3-coach',
    avatar: '🧭',
    presetAgentType: 'gemini',
    nameI18n: { 'en-US': 'HUMAN 3.0 Coach', 'zh-CN': 'HUMAN 3.0 教练' },
    descriptionI18n: { 'en-US': 'Personal development coach based on HUMAN 3.0 framework: 4 Quadrants (Mind/Body/Spirit/Vocation), 3 Levels, 3 Growth Phases.', 'zh-CN': '基于 HUMAN 3.0 框架的个人发展教练：4 象限（思维/身体/精神/职业）、3 层次、3 成长阶段。' },
  },
  {
    id: 'social-job-publisher',
    avatar: '📣',
    presetAgentType: 'gemini',
    defaultEnabledSkills: ['xiaohongshu-recruiter', 'x-recruiter'],
    nameI18n: { 'en-US': 'Social Job Publisher', 'zh-CN': '社交招聘发布助手' },
    descriptionI18n: { 'en-US': 'Expand hiring requests into a full JD, images, and publish to social platforms via connectors.', 'zh-CN': '扩写招聘需求为完整 JD 与图片，并通过 connector 发布到社交平台。' },
  },
  {
    id: 'moltbook',
    avatar: '🦞',
    presetAgentType: 'gemini',
    defaultEnabledSkills: ['moltbook'],
    nameI18n: { 'en-US': 'moltbook', 'zh-CN': 'moltbook' },
    descriptionI18n: { 'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.', 'zh-CN': 'AI 代理的社交网络。发帖、评论、投票、创建社区。' },
  },
  {
    id: 'beautiful-mermaid',
    avatar: '📈',
    presetAgentType: 'gemini',
    defaultEnabledSkills: ['mermaid'],
    nameI18n: { 'en-US': 'Beautiful Mermaid', 'zh-CN': 'Beautiful Mermaid' },
    descriptionI18n: { 'en-US': 'Create flowcharts, sequence diagrams, state diagrams, class diagrams, and ER diagrams with beautiful themes.', 'zh-CN': '创建流程图、时序图、状态图、类图和 ER 图，支持多种精美主题。' },
  },
  {
    id: 'story-roleplay',
    avatar: '📖',
    presetAgentType: 'gemini',
    defaultEnabledSkills: ['story-roleplay'],
    nameI18n: { 'en-US': 'Story Roleplay', 'zh-CN': '故事角色扮演' },
    descriptionI18n: { 'en-US': 'Interactive storytelling and roleplay with immersive narratives.', 'zh-CN': '沉浸式叙事的互动故事和角色扮演。' },
  },
];

const assistantDir = path.join(__dirname, '..', 'assistant');

let created = 0;
let skipped = 0;

for (const preset of presets) {
  const dirPath = path.join(assistantDir, preset.id);
  const jsonPath = path.join(dirPath, 'assistant.json');

  if (!fs.existsSync(dirPath)) {
    console.log(`✗ Directory not found: ${preset.id}`);
    continue;
  }

  if (fs.existsSync(jsonPath)) {
    console.log(`✓ Already exists: ${preset.id}/assistant.json`);
    skipped++;
    continue;
  }

  const config = {
    id: preset.id,
    name: preset.nameI18n['en-US'],
    avatar: preset.avatar,
    presetAgentType: preset.presetAgentType || 'gemini',
    isBuiltin: true,
    ...(preset.defaultEnabledSkills && { defaultEnabledSkills: preset.defaultEnabledSkills }),
    nameI18n: preset.nameI18n,
    descriptionI18n: preset.descriptionI18n,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✓ Created: ${preset.id}/assistant.json`);
  created++;
}

console.log(`\nSummary:`);
console.log(`  Created: ${created}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Total: ${created + skipped}`);
