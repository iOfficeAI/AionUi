import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Guide/Jarvis speech input wiring', () => {
  const source = readFileSync('src/renderer/pages/guid/GuidPage.tsx', 'utf8');
  const apiRoutes = readFileSync('src/process/webserver/routes/apiRoutes.ts', 'utf8');
  const routerSource = readFileSync('src/renderer/components/layout/Router.tsx', 'utf8');

  it('records speech and appends the transcript to the main command input', () => {
    expect(source).toContain('SpeechInputButton');
    expect(source).toContain('appendSpeechTranscript(previous, transcript)');
    expect(source).toContain('speechInputNode=');
    expect(source).toContain('locale={i18n.language}');
  });

  it('exposes Agent OS Desktop as the primary control plane', () => {
    expect(apiRoutes).toContain("id: 'agent-os-growth'");
    expect(apiRoutes).toContain("name: 'Agent OS Desktop'");
    expect(apiRoutes).toContain("role: 'Primary control plane and source of truth'");
    expect(apiRoutes).toContain("healthPath: '/api/health'");
    expect(apiRoutes).toContain("openUrl: 'http://127.0.0.1:3737/seo-office'");
    expect(apiRoutes).not.toContain("id: 'claw3d'");
    expect(apiRoutes).not.toContain('port: 8095');
  });

  it('routes the legacy office entrypoint to Agent OS without importing the stale office', () => {
    expect(routerSource).toContain("path='/office'");
    expect(routerSource).toContain('AGENT_OS_SEO_OFFICE_URL');
    expect(routerSource).toContain('openExternalUrl(AGENT_OS_SEO_OFFICE_URL)');
    expect(routerSource).not.toContain("import('@renderer/pages/office')");
  });
});
