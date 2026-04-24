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
import { ipcBridge } from '@/common';
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
  /**
   * 文件位置 / File location
   *
   * For builtin skills this is a relative path (e.g.
   * `auto-inject/cron/SKILL.md`) passed back to
   * `ipcBridge.fs.readBuiltinSkill`. For custom / extension skills this is an
   * absolute filesystem path that can be read directly.
   */
  location: string;
  /** 来源 / Source */
  source?: 'builtin' | 'custom' | 'extension';
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

  const nameMatch = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

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
 * - 内置 auto-inject skills (auto-inject/): 所有场景自动注入
 * - 可选 skills: 通过 enabledSkills 参数控制
 */
export class AcpSkillManager {
  private static instance: AcpSkillManager | null = null;
  private static instanceKey: string | null = null;

  private skills: Map<string, SkillDefinition> = new Map();
  private autoSkills: Map<string, SkillDefinition> = new Map();
  /** Extension-contributed skills loaded from ExtensionRegistry */
  private extensionSkills: Map<string, SkillDefinition> = new Map();
  private initialized: boolean = false;
  private autoInitialized: boolean = false;
  private extensionInitialized: boolean = false;

  /**
   * 获取单例实例（带 enabledSkills + excludeBuiltinSkills 缓存键）
   * Get singleton instance (with enabledSkills + excludeBuiltinSkills cache key)
   */
  static getInstance(enabledSkills?: string[], excludeBuiltinSkills?: string[]): AcpSkillManager {
    const enabledPart = enabledSkills?.toSorted().join(',') || 'all';
    const excludePart = excludeBuiltinSkills?.toSorted().join(',') || '';
    const cacheKey = excludePart ? `${enabledPart}|exclude:${excludePart}` : enabledPart;

    if (AcpSkillManager.instance && AcpSkillManager.instanceKey === cacheKey) {
      return AcpSkillManager.instance;
    }

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
   * 初始化：发现并加载 auto-inject 内置 skills 的索引（所有场景自动注入）
   * Initialize: discover and load index of auto-inject builtin skills
   *
   * @param excludeSkills - 排除的内置 skill 名称列表 / Builtin skill names to exclude
   */
  async discoverAutoSkills(excludeSkills?: string[]): Promise<void> {
    if (this.autoInitialized) return;

    const excludeSet = new Set(excludeSkills ?? []);

    try {
      const entries = await ipcBridge.fs.listBuiltinAutoSkills.invoke();

      for (const entry of entries) {
        if (excludeSet.has(entry.name)) continue;

        this.autoSkills.set(entry.name, {
          name: entry.name,
          description: entry.description || `Builtin Skill: ${entry.name}`,
          location: entry.location,
          source: 'builtin',
        });
      }

      console.log(
        `[AcpSkillManager] Discovered ${this.autoSkills.size} auto-inject skills` +
          (excludeSet.size > 0 ? ` (excluded: ${[...excludeSet].join(', ')})` : '')
      );
    } catch (error) {
      // Graceful degrade: log and return empty list (do not throw)
      console.error('[AcpSkillManager] Failed to discover auto-inject skills:', error);
    }

    this.autoInitialized = true;
  }

  /**
   * 从 ExtensionRegistry 加载扩展贡献的 skills
   * Load extension-contributed skills from ExtensionRegistry
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
        if (enabledSkills && enabledSkills.length > 0 && !enabledSkills.includes(extSkill.name)) {
          continue;
        }

        if (this.autoSkills.has(extSkill.name) || this.skills.has(extSkill.name)) {
          console.warn(`[AcpSkillManager] Extension skill "${extSkill.name}" conflicts with existing skill, skipping`);
          continue;
        }

        this.extensionSkills.set(extSkill.name, {
          name: extSkill.name,
          description: extSkill.description,
          location: extSkill.location,
          source: 'extension',
        });
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
  async discoverSkills(enabledSkills?: string[], excludeBuiltinSkills?: string[]): Promise<void> {
    // Always load auto-inject skills first
    await this.discoverAutoSkills(excludeBuiltinSkills);

    // Then extension skills
    await this.discoverExtensionSkills(enabledSkills);

    if (this.initialized) return;

    if (!enabledSkills || enabledSkills.length === 0) {
      this.initialized = true;
      return;
    }

    const enabledSet = new Set(enabledSkills);

    try {
      const available = await ipcBridge.fs.listAvailableSkills.invoke();

      for (const entry of available) {
        if (!enabledSet.has(entry.name)) continue;
        // Auto-inject skills are handled separately
        if (this.autoSkills.has(entry.name)) continue;
        // Do not overwrite already-discovered entries
        if (this.skills.has(entry.name)) continue;

        // For builtin skills prefer the relative location (used by readBuiltinSkill);
        // custom skills expose an absolute path we can read directly.
        const location =
          entry.source === 'builtin' && entry.relative_location ? entry.relative_location : entry.location;

        this.skills.set(entry.name, {
          name: entry.name,
          description: entry.description || `Skill: ${entry.name}`,
          location,
          source: entry.source,
        });
      }

      console.log(`[AcpSkillManager] Discovered ${this.skills.size} optional skills`);
    } catch (error) {
      // Graceful degrade: log and keep going with whatever we've already discovered
      console.error('[AcpSkillManager] Failed to discover optional skills:', error);
    }

    this.initialized = true;
  }

  /**
   * 获取所有 skills 的索引（轻量级）
   * Get index of all skills (lightweight)
   */
  getSkillsIndex(): SkillIndex[] {
    const allSkills: SkillIndex[] = [];

    for (const skill of this.skills.values()) {
      allSkills.push({ name: skill.name, description: skill.description });
    }

    for (const skill of this.autoSkills.values()) {
      allSkills.push({ name: skill.name, description: skill.description });
    }

    for (const skill of this.extensionSkills.values()) {
      allSkills.push({ name: skill.name, description: skill.description });
    }

    return allSkills;
  }

  /**
   * 获取内置 skills 的索引
   * Get index of builtin auto-inject skills only
   */
  getBuiltinSkillsIndex(): SkillIndex[] {
    return Array.from(this.autoSkills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * 检查是否有任何 skills（内置或可选）
   */
  hasAnySkills(): boolean {
    return this.autoSkills.size > 0 || this.skills.size > 0 || this.extensionSkills.size > 0;
  }

  /**
   * 按名称获取单个 skill 的完整内容（按需加载）
   * 优先级：可选（用户配置）> 内置 > 扩展
   */
  async getSkill(name: string): Promise<SkillDefinition | null> {
    let skill = this.skills.get(name);
    if (!skill) {
      skill = this.autoSkills.get(name);
    }
    if (!skill) {
      skill = this.extensionSkills.get(name);
    }
    if (!skill) return null;

    if (skill.body === undefined) {
      skill.body = await this.loadSkillBody(skill);
    }

    return skill;
  }

  /**
   * Load the body content for a skill. Route builtin skills through the
   * backend HTTP read; custom / extension skills are read from the local
   * filesystem because their content is not embedded in the backend.
   */
  private async loadSkillBody(skill: SkillDefinition): Promise<string> {
    try {
      if (skill.source === 'builtin') {
        const content = await ipcBridge.fs.readBuiltinSkill.invoke({ fileName: skill.location });
        return extractBody(content);
      }
      const content = await fs.readFile(skill.location, 'utf-8');
      return extractBody(content);
    } catch (error) {
      console.warn(`[AcpSkillManager] Failed to load skill body for ${skill.name}:`, error);
      return '';
    }
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
   */
  hasSkill(name: string): boolean {
    return this.autoSkills.has(name) || this.skills.has(name) || this.extensionSkills.has(name);
  }

  /**
   * 清除缓存的 body 内容（用于刷新）
   */
  clearCache(): void {
    for (const skill of this.autoSkills.values()) {
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

// ---------------------------------------------------------------------------
// Test helpers — exported for unit tests only.
// ---------------------------------------------------------------------------
export const _parseFrontmatter = parseFrontmatter;
export const _extractBody = extractBody;

/**
 * 构建 skills 索引文本（用于首条消息注入）
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
 */
export function buildSkillContentText(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  return skills.map((s) => `[Skill: ${s.name}]\n${s.body}`).join('\n\n');
}
