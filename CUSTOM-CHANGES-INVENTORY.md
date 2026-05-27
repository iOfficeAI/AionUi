# Custom Changes Inventory — POUNDING Fork (Phase 1)

Sourced from RALPLAN Phase 1 Step 6: "Inventory existing custom changes that
must survive into the stable product line."

## AionCore (6 commits cherry-picked onto v0.1.9)

| Change                                    | Files     | Status |
| ----------------------------------------- | --------- | ------ |
| Brand identity (productName renames)      | 2 files   | ✅     |
| Managed Claude/OpenClaw runtime identity  | 3 files   | ✅     |
| CLI default model selection + persistence | 7 files   | ✅     |
| Ozon builtin assistant + skill bundle     | 123 files | ✅     |
| AionRS identity and CC-switch sync        | 7 files   | ✅     |
| Branch governance + maintainer checklist  | 2 files   | ✅     |

## AionUi (applied as 3 commits on v2.0.7)

| Change                                            | Category | Files                                                                                                                           | Status |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Product name: AionUi → POUNDING                   | Brand    | package.json, electron-builder.yml, app icons (icns, ico, png), .gitignore                                                      | ✅     |
| i18n brand strings (all 8 locales × 5 files each) | Brand    | 40 locale JSON files                                                                                                            | ✅     |
| Publish owner: iOfficeAI → halojerry              | Release  | electron-builder.yml                                                                                                            | ✅     |
| COS-based release distribution                    | Release  | release-distribute.yml, 4 COS scripts, autoUpdaterService.ts, updateBridge.ts, updateTypes.ts                                   | ✅     |
| CLI managed runtime installer + model sync        | CLI      | managedCliInstallerBridge.ts, managedRuntimeCli.ts, AcpModelSelector.tsx, GuidModelSelector.tsx, NewApiDesktopAccountService.ts | ✅     |
| Login flow customization                          | Auth     | login page, NewApiAccountContext, DesktopLoginGate                                                                              | ✅     |
| Auto-update chain (COS endpoint)                  | Update   | updateBridge, autoUpdaterService, electron.vite.config, sentry.ts                                                               | ✅     |
| GitHub Actions packaging                          | CI       | build-and-release.yml, pr-checks.yml (+release/pounding-\*), \_build-reusable.yml, pack-web-cli.yml                             | ✅     |
| Brand hiding / release-only UI                    | UI       | Layout.tsx, Router.tsx, Titlebar, AboutModal, SiderFooter, settings modals                                                      | ✅     |
| Feishu/Lark doc links                             | Docs     | remote-agent.md, all 7 translated READMEs                                                                                       | ✅     |
| Conversation tabs (new components)                | Features | ConversationTabs.tsx, ConversationTabsContext.tsx                                                                               | ✅     |
| Process utilities (branding-specific)             | Process  | configureChromium, configureConsoleLog, ensureAdminUser, webuiConfig, webuiBridge, binaryResolver                               | ✅     |
| API/client customizations                         | API      | client.ts, ws.ts, providerApi.ts, storageKeys.ts, httpBridge.ts, ipcBridge.ts                                                   | ✅     |
| Markdown/sendbox UI                               | UI       | CodeBlock.tsx, ShadowView.tsx, sendbox.css, sendbox.tsx                                                                         | ✅     |
| Workspace components                              | UI       | Workspace components, workspace hooks, WorkspaceFolderSelect                                                                    | ✅     |
| Hooks/customizations                              | Core     | useAutoTitle, useInputFocusRing, NavigationHistoryContext, useMcpOperations, useResizableSplit                                  | ✅     |
| Branch governance + maintainer checklist          | Docs     | BRANCH-GOVERNANCE.md, MAINTAINER-CHECKLIST.md, PHASE1-DISTRIBUTION-DECISION.md                                                  | ✅     |
