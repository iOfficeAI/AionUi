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
import { getSkillsDir, getBuiltinSkillsDir } from '@process/utils/initStorage';
import { ExtensionRegistry } from '@process/extensions';

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
function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
} {
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
 * 支持三类 skills:
 * - 内置 skills (_builtin/): 所有场景自动注入
 * - 用户安装 skills (config/skills/): 通过 Skills Hub 导入，所有 agent 自动可用
 * - 可选 skills: 通过 enabledSkills 参数控制（仅限扩展贡献的 skills）
 */
export class AcpSkillManager {
  private static instance: AcpSkillManager | null = null;
  private static instanceKey: string | null = null;

  private skills: Map<string, SkillDefinition> = new Map();
  private builtinSkills: Map<string, SkillDefinition> = new Map();
  /** User-installed skills from userData/config/skills/ (auto-available to all agents) */
  private userSkills: Map<string, SkillDefinition> = new Map();
  /** Extension-contributed skills loaded from ExtensionRegistry */
  private extensionSkills: Map<string, SkillDefinition> = new Map();
  private skillsDir: string;
  private builtinSkillsDir: string;
  private initialized: boolean = false;
  private builtinInitialized: boolean = false;
  private userSkillsInitialized: boolean = false;
  private extensionInitialized: boolean = false;

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
    const cacheKey = enabledSkills?.toSorted().join(',') || 'all';

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
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

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
   * 发现用户安装的 skills（通过 Skills Hub 导入到 userData/config/skills/ 的技能）
   * 这些 skills 对所有 agent 自动可用，不受 enabledSkills 白名单限制
   *
   * Discover user-installed skills (imported via Skills Hub to userData/config/skills/)
   * These skills are auto-available to all agents, not gated by enabledSkills whitelist
   */
  async discoverUserSkills(): Promise<void> {
    if (this.userSkillsInitialized) return;

    const skillsDir = this.skillsDir;
    if (!existsSync(skillsDir)) {
      this.userSkillsInitialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

        const skillName = entry.name;

        // Skip builtin skills directory
        if (skillName === '_builtin') continue;

        // Skip if already registered as builtin
        if (this.builtinSkills.has(skillName)) continue;

        const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { name, description } = parseFrontmatter(content);

          const skillDef: SkillDefinition = {
            name: name || skillName,
            description: description || `Skill: ${skillName}`,
            location: skillFile,
          };

          this.userSkills.set(skillName, skillDef);
        } catch (error) {
          console.warn(`[AcpSkillManager] Failed to load user skill ${skillName}:`, error);
        }
      }

      if (this.userSkills.size > 0) {
        console.log(`[AcpSkillManager] Discovered ${this.userSkills.size} user-installed skills`);
      }
    } catch (error) {
      console.error(`[AcpSkillManager] Failed to discover user skills:`, error);
    }

    this.userSkillsInitialized = true;
  }

  /**
   * 获取用户安装 skills 的索引
   * Get index of user-installed skills only
   */
  getUserSkillsIndex(): SkillIndex[] {
    return Array.from(this.userSkills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * 获取用户安装 skills 的名称集合
   * Get set of user-installed skill names
   */
  getUserSkillNames(): Set<string> {
    return new Set(this.userSkills.keys());
  }

  /**
   * 从 ExtensionRegistry 加载扩展贡献的 skills
   * Load extension-contributed skills from ExtensionRegistry
   *
   * 扩展 skills 通过 aion-extension.json 的 contributes.skills 声明，
   * 由 SkillResolver 解析后缓存在 ExtensionRegistry 中。
   * 这里将它们合并到 AcpSkillManager 中，使 agent 能够按需加载。
   */
  private async discoverExtensionSkills(enabledSkills?: string[]): Promise<void> {
    if (this.extensionInitialized) return;

    try {
      const registry = ExtensionRegistry.getInstance();
      const extSkills = registry.getSkills();

      if (extSkills.length === 0) {
        this.extensionInitialized = true;
        return;
      }

      for (const extSkill of extSkills) {
        // 如果指定了 enabledSkills，只加载被启用的扩展 skills
        // If enabledSkills is specified, only load enabled extension skills
        if (enabledSkills && enabledSkills.length > 0 && !enabledSkills.includes(extSkill.name)) {
          continue;
        }

        // 避免与内置/用户/可选 skills 冲突 / Avoid conflicts with builtin/user/optional skills
        if (this.builtinSkills.has(extSkill.name) || this.userSkills.has(extSkill.name) || this.skills.has(extSkill.name)) {
          console.warn(`[AcpSkillManager] Extension skill "${extSkill.name}" conflicts with existing skill, skipping`);
          continue;
        }

        const skillDef: SkillDefinition = {
          name: extSkill.name,
          description: extSkill.description,
          location: extSkill.location,
        };

        this.extensionSkills.set(extSkill.name, skillDef);
      }

      if (this.extensionSkills.size > 0) {
        console.log(`[AcpSkillManager] Loaded ${this.extensionSkills.size} extension skills`);
      }
    } catch (error) {
      console.warn('[AcpSkillManager] Failed to load extension skills:', error);
    }

    this.extensionInitialized = true;
  }

  /**
   * 初始化：发现并加载所有 skills 的索引（不加载 body）
   * Initialize: discover and load index of all skills (without body)
   */
  async discoverSkills(enabledSkills?: string[]): Promise<void> {
    // 始终先加载内置 skills / Always load builtin skills first
    await this.discoverBuiltinSkills();

    // 始终加载用户安装的 skills（通过 Skills Hub 导入的，所有 agent 可用）
    // Always load user-installed skills (imported via Skills Hub, available to all agents)
    await this.discoverUserSkills();

    // 加载扩展贡献的 skills / Load extension-contributed skills
    await this.discoverExtensionSkills(enabledSkills);

    if (this.initialized) return;

    // 未指定 enabledSkills 时不加载额外的可选 skills
    // Skip additional optional skills when enabledSkills is not specified
    // 注意：用户安装的 skills 已在上方加载，不受此限制
    // Note: user-installed skills are already loaded above, not affected by this gate
    if (!enabledSkills || enabledSkills.length === 0) {
      this.initialized = true;
      return;
    }

    const skillsDir = this.skillsDir;
    if (!existsSync(skillsDir)) {
      console.warn(`[AcpSkillManager] Skills directory not found: ${skillsDir}`);
      this.initialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

        const skillName = entry.name;

        // 跳过内置 skills 目录 / Skip builtin skills directory
        if (skillName === '_builtin') continue;

        // 跳过已作为用户 skill 加载的 / Skip already loaded as user skill
        if (this.userSkills.has(skillName)) continue;

        // 只加载启用的 skills / Only load enabled skills
        if (!enabledSkills.includes(skillName)) {
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
    // Priority: optional (user-selected) > user-installed (Skills Hub) > builtin (auto-injected) > extension
    // Optional skills come first (explicitly configured for this assistant — highest priority),
    // then user-installed skills (imported via Skills Hub, available to all agents).
    const allSkills: SkillIndex[] = [];

    // 可选 skills 优先（为此助手显式配置，最高优先级）
    // Optional skills first (explicitly configured for this assistant — highest priority)
    for (const skill of this.skills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    // 然后是用户安装的 skills / Then user-installed skills
    for (const skill of this.userSkills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    // 然后是内置 skills / Then builtin skills
    for (const skill of this.builtinSkills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    // 最后是扩展 skills / Then extension skills
    for (const skill of this.extensionSkills.values()) {
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
    return this.builtinSkills.size > 0 || this.userSkills.size > 0 || this.skills.size > 0 || this.extensionSkills.size > 0;
  }

  /**
   * 按名称获取单个 skill 的完整内容（按需加载）
   * 优先级：可选（用户配置）> 内置 > 扩展
   * Get full content of a skill by name (on-demand loading)
   * Priority: optional (user-configured) > builtin > extension
   */
  async getSkill(name: string): Promise<SkillDefinition | null> {
    // Priority: optional > user-installed > builtin > extension
    // 优先查找可选 skills（用户为此助手显式配置）
    // Check optional skills first (explicitly configured for this assistant)
    let skill = this.skills.get(name);
    // 再查找用户安装的 skills / Then search user-installed skills
    if (!skill) {
      skill = this.userSkills.get(name);
    }
    // 再查找内置 skills / Then search builtin skills
    if (!skill) {
      skill = this.builtinSkills.get(name);
    }
    // 最后查找扩展 skills / Then search extension skills
    if (!skill) {
      skill = this.extensionSkills.get(name);
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
    return this.builtinSkills.has(name) || this.userSkills.has(name) || this.skills.has(name) || this.extensionSkills.has(name);
  }

  /**
   * 清除缓存的 body 内容（用于刷新）
   * Clear cached body content (for refresh)
   */
  clearCache(): void {
    for (const skill of this.builtinSkills.values()) {
      skill.body = undefined;
    }
    for (const skill of this.userSkills.values()) {
      skill.body = undefined;
    }
    for (const skill of this.skills.values()) {
      skill.body = undefined;
    }
    for (const skill of this.extensionSkills.values()) {
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
