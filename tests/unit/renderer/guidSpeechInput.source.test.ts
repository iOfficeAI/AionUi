import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Guide/Jarvis speech input wiring', () => {
  const source = readFileSync('src/renderer/pages/guid/GuidPage.tsx', 'utf8');
  const apiRoutes = readFileSync('src/process/webserver/routes/apiRoutes.ts', 'utf8');

  it('records speech and appends the transcript to the main command input', () => {
    expect(source).toContain('SpeechInputButton');
    expect(source).toContain('appendSpeechTranscript(previous, transcript)');
    expect(source).toContain('speechInputNode=');
    expect(source).toContain('locale={i18n.language}');
  });

  it('exposes the live Agent OS growth cockpit inside AionUi', () => {
    expect(apiRoutes).toContain("id: 'agent-os-growth'");
    expect(apiRoutes).toContain("healthPath: '/api/health'");
    expect(apiRoutes).toContain("openUrl: 'http://127.0.0.1:3737/seo'");
  });
});
