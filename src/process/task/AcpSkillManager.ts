/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Skill Manager - 为 ACP agents (Claude/OpenCode/Codex) 提供 skills 按需加载能力
 * 借鉴 aioncli-core 的 SkillManager 设计
 *
 * ACP Skill Manager - Provides on-demand skill loading for ACP agents (Claude/OpenCode/Codex)
 * Inspired by aioncli-core's SkillManager design
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { getSkillsDir, getBuiltinSkillsDir } from '../initStorage';

/**
 * Skill 定义（与 aioncli-core 兼容）
 * Skill definition (compatible with aioncli-core)
 */
export interface SkillDefinition {
  /** 技能唯一名称 / Unique skill name */
  name: string;
  /** 技能描述（用于索引）/ Skill description (for indexing) */
  description: string;
  /** 文件路径 / File path */
  location: string;
  /** 完整内容（延迟加载）/ Full content (lazy loaded) */
  body?: string;
}

/**
 * Skill 索引（轻量级，用于首条消息注入）
 * Skill index (lightweight, for first message injection)
 */
export interface SkillIndex {
  name: string;
  description: string;
}

/**
 * 解析 SKILL.md 的 frontmatter
 * Parse frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: { name?: string; description?: string } = {};

  // 解析 name
  const nameMatch = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  // 解析 description（支持单引号、双引号、无引号）
  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  return result;
}

/**
 * 移除 frontmatter，只保留 body 内容
 * Remove frontmatter, keep only body content
 */
function extractBody(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

/**
 * ACP Skill Manager
 * 为 ACP agents 提供 skills 的索引加载和按需获取能力
 *
 * 使用单例模式避免重复文件系统扫描
 * Uses singleton pattern to avoid repeated filesystem scans
 *
 * 支持两类 skills:
 * - 内置 skills (_builtin/): 所有场景自动注入
 * - 可选 skills: 通过 enabledSkills 参数控制
 */
export class AcpSkillManager {
  private static instance: AcpSkillManager | null = null;
  private static instanceKey: string | null = null;

  private skills: Map<string, SkillDefinition> = new Map();
  private builtinSkills: Map<string, SkillDefinition> = new Map();
  private skillsDir: string;
  private builtinSkillsDir: string;
  private initialized: boolean = false;
  private builtinInitialized: boolean = false;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || getSkillsDir();
    this.builtinSkillsDir = getBuiltinSkillsDir();
  }

  /**
   * 获取单例实例（带 enabledSkills 缓存键）
   * Get singleton instance (with enabledSkills cache key)
   *
   * @param enabledSkills - 启用的 skills 列表，用作缓存键 / Enabled skills list, used as cache key
   * @returns AcpSkillManager 实例 / AcpSkillManager instance
   */
  static getInstance(enabledSkills?: string[]): AcpSkillManager {
    const cacheKey = enabledSkills?.sort().join(',') || 'all';

    // 如果缓存键变化，需要重新创建实例
    // If cache key changed, need to recreate instance
    if (AcpSkillManager.instance && AcpSkillManager.instanceKey === cacheKey) {
      return AcpSkillManager.instance;
    }

    // 创建新实例
    AcpSkillManager.instance = new AcpSkillManager();
    AcpSkillManager.instanceKey = cacheKey;
    return AcpSkillManager.instance;
  }

  /**
   * 重置单例实例（用于测试或配置变更）
   * Reset singleton instance (for testing or config changes)
   */
  static resetInstance(): void {
    AcpSkillManager.instance = null;
    AcpSkillManager.instanceKey = null;
  }

  /**
   * 初始化：发现并加载内置 skills 的索引（所有场景自动注入）
   * Initialize: discover and load index of builtin skills (auto-injected for all scenarios)
   */
  async discoverBuiltinSkills(): Promise<void> {
    if (this.builtinInitialized) return;

    const builtinDir = this.builtinSkillsDir;
    if (!existsSync(builtinDir)) {
      console.log(`[AcpSkillManager] Builtin skills directory not found: ${builtinDir}`);
      this.builtinInitialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(builtinDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;
        const skillFile = path.join(builtinDir, skillName, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { name, description } = parseFrontmatter(content);

          const skillDef: SkillDefinition = {
            name: name || skillName,
            description: description || `Builtin Skill: ${skillName}`,
            location: skillFile,
            // body 不在这里加载，按需获取
          };

          this.builtinSkills.set(skillName, skillDef);
        } catch (error) {
          console.warn(`[AcpSkillManager] Failed to load builtin skill ${skillName}:`, error);
        }
      }

      console.log(`[AcpSkillManager] Discovered ${this.builtinSkills.size} builtin skills`);
    } catch (error) {
      console.error(`[AcpSkillManager] Failed to discover builtin skills:`, error);
    }

    this.builtinInitialized = true;
  }

  /**
   * 初始化：发现并加载所有 skills 的索引（不加载 body）
   * Initialize: discover and load index of all skills (without body)
   */
  async discoverSkills(enabledSkills?: string[]): Promise<void> {
    // 始终先加载内置 skills / Always load builtin skills first
    await this.discoverBuiltinSkills();

    if (this.initialized) return;

    const skillsDir = this.skillsDir;
    if (!existsSync(skillsDir)) {
      console.warn(`[AcpSkillManager] Skills directory not found: ${skillsDir}`);
      this.initialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;

        // 跳过内置 skills 目录 / Skip builtin skills directory
        if (skillName === '_builtin') continue;

        // 如果指定了 enabledSkills，只加载启用的
        if (enabledSkills && enabledSkills.length > 0 && !enabledSkills.includes(skillName)) {
          continue;
        }

        const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { name, description } = parseFrontmatter(content);

          const skillDef: SkillDefinition = {
            name: name || skillName,
            description: description || `Skill: ${skillName}`,
            location: skillFile,
            // body 不在这里加载，按需获取
          };

          this.skills.set(skillName, skillDef);
        } catch (error) {
          console.warn(`[AcpSkillManager] Failed to load skill ${skillName}:`, error);
        }
      }

      console.log(`[AcpSkillManager] Discovered ${this.skills.size} optional skills`);
    } catch (error) {
      console.error(`[AcpSkillManager] Failed to discover skills:`, error);
    }

    this.initialized = true;
  }

  /**
   * 获取所有 skills 的索引（轻量级）
   * 包含内置 skills + 可选 skills
   * Get index of all skills (lightweight)
   * Includes builtin skills + optional skills
   */
  getSkillsIndex(): SkillIndex[] {
    // 合并内置 skills 和可选 skills / Merge builtin and optional skills
    const allSkills: SkillIndex[] = [];

    // 内置 skills 优先 / Builtin skills first
    for (const skill of this.builtinSkills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    // 然后是可选 skills / Then optional skills
    for (const skill of this.skills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    return allSkills;
  }

  /**
   * 获取内置 skills 的索引
   * Get index of builtin skills only
   */
  getBuiltinSkillsIndex(): SkillIndex[] {
    return Array.from(this.builtinSkills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * 检查是否有任何 skills（内置或可选）
   * Check if there are any skills (builtin or optional)
   */
  hasAnySkills(): boolean {
    return this.builtinSkills.size > 0 || this.skills.size > 0;
  }

  /**
   * 按名称获取单个 skill 的完整内容（按需加载）
   * 先查找内置 skills，再查找可选 skills
   * Get full content of a skill by name (on-demand loading)
   * Search builtin skills first, then optional skills
   */
  async getSkill(name: string): Promise<SkillDefinition | null> {
    // 先查找内置 skills / Search builtin skills first
    let skill = this.builtinSkills.get(name);
    // 再查找可选 skills / Then search optional skills
    if (!skill) {
      skill = this.skills.get(name);
    }
    if (!skill) return null;

    // 如果 body 还没加载，现在加载
    if (skill.body === undefined) {
      try {
        const content = await fs.readFile(skill.location, 'utf-8');
        skill.body = extractBody(content);
      } catch (error) {
        console.warn(`[AcpSkillManager] Failed to load skill body for ${name}:`, error);
        skill.body = '';
      }
    }

    return skill;
  }

  /**
   * 获取多个 skills 的完整内容
   * Get full content of multiple skills
   */
  async getSkills(names: string[]): Promise<SkillDefinition[]> {
    const results: SkillDefinition[] = [];
    for (const name of names) {
      const skill = await this.getSkill(name);
      if (skill) {
        results.push(skill);
      }
    }
    return results;
  }

  /**
   * 检查 skill 是否存在（包括内置和可选）
   * Check if a skill exists (including builtin and optional)
   */
  hasSkill(name: string): boolean {
    return this.builtinSkills.has(name) || this.skills.has(name);
  }

  /**
   * 清除缓存的 body 内容（用于刷新）
   * Clear cached body content (for refresh)
   */
  clearCache(): void {
    for (const skill of this.builtinSkills.values()) {
      skill.body = undefined;
    }
    for (const skill of this.skills.values()) {
      skill.body = undefined;
    }
  }
}

/**
 * 构建 skills 索引文本（用于首条消息注入）
 * Build skills index text (for first message injection)
 */
export function buildSkillsIndexText(skills: SkillIndex[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);

  return `[Available Skills]
The following skills are available. When you need detailed instructions for a specific skill,
you can request it by outputting: [LOAD_SKILL: skill-name]

${lines.join('\n')}`;
}

/**
 * 检测消息中是否请求加载 skill
 * Detect if message requests loading a skill
 */
export function detectSkillLoadRequest(content: string): string[] {
  const matches = content.matchAll(/\[LOAD_SKILL:\s*([^\]]+)\]/gi);
  const requested: string[] = [];
  for (const match of matches) {
    requested.push(match[1].trim());
  }
  return requested;
}

/**
 * 构建 skill 内容文本（用于注入）
 * Build skill content text (for injection)
 */
export function buildSkillContentText(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  return skills.map((s) => `[Skill: ${s.name}]\n${s.body}`).join('\n\n');
}
