import { describe, expect, it } from 'vitest';
import { COMMAND_EVE_ASSISTANT_ID } from '@/common/config/commandEveShell';
import {
  COMMAND_EVE_ASSISTANT_RULE_DE,
  COMMAND_EVE_ASSISTANT_RULE_EN,
  COMMAND_EVE_ASSISTANT_SKILL_DE,
  COMMAND_EVE_ASSISTANT_SKILL_EN,
  buildCommandEveAssistantFirstRunContext,
  buildCommandEveAssistant,
  buildCommandEveAssistantContext,
  buildCommandEveAssistantSkill,
  selectCommandEvePresetAgentType,
  unwrapCommandEveApiData,
} from '@/process/commandEve/assistantBootstrapCore';

describe('Command EVE assistant bootstrap core', () => {
  it('prefers Hermes only when a verified Hermes agent is detected', () => {
    expect(
      selectCommandEvePresetAgentType([
        { backend: 'codex', available: true },
        { backend: 'claude', available: true },
      ])
    ).toBe('aionrs');

    expect(
      selectCommandEvePresetAgentType([
        { backend: 'codex', available: true },
        { backend: 'hermes', available: true },
      ])
    ).toBe('hermes');
  });

  it('falls back to Aion CLI when no preferred external backend is available', () => {
    expect(selectCommandEvePresetAgentType([{ backend: 'codex', available: false }])).toBe('aionrs');
  });

  it('unwraps backend API envelopes before runtime selection', () => {
    const agents = unwrapCommandEveApiData({
      success: true,
      data: [{ backend: 'codex', available: true }],
    });

    expect(selectCommandEvePresetAgentType(agents)).toBe('aionrs');
  });

  it('builds the canonical EVE preset assistant', () => {
    const assistant = buildCommandEveAssistant('codex');
    expect(assistant.id).toBe(COMMAND_EVE_ASSISTANT_ID);
    expect(assistant.name).toBe('EVE');
    expect(assistant.preset_agent_type).toBe('codex');
    expect(assistant.avatar).toBe('command-eve-logo.svg');
    expect(assistant.description).toContain('Chief-of-Staff-Schicht');
    expect(assistant.description_i18n?.['de-DE']).toContain('Chief-of-Staff');
    expect(assistant.disabled_builtin_skills).toEqual(['aionui-skills', 'cron', 'officecli', 'skill-creator']);
  });

  it('keeps execution backends separate from EVE identity', () => {
    expect(buildCommandEveAssistantContext('1.0.0-alpha.4')).toContain('Execution backends are tools, not identity');
  });

  it('codifies authority and secret boundaries in both supported languages', () => {
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('Du setzt keine Plane-Items auf Done');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('sprichst du Deutsch und per Du');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('Passwoertern');
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('You do not set Plane items to Done');
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('informal "Du"');
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('raw tokens');
  });

  it('bootstraps EVE with the Chief-of-Staff skill and connector catalog', () => {
    expect(COMMAND_EVE_ASSISTANT_SKILL_DE).toContain('content-machine');
    expect(COMMAND_EVE_ASSISTANT_SKILL_DE).toContain('Codex CLI');
    expect(COMMAND_EVE_ASSISTANT_SKILL_DE).toContain('Worker Contract Draft mit Dispatch: manual');
    expect(COMMAND_EVE_ASSISTANT_SKILL_EN).toContain('video-first-content-engine');
    expect(COMMAND_EVE_ASSISTANT_SKILL_EN).toContain('Claude Code CLI');
    expect(COMMAND_EVE_ASSISTANT_SKILL_EN).toContain('connected only when a preflight/receipt proves it');
  });

  it('renders local runtime, identity, skill and connector status into EVE first-run context', () => {
    const context = buildCommandEveAssistantFirstRunContext(
      {
        appVersion: '1.0.0-alpha.4',
        profile: {
          founder_name: 'Mathias Heinke',
          company_name: 'FYN Labs',
          source: 'macos_full_name',
          confidence: 'needs_confirmation',
          needs_confirmation: true,
        },
        receipt: {
          status: 'ready',
          provider: 'ollama',
          default_model: 'gemma4:12b',
          next_action: 'Runtime ready for EVE first session.',
          capabilities: { skills: 10, connectors: 11 },
          stages: [{ id: 'model', status: 'pass' }],
        },
        capabilityPack: {
          skills: [
            { id: 'first-run-company-discovery', default_state: 'active' },
            { id: 'content-machine', default_state: 'available' },
          ],
          connectors: [
            { id: 'local-command-eve-runtime', default_state: 'installed' },
            { id: 'codex-cli', default_state: 'unverified' },
            { id: 'honcho-memory', default_state: 'needs_auth' },
            { id: 'marketing-publishing-stack', default_state: 'gated' },
          ],
        },
      },
      'de-DE'
    );

    expect(context).toContain('Runtime: ready');
    expect(context).toContain('Sprich Deutsch und per Du');
    expect(context).toContain('Founder-Seed: Mathias Heinke (vom User bestaetigen lassen)');
    expect(context).toContain('Aktive Skills: first-run-company-discovery');
    expect(context).toContain('Connector unverified: codex-cli');
    expect(context).toContain('Connector gated: marketing-publishing-stack');
  });

  it('appends first-run context to the persisted EVE skill', () => {
    const skill = buildCommandEveAssistantSkill('en-US', {
      appVersion: '1.0.0-alpha.4',
      receipt: {
        status: 'blocked',
        default_model: 'gemma4:12b',
        provider: 'ollama',
        stages: [{ id: 'model', status: 'blocked', code: 'MODEL_NOT_FETCHED' }],
      },
      capabilityPack: {
        skills: [{ id: 'security-fortress-review', default_state: 'gated' }],
        connectors: [{ id: 'github-gitnexus', default_state: 'needs_auth' }],
      },
    });

    expect(skill).toContain('# Command EVE First-Run Skill');
    expect(skill).toContain('Local First-Run Context');
    expect(skill).toContain('model:MODEL_NOT_FETCHED');
    expect(skill).toContain('Connectors needs_auth: github-gitnexus');
  });
});
