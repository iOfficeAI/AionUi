/**
 * Skills Parser - 解析和按需加载技能
 * Parse skills content and load on demand based on trigger keywords
 *
 * Supports YAML front matter format:
 * ---
 * id: skill-id
 * name: Skill Name
 * triggers: keyword1, keyword2, keyword3
 * ---
 * [skill content]
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
 * 解析 YAML front matter 格式的技能块
 * Parse YAML front matter format skill block
 *
 * Supports both compact and formatted (with empty lines) YAML:
 * ---
 * id: ...        OR    ---
 * name: ...
 * triggers: ...        id: ...
 * ---                  name: ...
 *                      triggers: ...
 *
 *                      ---
 */
function parseYamlFrontMatter(block: string): { id?: string; name?: string; triggers?: string; content: string } | null {
  // 匹配 YAML front matter: --- ... --- (支持 --- 周围有空行)
  // Match YAML front matter: --- ... --- (supports empty lines around ---)
  const yamlMatch = block.match(/^---\s*\n([\s\S]*?)\n\s*---\s*\n?([\s\S]*)$/);
  if (!yamlMatch) return null;

  const [, yamlContent, content] = yamlMatch;
  const result: { id?: string; name?: string; triggers?: string; content: string } = { content: content.trim() };

  // 解析 YAML 字段 / Parse YAML fields
  const idMatch = yamlContent.match(/^id:\s*(.+)$/m);
  const nameMatch = yamlContent.match(/^name:\s*(.+)$/m);
  const triggersMatch = yamlContent.match(/^triggers:\s*(.+)$/m);

  if (idMatch) result.id = idMatch[1].trim();
  if (nameMatch) result.name = nameMatch[1].trim();
  if (triggersMatch) result.triggers = triggersMatch[1].trim();

  return result;
}

/**
 * 解析旧格式技能块 (## N. skill-id - Skill Name)
 * Parse legacy format skill block
 */
function parseLegacyFormat(block: string): { id?: string; name?: string; triggers?: string; content: string } | null {
  const headerMatch = block.match(/^## (\d+)\. (\S+) - (.+)$/m);
  if (!headerMatch) return null;

  const [, , skillId, skillName] = headerMatch;
  // 支持英文和中文触发词标签 / Support both English and Chinese trigger labels
  const triggerRegex = /\*\*(?:MANDATORY TRIGGERS|强制触发词)\*\*:\s*(.+)$/m;
  const triggerMatch = block.match(triggerRegex);

  if (!triggerMatch) return null;

  return {
    id: skillId,
    name: skillName,
    triggers: triggerMatch[1].trim(),
    content: block.trim(),
  };
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

  // 检测格式：YAML front matter 或旧格式
  // Detect format: YAML front matter or legacy format
  // 支持 --- 后紧跟 id: 或有空行再 id: 两种格式
  // Supports both --- immediately followed by id: or with empty line before id:
  const hasYamlFormat = /^---\s*\n\s*id:/m.test(skillsContent);

  if (hasYamlFormat) {
    // YAML front matter 格式：按 \n--- 分割（技能块之间）
    // YAML format: split by \n--- (between skill blocks)
    // 支持 --- 后有空行的格式 / Supports empty line after ---
    const skillBlocks = skillsContent.split(/\n(?=---\s*\n\s*id:)/g).filter((block) => block.trim());

    for (const block of skillBlocks) {
      const parsed = parseYamlFrontMatter(block);
      if (!parsed || !parsed.id || !parsed.name || !parsed.triggers) continue;

      const triggers = parsed.triggers
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      skills.set(parsed.id, {
        id: parsed.id,
        name: parsed.name,
        triggers,
        content: block.trim(),
      });

      indexLines.push(`- **${parsed.id}** (${parsed.name}): ${parsed.triggers}`);
    }
  } else {
    // 旧格式：## N. skill-id - Skill Name
    // Legacy format: ## N. skill-id - Skill Name
    const skillBlocks = skillsContent.split(/(?=^## \d+\.)/m).filter((block) => block.trim());

    for (const block of skillBlocks) {
      const parsed = parseLegacyFormat(block);
      if (!parsed || !parsed.id || !parsed.name || !parsed.triggers) continue;

      const triggers = parsed.triggers
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      skills.set(parsed.id, {
        id: parsed.id,
        name: parsed.name,
        triggers,
        content: block.trim(),
      });

      indexLines.push(`- **${parsed.id}** (${parsed.name}): ${parsed.triggers}`);
    }
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
