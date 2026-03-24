/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill source type.
 * - bundled:       Ships with AionUI (originally in _builtin/ directory)
 * - custom:        Manually imported by user into skills/ directory
 * - remote:        Fetched from a remote URL (future feature)
 * - auto-detected: Discovered by scanning CLI workspace skill directories
 */
export type SkillSource = 'bundled' | 'custom' | 'remote' | 'auto-detected';

/**
 * Skill runtime health status.
 * - healthy: File exists and frontmatter parses successfully
 * - error:   File exists but parsing failed (corrupt metadata, encoding issues)
 * - missing: Expected path does not exist (file deleted or symlink broken)
 */
export type SkillStatus = 'healthy' | 'error' | 'missing';

/**
 * Skills Market metadata. Only present when origin === 'skills-market'.
 * Contains publisher, version, checksum for traceability and integrity verification.
 */
export type SkillMarketMeta = {
  /** @handle on skills.aionui.com */
  handle: string;
  /** Skill name on Market */
  name: string;
  /** Semver version from Market */
  version: string;
  /** SHA256 checksum of the downloaded SKILL.md */
  checksum: string;
  /** Original download URL */
  downloadUrl: string;
  /** ISO 8601 timestamp of when the skill was cached locally */
  cachedAt: string;
};

/**
 * Skill metadata, parsed from SKILL.md frontmatter or extension manifest.
 */
export type SkillMetadata = {
  /** User-facing description (for indexing and UI display) */
  description: string;
  /** Semantic version (provided by remote / extension skills) */
  version?: string;
  /** Author information */
  author?: string;
  /**
   * Origin subtype qualifier — distinguishes different origins within the same source category.
   *
   * - 'extension': Skill contributed by the extension system. When source is 'bundled'
   *   or 'custom' but actually injected by an extension, origin is set to 'extension'.
   * - 'skills-market': Skill downloaded by agent from Skills Market (skills.aionui.com),
   *   source is 'remote'. Market skills have semver version tracking and sha256 verification.
   */
  origin?: 'extension' | 'skills-market';
  /** Extension name that contributed this skill (only when origin === 'extension') */
  extensionName?: string;
  /** Skills Market metadata (only when origin === 'skills-market') */
  market?: SkillMarketMeta;
};

/**
 * SkillEntry — Single record in the Skill Repository.
 *
 * Evolved from {@link import('../task/AcpSkillManager').SkillDefinition}, adding:
 * - `source`: Source tracking, replacing implicit classification via separate Maps
 * - `remoteUrl`: Remote skill fetch URL
 * - `metadata`: Structured metadata, replacing flat description field
 * - `status`: Runtime health status
 * - `importedAt` / `lastUpdated`: Timestamps for sorting and expiry detection
 *
 * Backward compatible: `name` + `metadata.description` + `path` can losslessly
 * convert back to the legacy SkillDefinition.
 */
export type SkillEntry = {
  /** Unique skill identifier (directory name, globally unique across sources) */
  name: string;
  /** Skill source */
  source: SkillSource;
  /** Remote fetch URL (only when source === 'remote') */
  remoteUrl?: string;
  /** Absolute path to SKILL.md file */
  path: string;
  /** Structured metadata */
  metadata: SkillMetadata;
  /** Runtime health status */
  status: SkillStatus;
  /** First import timestamp (milliseconds) */
  importedAt: number;
  /** Last updated timestamp (milliseconds, file modification or remote sync) */
  lastUpdated: number;
};

/**
 * Single skill's global configuration.
 */
export type GlobalSkillSetting = {
  /** Whether globally enabled */
  enabled: boolean;
  /** Enable timestamp (for audit and UI sorting) */
  enabledAt?: number;
};

/**
 * GlobalSkillConfig — Global skill toggle.
 *
 * Key is SkillEntry.name, value is the toggle configuration.
 * Skills not present in config default to:
 * - bundled: enabled
 * - custom / remote: enabled
 * - auto-detected: disabled (requires user confirmation)
 */
export type GlobalSkillConfig = Record<string, GlobalSkillSetting>;

/**
 * AssistantSkillConfig — Per-assistant skill override configuration.
 *
 * Replaces:
 * - TChatConversation.extra.enabledSkills: string[]
 * - AssistantPreset.defaultEnabledSkills: string[]
 * - ExtAssistantSchema.enabledSkills: z.array(z.string())
 *
 * Semantics:
 * - added is empty [] -> use all Global enabled skills (no additional adds)
 * - added is not empty -> use only the skills listed in added (precise selection mode)
 * - blocked           -> excluded from final result (highest priority)
 */
export type AssistantSkillConfig = {
  /**
   * Explicitly added skill names.
   * Empty array = inherit all Global enabled skills.
   * Non-empty = precise selection mode, only use listed skills.
   */
  added: string[];
  /**
   * Explicitly blocked skill names.
   * Regardless of Global or added configuration, blocked skills are never injected.
   * Typical use: an assistant that does not need a specific bundled skill (e.g. cron).
   */
  blocked: string[];
};

/**
 * EffectiveSkills — Final computed skill set for a specific assistant.
 *
 * Produced by the gating mechanism, not persisted, used only at runtime.
 */
export type EffectiveSkills = {
  /** Final effective SkillEntry list (sorted: custom > remote > bundled > auto-detected) */
  skills: SkillEntry[];
  /**
   * Source tracking per skill, for UI display and debugging.
   * Key: skill name
   * Value: why this skill appears in the final list
   */
  sources: Record<
    string,
    {
      /** Skill's original source */
      source: SkillSource;
      /** Whether granted by Global config or Assistant added */
      grantedBy: 'global' | 'assistant';
      /** If blocked, the reason */
      blockedReason?: string;
    }
  >;
};

/**
 * SkillRepository query filter.
 */
export type SkillFilter = {
  /** Filter by source */
  source?: SkillSource | SkillSource[];
  /** Filter by status */
  status?: SkillStatus | SkillStatus[];
  /** Filter by name prefix */
  namePrefix?: string;
  /** Whether to include extension-contributed skills */
  includeExtension?: boolean;
};

/**
 * Persisted skill registry format (for disk cache).
 */
export type PersistedSkillRegistry = {
  version: number;
  entries: SkillEntry[];
};

/**
 * Health check result summary.
 */
export type HealthCheckResult = {
  healthy: number;
  error: number;
  missing: number;
};
