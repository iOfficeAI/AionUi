/**
 * Skills Parser - 解析和按需加载技能
 * Parse skills content and load on demand based on trigger keywords
 */

export interface ParsedSkill {
  id: string;
  name: string;
  triggers: string[];
  content: string;
}

export interface ParsedSkillsResult {
  /** 精简索引，只包含技能名称和触发词 / Compact index with skill names and triggers only */
  index: string;
  /** 完整技能内容映射 / Full skill content map */
  skills: Map<string, ParsedSkill>;
}

/**
 * 解析 skills 文件内容
 * Parse skills file content into index and skill map
 *
 * @param skillsContent - 原始 skills 文件内容 / Raw skills file content
 * @returns 解析结果包含索引和技能映射 / Parsed result with index and skills map
 */
export function parseSkillsContent(skillsContent: string): ParsedSkillsResult {
  const skills = new Map<string, ParsedSkill>();
  const indexLines: string[] = [];

  // 匹配技能标题：## N. skill-id - Skill Name
  // Match skill headers: ## N. skill-id - Skill Name
  const skillHeaderRegex = /^## (\d+)\. (\S+) - (.+)$/gm;
  const triggerRegex = /\*\*MANDATORY TRIGGERS\*\*:\s*(.+)$/m;

  // 分割成技能块 / Split into skill blocks
  const skillBlocks = skillsContent.split(/(?=^## \d+\.)/m).filter((block) => block.trim());

  for (const block of skillBlocks) {
    const headerMatch = block.match(/^## (\d+)\. (\S+) - (.+)$/m);
    if (!headerMatch) continue;

    const [, , skillId, skillName] = headerMatch;
    const triggerMatch = block.match(triggerRegex);

    if (!triggerMatch) continue;

    const triggersStr = triggerMatch[1].trim();
    // 解析触发词，支持逗号分隔 / Parse triggers, supports comma separation
    const triggers = triggersStr
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    skills.set(skillId, {
      id: skillId,
      name: skillName,
      triggers,
      content: block.trim(),
    });

    // 构建索引行 / Build index line
    indexLines.push(`- **${skillId}** (${skillName}): ${triggersStr}`);
  }

  // 构建精简索引 / Build compact index
  const index = `Available Skills (use trigger keywords to activate):
${indexLines.join('\n')}

When your request matches these triggers, detailed skill instructions will be provided automatically.`;

  return { index, skills };
}

/**
 * 根据用户消息匹配触发的技能
 * Match skills based on user message triggers
 *
 * @param message - 用户消息 / User message
 * @param skills - 技能映射 / Skills map
 * @returns 匹配的技能ID列表 / List of matched skill IDs
 */
export function matchSkillTriggers(message: string, skills: Map<string, ParsedSkill>): string[] {
  const lowerMessage = message.toLowerCase();
  const matchedSkills: string[] = [];

  for (const [skillId, skill] of skills) {
    for (const trigger of skill.triggers) {
      // 检查触发词是否在消息中出现（作为独立词或词组）
      // Check if trigger appears in message (as word or phrase)
      if (lowerMessage.includes(trigger)) {
        matchedSkills.push(skillId);
        break; // 一个技能只需匹配一次 / Only match once per skill
      }
    }
  }

  return matchedSkills;
}

/**
 * 获取匹配技能的完整内容
 * Get full content of matched skills
 *
 * @param matchedSkillIds - 匹配的技能ID / Matched skill IDs
 * @param skills - 技能映射 / Skills map
 * @returns 技能内容字符串 / Skill content string
 */
export function getMatchedSkillsContent(matchedSkillIds: string[], skills: Map<string, ParsedSkill>): string {
  if (matchedSkillIds.length === 0) return '';

  const contents: string[] = [];
  for (const skillId of matchedSkillIds) {
    const skill = skills.get(skillId);
    if (skill) {
      contents.push(skill.content);
    }
  }

  return contents.join('\n\n---\n\n');
}
