import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_SKILL_DESCRIPTIONS,
  getOfficialSkillDescriptions,
  getSkillDescriptionEnglish,
  getSkillDescriptionForLocale,
} from '@/renderer/pages/settings/SkillsSettings/officialSkillDescriptions';

const ALL_LOCALES = [
  'en-US',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'es-ES',
  'fr-FR',
  'pt-BR',
  'ru-RU',
  'uk-UA',
  'tr-TR',
  'fa-IR',
] as const;

// The 21 non-auto-inject official skills shipped in the builtin-skills corpus.
const OFFICIAL_SKILL_NAMES = [
  'aionui-troubleshooting',
  'aionui-webui-public',
  'aionui-webui-setup',
  'mermaid',
  'moltbook',
  'morph-ppt-3d',
  'morph-ppt',
  'officecli-academic-paper',
  'officecli-data-dashboard',
  'officecli-docx',
  'officecli-financial-model',
  'officecli-pitch-deck',
  'officecli-pptx',
  'officecli-word-form',
  'officecli-xlsx',
  'openclaw-setup',
  'pdf',
  'story-roleplay',
  'weixin-file-send',
  'x-recruiter',
  'xiaohongshu-recruiter',
];

describe('officialSkillDescriptions', () => {
  it('covers every official skill', () => {
    for (const name of OFFICIAL_SKILL_NAMES) {
      expect(OFFICIAL_SKILL_DESCRIPTIONS[name], `missing entry for ${name}`).toBeDefined();
    }
    expect(Object.keys(OFFICIAL_SKILL_DESCRIPTIONS).toSorted()).toEqual([...OFFICIAL_SKILL_NAMES].toSorted());
  });

  it('provides a non-empty description for every locale of every skill', () => {
    for (const name of OFFICIAL_SKILL_NAMES) {
      const entry = OFFICIAL_SKILL_DESCRIPTIONS[name];
      for (const locale of ALL_LOCALES) {
        expect(typeof entry[locale], `${name}[${locale}] should be a string`).toBe('string');
        expect(entry[locale].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('stores real translations — non-English locales differ from the English original', () => {
    for (const name of OFFICIAL_SKILL_NAMES) {
      const entry = OFFICIAL_SKILL_DESCRIPTIONS[name];
      for (const locale of ALL_LOCALES) {
        if (locale === 'en-US') continue;
        expect(entry[locale], `${name}[${locale}] must be a translation, not English`).not.toBe(entry['en-US']);
      }
    }
  });

  it('keeps traditional Chinese distinct from simplified Chinese', () => {
    for (const name of OFFICIAL_SKILL_NAMES) {
      const entry = OFFICIAL_SKILL_DESCRIPTIONS[name];
      expect(entry['zh-TW'], `${name}: zh-TW should differ from zh-CN`).not.toBe(entry['zh-CN']);
    }
  });

  it('getOfficialSkillDescriptions returns the full locale record for a known skill', () => {
    expect(getOfficialSkillDescriptions('mermaid')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid);
    expect(getOfficialSkillDescriptions('pdf')?.['ja-JP']).toBe(OFFICIAL_SKILL_DESCRIPTIONS.pdf['ja-JP']);
  });

  it('getOfficialSkillDescriptions returns undefined for unknown skills', () => {
    expect(getOfficialSkillDescriptions('totally-custom-skill')).toBeUndefined();
  });

  it('getSkillDescriptionForLocale returns the description in the requested locale', () => {
    expect(getSkillDescriptionForLocale('mermaid', 'zh-CN')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['zh-CN']);
    expect(getSkillDescriptionForLocale('mermaid', 'fa-IR')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['fa-IR']);
  });

  it('getSkillDescriptionForLocale falls back to the English original for unknown locales', () => {
    expect(getSkillDescriptionForLocale('mermaid', 'xx-XX')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
    expect(getSkillDescriptionForLocale('mermaid', 'en')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('getSkillDescriptionForLocale returns undefined for non-official skills', () => {
    expect(getSkillDescriptionForLocale('my-custom-skill', 'zh-CN')).toBeUndefined();
  });

  it('getSkillDescriptionEnglish returns the canonical English description', () => {
    expect(getSkillDescriptionEnglish('mermaid')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('getSkillDescriptionEnglish returns undefined for non-official skills', () => {
    expect(getSkillDescriptionEnglish('my-custom-skill')).toBeUndefined();
  });
});
