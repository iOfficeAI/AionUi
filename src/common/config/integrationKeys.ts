/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type IntegrationDefinition = {
  envKey: string;
  label: string;
  link: string;
  docsLabel: string;
  helperLink?: string;
  helperLabel?: string;
  group: 'core' | 'cloud' | 'media' | 'ops' | 'developer';
};

export const INTEGRATION_KEYS: IntegrationDefinition[] = [
  {
    envKey: 'OPENAI_API_BASE',
    label: 'OpenAI API Base',
    link: 'https://platform.openai.com/docs/api-reference',
    docsLabel: 'OpenAI API Reference',
    group: 'core',
  },
  {
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    link: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI API Keys',
    group: 'core',
  },
  {
    envKey: 'ANTHROPIC_API_BASE',
    label: 'Anthropic API Base',
    link: 'https://docs.anthropic.com/',
    docsLabel: 'Anthropic Docs',
    group: 'core',
  },
  {
    envKey: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    link: 'https://docs.anthropic.com/en/api/api-keys',
    docsLabel: 'Anthropic API keys',
    group: 'core',
  },
  {
    envKey: 'CLAUDE_API_KEY',
    label: 'Claude API Key',
    link: 'https://docs.anthropic.com/en/docs/quickstart',
    docsLabel: 'Claude docs',
    group: 'core',
  },
  {
    envKey: 'CLAUDE_ACCESS_TOKEN',
    label: 'Claude Access Token',
    link: 'https://claude.ai/settings/tokens',
    docsLabel: 'Claude token settings',
    group: 'core',
  },
  {
    envKey: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    label: 'Google Credentials JSON',
    link: 'https://cloud.google.com/docs/authentication/provide-credentials-adc',
    docsLabel: 'Google auth docs',
    group: 'cloud',
  },
  {
    envKey: 'GOOGLE_API_KEY',
    label: 'Google API Key',
    link: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Google AI Studio',
    group: 'cloud',
  },
  {
    envKey: 'GEMINI_API_KEY',
    label: 'Gemini API Key',
    link: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Gemini API key',
    group: 'cloud',
  },
  {
    envKey: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    link: 'https://openrouter.ai/settings/keys',
    docsLabel: 'OpenRouter keys',
    group: 'cloud',
  },
  {
    envKey: 'GROQ_API_KEY',
    label: 'Groq API Key',
    link: 'https://console.groq.com/keys',
    docsLabel: 'Groq keys',
    group: 'cloud',
  },
  {
    envKey: 'PERPLEXITY_API_KEY',
    label: 'Perplexity API Key',
    link: 'https://www.perplexity.ai/settings/api',
    docsLabel: 'Perplexity API',
    group: 'cloud',
  },
  {
    envKey: 'XAI_API_KEY',
    label: 'xAI / Grok API Key',
    link: 'https://console.x.ai/',
    docsLabel: 'xAI Console',
    group: 'cloud',
  },
  {
    envKey: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API Key',
    link: 'https://platform.deepseek.com/api_keys',
    docsLabel: 'DeepSeek keys',
    group: 'cloud',
  },
  {
    envKey: 'HUGGINGFACE_API_KEY',
    label: 'Hugging Face API Key',
    link: 'https://huggingface.co/settings/tokens',
    docsLabel: 'HF token settings',
    group: 'developer',
  },
  {
    envKey: 'HF_TOKEN',
    label: 'HF Token',
    link: 'https://huggingface.co/settings/tokens',
    docsLabel: 'HF token settings',
    group: 'developer',
  },
  {
    envKey: 'OLLAMA_API_KEY',
    label: 'Ollama API Key',
    link: 'https://ollama.com/',
    docsLabel: 'Ollama',
    group: 'developer',
  },
  {
    envKey: 'KRYVAI_API_KEY',
    label: 'Kryven API Key (legacy)',
    link: 'https://kryven.cc/docs/',
    docsLabel: 'Kryven docs',
    helperLink: 'https://kryven.cc/docs/',
    helperLabel: 'Get Kryven key',
    group: 'developer',
  },
  {
    envKey: 'KRYVEN_API_KEY',
    label: 'Kryven API Key',
    link: 'https://kryven.cc/docs/',
    docsLabel: 'Kryven docs',
    helperLink: 'https://kryven.cc/docs/',
    helperLabel: 'Get Kryven key',
    group: 'developer',
  },
  {
    envKey: 'SUNO_COOKIE',
    label: 'Suno Cookie',
    link: 'https://suno.com/',
    docsLabel: 'Suno',
    group: 'media',
  },
  {
    envKey: 'DISCORD_BOT_TOKEN',
    label: 'Discord Bot Token',
    link: 'https://discord.com/developers/applications',
    docsLabel: 'Discord Developer Portal',
    group: 'ops',
  },
  {
    envKey: 'TELEGRAM_BOT_TOKEN',
    label: 'Telegram Bot Token',
    link: 'https://core.telegram.org/bots/tutorial',
    docsLabel: 'Telegram bot docs',
    group: 'ops',
  },
  {
    envKey: 'LIVEKIT_API_KEY',
    label: 'LiveKit API Key',
    link: 'https://docs.livekit.io/realtime/security/api-keys/',
    docsLabel: 'LiveKit API keys',
    group: 'media',
  },
  {
    envKey: 'LIVEKIT_API_SECRET',
    label: 'LiveKit API Secret',
    link: 'https://docs.livekit.io/realtime/security/api-keys/',
    docsLabel: 'LiveKit API keys',
    group: 'media',
  },
  {
    envKey: 'LIVEKIT_URL',
    label: 'LiveKit URL',
    link: 'https://docs.livekit.io/home/self-hosting/docker/',
    docsLabel: 'LiveKit host setup',
    group: 'media',
  },
  {
    envKey: 'CLICKUP_API_TOKEN',
    label: 'ClickUp API Token',
    link: 'https://help.clickup.com/hc/en-us/articles/6303420891089-API-Token',
    docsLabel: 'ClickUp API token',
    group: 'ops',
  },
  {
    envKey: 'KAGGLE_USERNAME',
    label: 'Kaggle Username',
    link: 'https://www.kaggle.com/settings',
    docsLabel: 'Kaggle settings',
    group: 'developer',
  },
  {
    envKey: 'KAGGLE_KEY',
    label: 'Kaggle API Key',
    link: 'https://www.kaggle.com/settings',
    docsLabel: 'Kaggle settings',
    group: 'developer',
  },
  {
    envKey: 'WOLFRAM_ALPHA_API_KEY',
    label: 'Wolfram Alpha API Key',
    link: 'https://products.wolframalpha.com/api/',
    docsLabel: 'Wolfram Alpha API',
    group: 'developer',
  },
  {
    envKey: 'CLAW3D_API_KEY',
    label: 'Claw3D API Key',
    link: 'https://app.claw3d.ai/',
    docsLabel: 'Claw3D',
    group: 'media',
  },
  {
    envKey: 'GITLAB_TOKEN',
    label: 'GitLab Token',
    link: 'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html',
    docsLabel: 'GitLab PAT guide',
    group: 'developer',
  },
  {
    envKey: 'GITHUB_TOKEN',
    label: 'GitHub Token',
    link: 'https://github.com/settings/tokens',
    docsLabel: 'GitHub tokens',
    group: 'developer',
  },
  {
    envKey: 'DEVIN_API_KEY',
    label: 'Devin API Key',
    link: 'https://app.devin.ai/settings',
    docsLabel: 'Devin settings',
    group: 'developer',
  },
  {
    envKey: 'RESEND_API_KEY',
    label: 'Resend API Key',
    link: 'https://resend.com/api-keys',
    docsLabel: 'Resend keys',
    group: 'ops',
  },
  {
    envKey: 'HOSTINGER_API_TOKEN',
    label: 'Hostinger API Token',
    link: 'https://developers.hostinger.com/',
    docsLabel: 'Hostinger API',
    group: 'ops',
  },
];

export const INTEGRATION_KEY_ALLOWLIST = INTEGRATION_KEYS.map((item) => item.envKey);
