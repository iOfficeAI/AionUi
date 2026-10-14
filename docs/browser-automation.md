# Browser Automation in AionUi

## Overview

AionUi provides an end-to-end browser automation platform enabling coding agents, subagents, and the multi-agent teamwork feature to drive persistent web sessions, interact with complex web applications (such as Google Flow for AI video generation or social platforms), manage file downloads, execute parameterized workflows, and enforce security safety gates.

---

## Architecture & Process Boundaries

In accordance with AionUi architectural boundaries, all browser control code adheres strictly to the process boundary:

```
┌────────────────────────────────────────────────────────┐
│                   Renderer Process                     │
│  - BrowserPanel (live webview, address bar, profiles)  │
│  - ActionLogDrawer (execution timeline, error previews)│
│  - SafetyApprovalModal (pre-action gate approval)      │
│  - BrowserAutomationSettings (profiles & post caps)    │
└───────────────────────────┬────────────────────────────┘
                            │ (Typed IPC via contextBridge)
┌───────────────────────────▼────────────────────────────┐
│                    IPC Bridge Layer                    │
│  packages/desktop/src/process/bridge/browserBridge.ts  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                      Main Process                      │
│  packages/desktop/src/process/services/browser/        │
│  - BrowserProfileService (multi-profile partitions)    │
│  - ExternalChromeLauncher (CDP fallback for Google)    │
│  - BrowserAutomationEngine (resilient locators)        │
│  - BrowserDownloadManager (session interception)       │
│  - BrowserToolService (MCP & agent tools)              │
│  - BrowserWorkflowEngine (parameterized workflows)    │
│  - social/BrowserSafetyGateService (approval gates)    │
│  - social/SocialRateLimiter (pacing & daily caps)      │
│  - social/SocialApiService (Graph API + fallback)      │
└────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. Persistent Browser Sessions & Profiles

- Embedded profiles persist cookies, localStorage, and IndexedDB under partition `persist:aionui-browser-<profileId>`.
- Profile data is never logged or exposed. A dedicated "Clear Profile Data" action cleans storage without leaking credentials.
- Multi-profile management allows isolated sessions (e.g. `default`, `brand-instagram`, `work-google`).

### 2. External Chrome CDP Fallback

- **Problem**: Google services often block logins inside embedded Electron browsers ("this browser or app may not be secure").
- **Solution**: Profiles can select backend mode `external-chrome`. AionUi launches or attaches to real Google Chrome via Chrome DevTools Protocol (`--remote-debugging-port=9222` and isolated `--user-data-dir`). The user logs in once in standard Chrome, and automation reuses the session.

### 3. Resilient Automation Engine

- Locators prioritize resilient attributes over brittle CSS paths:
  ```ts
  type ResilientLocator = {
    role?: string;
    name?: string;
    label?: string;
    text?: string;
    placeholder?: string;
    testId?: string;
    css?: string;
    xpath?: string;
  };
  ```
- Retries with backoff on intermittent DOM updates.
- Automatic failure screenshots attached to diagnostic logs.
- Accessibility tree extractor (`browser_snapshot`) provides clean semantic nodes for LLM reasoning.

### 4. Download Manager

- Intercepts Electron session `will-download` events.
- Automatically routes downloads to structured workspace directories:
  ```
  <workspace>/browser-downloads/<profile>/<YYYY-MM-DD>/<filename>
  ```
- File completion verification guarantees non-zero file sizes and cleans `.crdownload`/`.tmp` before reporting success.
- Handles both direct downloads and JavaScript `blob:` URLs.

### 5. Agent & Multi-Agent Team Integration

Exposes 13 tools for coding agents and teamwork roles (`Worker`, `Explorer`, `Sentinel`):

- `browser_open`: Navigate to URL.
- `browser_click`: Click element with resilient locator.
- `browser_type`: Enter text with optional clearing.
- `browser_press_key`: Send keyboard key events.
- `browser_select`: Select dropdown options.
- `browser_wait`: Wait for element, text, or network state (up to 10 min for media generation).
- `browser_snapshot`: Semantic accessibility DOM snapshot.
- `browser_screenshot`: Visual base64 screenshot.
- `browser_download`: Intercept or wait for file downloads.
- `browser_upload`: Set local files on file input elements.
- `browser_list_tabs`: List open tabs.
- `browser_close`: Close tab or browser.
- `browser_set_profile`: Switch active profile.

### 6. Safety Gates & Social Rate Limiting

- **Approval Gate**: Any action that publishes (`publish`), sends (`send`), deletes (`delete`), or spends money (`spend`) requires an explicit prompt before executing. Auto-approve can be toggled per action type in Settings.
- **Human Pacing**: Adds randomized jitter (2-5s delays) between actions to emulate human interaction.
- **Daily Post Cap**: Configurable limit (default 10 posts/day) preventing social account restrictions.
- **Dual Mode**: Official API (Instagram Graph API, Facebook Pages API) is preferred when access tokens are provided; automated browser workflows act as fallback.

---

## How to Add a New Site Workflow

### Step 1: Define Resilient Site Selectors

Create a dedicated config file under `packages/desktop/src/common/browser/sites/<siteName>.ts`:

```ts
import type { ResilientLocator } from '../types';

export const MY_SITE_CONFIG = {
  id: 'my-site',
  name: 'My Site',
  baseUrl: 'https://example.com',
  selectors: {
    inputField: {
      role: 'textbox',
      label: 'Search',
      placeholder: 'Enter query...',
    } satisfies ResilientLocator,
    submitButton: {
      role: 'button',
      name: 'Search',
      text: 'Search',
    } satisfies ResilientLocator,
  },
};
```

Export it from `packages/desktop/src/common/browser/sites/index.ts`.

### Step 2: Register Workflow in `BrowserWorkflowEngine`

Define parameters and sequential steps in `packages/desktop/src/process/services/browser/BrowserWorkflowEngine.ts`:

```ts
export const MY_WORKFLOW: BrowserWorkflowDefinition = {
  id: 'my-search-workflow',
  name: 'Search and Export',
  description: 'Search on My Site and download the export',
  version: '1.0.0',
  site: 'my-site',
  parameters: [
    { name: 'query', type: 'string', description: 'Search term', required: true },
    { name: 'outputDir', type: 'string', description: 'Destination folder' },
  ],
  steps: [
    { id: 's1', name: 'Open Site', action: 'open', value: MY_SITE_CONFIG.baseUrl },
    { id: 's2', name: 'Type Query', action: 'type', locator: MY_SITE_CONFIG.selectors.inputField, value: '{{query}}' },
    { id: 's3', name: 'Submit', action: 'click', locator: MY_SITE_CONFIG.selectors.submitButton },
    { id: 's4', name: 'Wait Download', action: 'download', value: '{{outputDir}}' },
  ],
};
```

---

## Known Limitations & Troubleshooting

1. **Google Account Sign-In**:
   - Embedded Electron webviews may display "This browser or app may not be secure".
   - **Fix**: Switch the profile backend to `External Chrome` in the browser panel, start Chrome on port 9222, sign in once, and automation will reuse that session.

2. **Cloudflare & Bot Challenges**:
   - If a site presents a CAPTCHA or Cloudflare challenge, click the **"Take Over"** button on the BrowserPanel toolbar to pause the automation, solve the challenge manually, then click **"Release"** to resume.

3. **Emergencies & Aborts**:
   - Click the prominent red **"STOP Automation"** button in the BrowserPanel toolbar or use the Action Log drawer to immediately cancel running browser tasks.
