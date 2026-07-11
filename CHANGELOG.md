# Changelog

## [2.1.33](https://github.com/iOfficeAI/AionUi/compare/v2.1.32...v2.1.33) (2026-07-11)

### Desktop

#### Bug Fixes

- **build:** align Codex installer verifier (#3561)

---

## [2.1.32](https://github.com/iOfficeAI/AionUi/compare/v2.1.31...v2.1.32) (2026-07-10)

### Desktop

#### Bug Fixes

- **i18n:** update Russian localization (#3541)

#### Features

- **i18n:** add French locale (#2731)
- **guid:** move mobile home input controls into a + action sheet (#3554)
- **team:** add manual teammate management (#3532)
- **conversation:** rework model selector into a two-level menu (#3550)
- **conversation:** rework message queue into a send draft box (#3547)

#### Refactoring

- **conversation:** fold draft box help into the mode toggle (#3553)

### Core ([v0.1.45](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.45))

#### Features

- **ai-agent:** adapt to aionrs v0.2.2 config changes
- **cli:** add agent-facing config and diagnose commands (#595)

#### Bug Fixes

- **ai-agent:** cap provider health check tokens
- **ai-agent:** set default aionrs thinking cli args
- **model_fetcher:** extract first key from multi-line api_key for HTTP requests (#593)
- **runtime:** update Claude ACP package (#599)
- **runtime:** update managed Codex ACP package (#598)
- stop defaulting aionrs max tokens

---

## [2.1.31](https://github.com/iOfficeAI/AionUi/compare/v2.1.30...v2.1.31) (2026-07-08)

### Desktop

#### Bug Fixes

- **installer:** harden Windows failure reporting and self-lock handling (#3533)
- prepare backend startup directories (#3536)
- **settings:** avoid Arco tooltip crash in skills page (#3535)

#### Features

- **feedback:** attach core diagnostics to reports (#3529)
- **settings:** assistant editor and settings UI polish (#3528)

### Core ([v0.1.44](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.44))

#### Features

- **agent:** use aionrs runtime env API (#586)
- **ai-agent:** surface upstream 429 body in AgentSendError detail (#591)
- **system:** add feedback diagnostics report (#585)

#### Bug Fixes

- **agent:** preserve ACP error cause detail (#581)
- **skills:** correct aionui-config butler skill drift (2026-07) (#584)
- use provider and model protocol to determine llm request

---

## [2.1.30](https://github.com/iOfficeAI/AionUi/compare/v2.1.29...v2.1.30) (2026-07-06)

### Desktop

#### Bug Fixes

- wrong OpenAI SDK param name, throttle cleanup leak, missing alt text (#3512)
- **installer:** harden Windows NSIS update failure handling (#3523)

#### Features

- **guid:** add slash command menu (#3524)
- **assistant:** add thought level defaults to assistant UI (#3522)
- **settings:** add inline link to model config when no image model is available
- **settings:** default to the Agents tab when opening settings

#### Refactoring

- **settings:** describe skill origins per tab instead of per-card badges
- **settings:** split skills/tools entries and unify page header paradigm

#### Styling

- **settings:** match agent availability filter to assistant home tabs

### Core ([v0.1.43](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.43))

#### Features

- **assistant:** persist thought-level defaults (#574)

#### Bug Fixes

- **agent:** project available commands in management rows (#579)
- **assistant:** filter generated assistants by installed agents (#578)
- **cron:** enforce full-auto mode for scheduled tasks (#576)

---

## [2.1.29](https://github.com/iOfficeAI/AionUi/compare/v2.1.28...v2.1.29) (2026-07-03)

### Desktop

#### Bug Fixes

- **assistant:** use management catalog for editor engines (#3511)
- **cron:** improve scheduled task conversation history (#3510)
- show unchecked agents and rotate frontend logs by message date (#3507)
- **assistant:** return to My Assistants after duplicating/creating

#### Features

- **assistant:** promote assistants to a top-level sidebar entry
- **assistant:** unify selection-list ordering, keep CLI agents on top
- **assistant:** rebuild management page into My / Official tabs
- **assistant:** reword official read-only banner and make copy link inline
- **assistant:** custom-empty state, return-to-official on save, field polish

#### Refactoring

- **layout:** move conversation search into the titlebar toolbar

#### Styling

- **assistant:** apply oxfmt formatting to assistant home components

### Core ([v0.1.42](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.42))

#### Bug Fixes

- **agent:** align unchecked availability with team runtime selection (#571)
- **agent:** avoid full availability refresh on reads (#566)
- **cron:** preserve existing conversation jobs across lifecycle changes (#572)
- **mcp:** support aionrs config path subcommand with legacy fallback (#568)
- preserve ACP config catalogs on resume (#570)
- preserve Linux GLIBC baselines (#573)

#### Features

- **assistant:** 官方助手默认关闭 + 固定顺序 + 一次性重置迁移 (#567)

---

## [2.1.28](https://github.com/iOfficeAI/AionUi/compare/v2.1.27...v2.1.28) (2026-07-02)

### Desktop

#### Bug Fixes

- **i18n:** resolve main locale gaps (#3503)
- **startup:** confirm corrupted database rebuild (#3502)
- **team:** pass capabilities to team chat send box (#3501)
- **runtime:** coordinate foreground leases and runtime ensure (#3497)
- **cron:** lock team cron task editing (#3496)
- **desktop:** support dated frontend log layout (#3495)
- **assistant:** render empty avatars consistently (#3493)
- **cron:** support team context job navigation (#3492)
- **acp:** dedupe runtime option requests (#3490)
- **assistant:** correct engine section badge tone to warning
- **cron:** sync manual task assistant selection (#3485)
- **desktop:** wait for macOS update install readiness (#3484)

#### Features

- **i18n:** add Persian (fa-IR) locale support (#3284)
- **i18n:** add complete Spanish (es-ES) translation (#3402)
- **conversation:** keep batch-selection panel pinned while scrolling
- **conversation:** keep project folder header sticky while scrolling
- **conversation:** reveal active conversation by expanding its section and folder
- **conversation:** surface session skills in slash command menu

### Core ([v0.1.41](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.41))

#### Bug Fixes

- **assistant:** normalize avatar storage and identity (#558)
- **conversation:** derive assistant runtime type from metadata (#555)
- **conversation:** partition temp workspaces and logs by date (#560)
- **cron:** apply custom assistant rules in scheduled runs (#495)
- **cron:** lock team cron execution mode (#562)
- **cron:** route skill scheduling through helper (#553)
- **database:** require explicit corrupted database recovery (#563)
- resolve ACP backends from metadata (#559)
- **runtime:** harden managed Node command resolution (#565)
- **runtime:** protect active ACP tasks from idle cleanup (#561)
- **skill:** raise import size limits (#564)
- **skills:** correct AionUi Butler skill drift against current backend (#557)

---

## [2.1.27](https://github.com/iOfficeAI/AionUi/compare/v2.1.26...v2.1.27) (2026-06-30)

### Desktop

#### Bug Fixes

- **team:** reconcile stale run state (#3480)
- **cron:** preserve scheduled task conversations (#3479)
- **cron:** restore scheduled conversations to history (#3478)
- **mcp:** isolate backend cwd for stdio tools (#3476)
- **agent:** show ACP model descriptions (#3463)

### Core ([v0.1.40](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.40))

#### Features

- **team:** add run state snapshot endpoint (#549)

#### Bug Fixes

- **acp:** preserve selectors for partial config snapshots (#548)
- **cron:** restore create command heading (#547)
- **cron:** run jobs through conversation service (#546)
- **skills:** repair butler endpoint drift + add cron scheduling (#550)
- **windows:** handle runtime process lifecycle

---

## [2.1.26](https://github.com/iOfficeAI/AionUi/compare/v2.1.25...v2.1.26) (2026-06-29)

### Desktop

#### Bug Fixes

- **agent:** tighten repair save and test flow (#3470)
- **guid:** remember last selected assistant (#3468)
- **assistant:** prefer runtime config options for defaults (#3466)
- **conversation:** restore team chat full width (#3464)
- **fs:** pass workspace roots to local fs routes (#3451)

#### Styling

- **settings:** clean up assistant card more-button

### Core ([v0.1.39](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.39))

#### Bug Fixes

- **agent:** adapt aionrs compat API (#528)
- **agent:** guard internal Aion CLI command overrides (#538)
- **app:** reuse conversation service for channel messages (#531)
- **assistant:** preserve builtin override selections (#535)
- **file:** trust local workspace roots for fs routes (#527)

---

## [2.1.25](https://github.com/iOfficeAI/AionUi/compare/v2.1.24...v2.1.25) (2026-06-26)

### Desktop

#### Features

- **assistant:** add TalkToButler entry-point infrastructure
- **cron:** add create-via-chat path to scheduled tasks page
- **cron:** use TalkToButlerButton for create + align button styles
- **feedback:** add "solve via chat" to bug report
- **settings:** wire "via chat" into create/add flows
- **web-host:** remove single-chat team upgrade path (#3441)

#### Bug Fixes

- **avatar:** prevent local avatar path rendering (#3439)
- **conversation:** make chat width fluid (#3436)
- **cron:** consume create-via-chat prefill only once per navigation
- **desktop:** classify agent metadata cache repair failures (#3450)
- **guid:** improve dark-mode contrast for inactive agent selector labels (#3430)
- **guid:** load runtime catalog from agent metadata (#3440)
- **guid:** remove static codex runtime catalog (#3443)
- **guid:** resolve assistant skill defaults from config (#3445)
- **guid:** stop showing stale Codex model fallback (#3432)
- **installer:** verify bundled resources (#3444)
- **linux:** align desktop icon name (#3449)
- **settings:** clarify custom agent acp requirement (#3448)

#### Refactoring

- **cron:** hide conversation header entry when no scheduled task exists

### Core ([v0.1.38](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.38))

#### Features

- remove single-chat team upgrade path (#524)

#### Bug Fixes

- **agent:** expose runtime catalogs from metadata (#523)
- **assistant:** expose auto-inject skills and preserve assistant rules (#525)
- repair invalid UTF-8 agent metadata cache fields (#526)
- **skills:** sync AionUi Butler skills + rule with current backend (#520)

---

## [2.1.24](https://github.com/iOfficeAI/AionUi/compare/v2.1.23...v2.1.24) (2026-06-25)

### Desktop

#### Features

- **agent:** connection testing and assistant availability surfacing (phase 2) (#3395)
- **conversation:** add cursor message pagination (#3422)

#### Bug Fixes

- **conversation:** localize structured agent errors (#3426)
- **desktop:** repair legacy database handoff startup (#3423)
- **release:** restore mac zip artifacts (#3415)
- **settings:** prevent capabilities tab flicker (#3414)

### Core ([v0.1.37](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.37))

#### Features

- **agent:** detect availability via session/new probe and assistant-first identity (#500)
- **conversation:** add cursor pagination for messages (#515)

#### Bug Fixes

- **agent:** classify ACP and provider errors (#518)
- **aionrs:** adapt runtime guard config (#510)
- **conversation:** recover dead ACP turns after agent process loss (#514)
- **db:** repair legacy handoff schema drift (#516)
- validate skill frontmatter as yaml (#512)

---

## [2.1.23](https://github.com/iOfficeAI/AionUi/compare/v2.1.22...v2.1.23) (2026-06-23)

### Desktop

#### Features

- **webui:** add browser notifications for permission requests and turn completion (#3401)

#### Bug Fixes

- **preview:** correct OfficeCLI repo slug casing and de-DE install hint (#3399)

### Core ([v0.1.36](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.36))

#### Bug Fixes

- **deps:** update quinn-proto for RustSec advisory (#508)
- load skills in custom workspaces (#506)
- **agent:** support aionrs 0.1.31 (#503)

---

## [2.1.22](https://github.com/iOfficeAI/AionUi/compare/v2.1.21...v2.1.22) (2026-06-22)

### Desktop

#### Features

- **acp:** preserve redacted raw error in AIONUI_INTERNAL_ERROR fallback (#3393)

#### Bug Fixes

- **markdown:** support local file hash line links (#3396)
- **conversation:** localize OpenClaw Gateway startup error (#3392)
- **mcp:** guard message calls against use-after-unmount crash (#3376)
- **preview:** improve file diffs and local file links (#3379)
- **installer:** harden win arm64 install (#3387)

### Core ([v0.1.34](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.34))

#### Bug Fixes

- **agent:** expose aionrs mode config option (#501)
- **agent:** surface OpenClaw Gateway unreachable errors (#498)
- **aionrs:** classify engine errors structurally (#494)
- **aionrs:** drop malformed tool-call events (#486)
- **channel:** reuse stored credentials when re-enabling a plugin (#458)

---

## [2.1.21](https://github.com/iOfficeAI/AionUi/compare/v2.1.20...v2.1.21) (2026-06-18)

### Desktop

#### Features

- **i18n:** add German (de-DE) locale (#3370)

#### Bug Fixes

- **preview:** restore local html and selected file reopen (#3369)
- **preview:** build valid file:// URL for PDF preview on Windows (#3366)
- **i18n:** wire pt-BR into language pickers and main-process loader (#3361)

### Core ([v0.1.32](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.32))

#### Features

- **team:** centralize team MCP prompt governance ([#490](https://github.com/iOfficeAI/AionCore/issues/490))

#### Bug Fixes

- **acp:** recover dead ACP connections ([#487](https://github.com/iOfficeAI/AionCore/issues/487))
- **conversation:** upsert streaming tool calls (AIO-30) ([#484](https://github.com/iOfficeAI/AionCore/issues/484))

#### Documentation

- **skills:** add cross-platform notes so Windows users translate shell examples ([#489](https://github.com/iOfficeAI/AionCore/issues/489))

---

## [2.1.20](https://github.com/iOfficeAI/AionUi/compare/v2.1.19...v2.1.20) (2026-06-17)

### Desktop

#### Features

- **agent:** combine header model thinking selector (#3358)
- **update:** add singleton update notification (#3351)
- **team:** handle queued team runtime metadata (#3349)

#### Bug Fixes

- **team:** wait for solo turn before handoff queue drain (#3353)
- **assistant:** remove leftover gap above assistant list (#3344)

### Core ([v0.1.31](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.31))

#### Features

- **assistant:** add built-in AionUi self-management assistant ([#474](https://github.com/iOfficeAI/AionCore/issues/474))
- **assistant:** expand AionUi assistant into a butler with remote-access ([#481](https://github.com/iOfficeAI/AionCore/issues/481))
- enforce TeamRun ownership for agent turns ([#483](https://github.com/iOfficeAI/AionCore/issues/483))
- **team:** support queued team_send_message semantics ([#479](https://github.com/iOfficeAI/AionCore/issues/479))

#### Bug Fixes

- **acp:** persist runtime model and mode into assistant preferences ([#482](https://github.com/iOfficeAI/AionCore/issues/482))
- harden ACP image path handling ([#477](https://github.com/iOfficeAI/AionCore/issues/477))
- **team:** retry handoff turns after runtime release ([#480](https://github.com/iOfficeAI/AionCore/issues/480))

---

## [2.1.19](https://github.com/iOfficeAI/AionUi/compare/v2.1.18...v2.1.19) (2026-06-15)

### Desktop

#### Features

- **team:** support slot-scoped stop controls (#3334)
- **desktop:** report installation integrity diagnostics (#3333)
- **update:** use CDN metadata for stable auto updates (#3244)
- **acp:** add observed config option selectors (#3324)
- **layout:** make sider wordmark a back-to-chat control in settings (#3320)
- **preview:** actionable server-side install guidance for officecli errors in web mode (#3310)

#### Bug Fixes

- align team workspace display fallback (#3340)
- **team:** prefer assistant avatars in team chats (#3338)
- repair assistant cron and guid metadata flows (#3336)
- **assistant:** remove star office ui remnants (#3329)
- **startup:** hydrate windows path for cli detection (#3308)
- **docker:** install libicu so officecli preview works on Linux server deployments (#3323)
- **agents:** keep disabled custom agents visible in settings (#3319)
- **stt:** keep recording when streaming fails before it establishes (#3317)

### Core ([v0.1.30](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.30))

#### Features

- **acp:** use observed config options for preferences ([#468](https://github.com/iOfficeAI/AionCore/issues/468))
- align team shared workspace resolution ([#475](https://github.com/iOfficeAI/AionCore/issues/475))
- **team:** support slot-scoped team pause and wake flow ([#472](https://github.com/iOfficeAI/AionCore/issues/472))

#### Bug Fixes

- **agent:** send non-empty clientInfo in ACP initialize handshake ([#471](https://github.com/iOfficeAI/AionCore/issues/471))
- **agent:** wait for task shutdown during clear ([#446](https://github.com/iOfficeAI/AionCore/issues/446))
- **assistant:** remove star office helper remnants ([#470](https://github.com/iOfficeAI/AionCore/issues/470))
- **office:** fetch officecli installer from official mirror before GitHub ([#463](https://github.com/iOfficeAI/AionCore/issues/463))
- preserve assistant snapshot and skill wiring for cron ([#473](https://github.com/iOfficeAI/AionCore/issues/473))
- **shell:** reveal file via FileManager1 D-Bus on Linux ([#466](https://github.com/iOfficeAI/AionCore/issues/466))

---

## [2.1.18](https://github.com/iOfficeAI/AionUi/compare/v2.1.17...v2.1.18) (2026-06-12)

### Desktop

#### Features

- **stt:** streaming voice input with live transcript (#3291)
- **assistant:** deliver phase-1 governance settings (#3277)
- stabilize team mode conversation runtime (#3309)

#### Bug Fixes

- **updater:** wait for backend shutdown before install (#3270)
- **windows-installer:** recover from long-path uninstall failures (#3296)
- **macos:** add audio-input entitlement so microphone works (#3294)
- **preview:** drop bare trailing slash from office watch proxy url (#3287)
- **workspace:** float directory picker above team/cron create modals
- **workspace:** enable clickable folder picker in webui

#### Styling

- **titlebar:** nudge feedback icon up to align with neighbors
- **markdown:** tighten desktop paragraph spacing
- **markdown:** tighten desktop chat body line-height
- **conversation:** show AI copy/timestamp row only at turn end
- **display:** tighten factory default font sizes and zoom

### Core ([v0.1.29](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.29))

#### Features

- converge team mode runtime architecture ([#464](https://github.com/iOfficeAI/AionCore/issues/464))
- **stt:** streaming transcription proxy over websocket ([#455](https://github.com/iOfficeAI/AionCore/issues/455))

#### Bug Fixes

- **agent:** validate managed ACP platform binaries ([#462](https://github.com/iOfficeAI/AionCore/issues/462))
- **cron:** retry busy jobs from runtime state ([#459](https://github.com/iOfficeAI/AionCore/issues/459))
- isolate ACP cancel turn completion ([#461](https://github.com/iOfficeAI/AionCore/issues/461))
- **office:** probe star-office preferred_url host as given ([#456](https://github.com/iOfficeAI/AionCore/issues/456))

#### Refactoring

- **assistant:** finalize unified governance storage ([#449](https://github.com/iOfficeAI/AionCore/issues/449))

---

## [2.1.17](https://github.com/iOfficeAI/AionUi/compare/v2.1.16...v2.1.17) (2026-06-11)

### Desktop

#### Features

- **settings:** voice input settings revamp and home page mic button (#3283)
- **titlebar:** add global feedback/report entry to toolbar
- **theme:** add Follow System theme mode to gallery (#3282)
- **settings:** support multi-select models when adding a model platform

#### Bug Fixes

- **webui:** normalize Windows verbatim paths from directory picker (#3286)
- **model-selector:** keep sticky platform title above scrolling items
- **settings:** allow editing Base URL when editing a model platform
- **stt:** send multipart request matching backend /api/stt contract (#3274)

#### Styling

- **model-selector:** sticky platform group titles in scrollable dropdown

### Core ([v0.1.28](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.28))

#### Bug Fixes

- **auth:** allow same-origin framing on office preview proxy routes ([#454](https://github.com/iOfficeAI/AionCore/issues/454))
- **file:** strip Windows verbatim prefix from /api/fs/browse paths ([#453](https://github.com/iOfficeAI/AionCore/issues/453))
- **stt:** STT compatibility fixes for Groq Whisper and AionUI web frontend ([#400](https://github.com/iOfficeAI/AionCore/issues/400))
- **stt:** treat blank base_url as unset and log malformed config ([#448](https://github.com/iOfficeAI/AionCore/issues/448))

---

## [2.1.16](https://github.com/iOfficeAI/AionUi/compare/v2.1.15...v2.1.16) (2026-06-10)

### Desktop

#### Bug Fixes

- **preview:** point OfficeCLI install help to official releases (#3264)
- **http:** read error response body once to avoid double consumption (#3262)
- **ci:** handle empty release prefix check (#3263)

### Core ([v0.1.27](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.27))

#### Bug Fixes

- **ai-agent:** auto approve team mcp permissions ([#447](https://github.com/iOfficeAI/AionCore/issues/447))
- **ai-agent:** trim stderr buffer at UTF-8 char boundary ([#443](https://github.com/iOfficeAI/AionCore/issues/443))
- **office:** resolve officecli shim from node_modules/.bin after npm prefix install ([#440](https://github.com/iOfficeAI/AionCore/issues/440))
- **office:** restore OfficeCLI installer resolution ([#444](https://github.com/iOfficeAI/AionCore/issues/444))

---

## [2.1.15](https://github.com/iOfficeAI/AionUi/compare/v2.1.14...v2.1.15) (2026-06-09)

### Desktop

#### Features

- enforce agent runtime policy and turn-aware UI state (#3253)
- render localized ACP empty-turn info tips (#3251)
- **conversation:** hide all conversation export UI entries
- make log directory configurable (#3233)

#### Bug Fixes

- **conversation:** align header model label with selector (#3257)
- **sendbox:** stop button glow clipped by mobile panel corner
- **login:** move mobile language selector to its own row to avoid logo overlap
- **desktop:** pass parent pid to bundled backend (#3250)

### Core ([v0.1.26](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.26))

#### Features

- enforce agent runtime policy and turn-aware state ([#436](https://github.com/iOfficeAI/AionCore/issues/436))

#### Bug Fixes

- **app:** use process synchronize access for parent watcher ([#438](https://github.com/iOfficeAI/AionCore/issues/438))
- **acp:** preserve confirmed model selection ([#437](https://github.com/iOfficeAI/AionCore/issues/437))
- **app:** stop backend when desktop exits ([#433](https://github.com/iOfficeAI/AionCore/issues/433))

---

## [2.1.14](https://github.com/iOfficeAI/AionUi/compare/v2.1.13...v2.1.14) (2026-06-08)

### Desktop

#### Bug Fixes

- **bootstrap:** block wrong macOS package architecture at startup (#3232)

### Core ([v0.1.24](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.24))

#### Bug Fixes

- **acp:** prefer config options catalogs ([#425](https://github.com/iOfficeAI/AionCore/issues/425))
- expose managed resource preparation failure details ([#430](https://github.com/iOfficeAI/AionCore/issues/430))
- handle Hermes yolo fallback correctly ([#428](https://github.com/iOfficeAI/AionCore/issues/428))
- harden managed ACP bundle preparation and builtin CLI availability ([#426](https://github.com/iOfficeAI/AionCore/issues/426))
- scope bundled ACP output under tool directories ([#431](https://github.com/iOfficeAI/AionCore/issues/431))
- **shell:** support UNC paths in Windows terminal ([#411](https://github.com/iOfficeAI/AionCore/issues/411))
- validate managed ACP packages via real entrypoints ([#429](https://github.com/iOfficeAI/AionCore/issues/429))

#### Refactoring

- **app:** organize CLI command boundaries ([#423](https://github.com/iOfficeAI/AionCore/issues/423))

---

## [2.1.13](https://github.com/iOfficeAI/AionUi/compare/v2.1.12...v2.1.13) (2026-06-07)

### Desktop

#### Features

- **appearance:** configurable font sizes & display→appearance rename (#3223)
- **theme:** unify theme system into a single Theme concept (#3219)

#### Bug Fixes

- **messages:** keep message list scrollbar flush to window edge (#3226)
- **preview:** default zoom to 100% and hide snapshot/history entry (#3222)
- **bootstrap:** preserve backend startup error codes (#3218)
- **runtime:** validate packaged node runtime layout (#3221)
- **runtime:** align installation integrity dialogs (#3220)
- **realtime:** canonicalize boundary errors (#3217)

#### Refactoring

- stabilize conversation runtime view contract (#3224)

### Core ([v0.1.23](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.23))

#### Features

- **cli:** canonicalize CLI and bootstrap boundary errors ([#417](https://github.com/iOfficeAI/AionCore/issues/417))

#### Bug Fixes

- **error:** canonicalize boundary errors ([#415](https://github.com/iOfficeAI/AionCore/issues/415))
- **runtime:** report bundled resource installation failures ([#420](https://github.com/iOfficeAI/AionCore/issues/420))
- **team:** inherit workspace for spawned agents ([#413](https://github.com/iOfficeAI/AionCore/issues/413))

#### Refactoring

- centralize agent runtime session context building ([#419](https://github.com/iOfficeAI/AionCore/issues/419))
- centralize runtime turn lifecycle ([#421](https://github.com/iOfficeAI/AionCore/issues/421))

---

## [2.1.12](https://github.com/iOfficeAI/AionUi/compare/v2.1.11...v2.1.12) (2026-06-05)

### Desktop

#### Features

- **i18n:** add Brazilian Portuguese (pt-BR) translation (#3209)
- **preview:** native Streamdown markdown rendering + full theming (#3204)

#### Bug Fixes

- **conversation:** align workspace path availability handling (#3207)
- **preview:** dedupe @codemirror/language so markdown source highlight survives (#3206)

### Core ([v0.1.22](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.22))

#### Bug Fixes

- **acp:** stabilize mode and model source of truth ([#409](https://github.com/iOfficeAI/AionCore/issues/409))
- **conversation:** align workspace path availability handling ([#410](https://github.com/iOfficeAI/AionCore/issues/410))
- **file:** lazy load browse roots ([#406](https://github.com/iOfficeAI/AionCore/issues/406))
- prepare managed acp tools locally without cdn ([#408](https://github.com/iOfficeAI/AionCore/issues/408))

#### Refactoring

- **error:** finish ApiError phase3 ([#398](https://github.com/iOfficeAI/AionCore/issues/398))

---

## [2.1.11](https://github.com/iOfficeAI/AionUi/compare/v2.1.10...v2.1.11) (2026-06-04)

### Desktop

#### Features

- **preview:** unify code viewing & editing on CodeMirror 6 (#3194)
- **preview:** unify code view font and fix view-mode/line-height regressions (#3185)
- **workspace:** VSCode-style file tree icons + smoother preview browsing (#3181)
- add managed acp artifact mirror workflow (#3182)

#### Bug Fixes

- **web-host:** use aioncore reported backend port (#3193)
- **settings:** apply UI scale only on slider release (#3190)

### Core ([v0.1.20](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.20))

#### Bug Fixes

- **app:** bind backend before startup services ([#397](https://github.com/iOfficeAI/AionCore/issues/397))
- stabilize agent runtime terminal lifecycle ([#396](https://github.com/iOfficeAI/AionCore/pull/396))

#### Refactoring

- **error:** ACP error classification ([#393](https://github.com/iOfficeAI/AionCore/issues/393))
- **error:** migrate phase2 service errors ([#395](https://github.com/iOfficeAI/AionCore/issues/395))

---

## [2.1.10](https://github.com/iOfficeAI/AionUi/compare/v2.1.9...v2.1.10) (2026-06-02)

### Desktop

#### Bug Fixes

- **runtime:** show runtime-specific MCP missing command hints (#3167)
- **startup:** add health polling diagnostics (#3168)
- **acp:** show model switch feedback
- **acp:** avoid duplicate runtime sync requests
- **acp:** wait for warmup before runtime sync
- **sentry:** split incomplete install diagnostics (#3164)
- normalize workspace path error handling (#3158)
- **acp:** fix model state sync after session recovery (#3162)
- **desktop:** persist close-to-tray setting (#3150)

### Core ([v0.1.19](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.19))

#### Bug Fixes

- **aionui-ai-agent:** classify aionrs API connection errors ([#389](https://github.com/iOfficeAI/AionCore/issues/389))
- classify missing MCP launcher runtimes ([#387](https://github.com/iOfficeAI/AionCore/issues/387))
- enforce workspace path whitespace errors across create and runtime ([#381](https://github.com/iOfficeAI/AionCore/issues/381))
- **startup:** add startup phase diagnostics ([#388](https://github.com/iOfficeAI/AionCore/issues/388))

---

## [2.1.9](https://github.com/iOfficeAI/AionUi/compare/v2.1.8...v2.1.9) (2026-06-01)

### Desktop

#### Bug Fixes

- **web-host:** skip fetch-blocked backend ports (#3146)
- **i18n:** clarify incomplete installation recovery (#3145)
- **conversation:** map 409 already-processing to CONVERSATION_BUSY (#3142)
- **i18n:** localize MCP check strings (#3141)

#### Features

- Allow importing skill folders and zip archives (#3144)

### Core ([v0.1.18](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.18))

#### Bug Fixes

- **agent:** classify Bedrock 'model identifier is invalid' as model-not-found (AIO-12) ([#377](https://github.com/iOfficeAI/AionCore/issues/377))
- **agent:** preserve process-group cleanup after leader exit ([#369](https://github.com/iOfficeAI/AionCore/issues/369))
- **agent:** tighten send_error classifier (AIO-87, AIO-89, AIO-90) ([#375](https://github.com/iOfficeAI/AionCore/issues/375))
- **aionui-ai-agent:** strip HTML body from sanitized error detail (AIO-13) ([#380](https://github.com/iOfficeAI/AionCore/issues/380))
- recover deleted conversation workspaces ([#379](https://github.com/iOfficeAI/AionCore/issues/379))

---

## [2.1.8](https://github.com/iOfficeAI/AionUi/compare/v2.1.7...v2.1.8) (2026-05-30)

### Desktop

#### Bug Fixes

- **desktop:** improve incomplete backend install diagnostics (#3121)
- **web-host:** enrich backend health timeout diagnostics (#3120)
- **feedback:** preserve structured live error tips (#3116)

### Core ([v0.1.17](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.17))

#### Bug Fixes

- **agent:** make codex sandbox sync non-fatal ([#370](https://github.com/iOfficeAI/AionCore/issues/370))

---

## [2.1.7](https://github.com/iOfficeAI/AionUi/compare/v2.1.6...v2.1.7) (2026-05-29)

### Desktop

#### Features

- **mcp:** move MCP management to conversation scope (#3109)

#### Bug Fixes

- **feedback:** tag agent error reports (#3113)
- **conversation:** render structured agent errors (#3093)
- **web-host:** reuse backend port after crash restart (#3111)
- **webui:** auto-open local url on startup (#3110)
- **startup:** ignore cancelled backend startup (#3108)
- **mcp:** validate json imports (#3106)
- **team:** avoid sidebar confirmation fan-out (#3105)
- **web-host:** add health timeout diagnostics (#3102)
- **settings:** avoid blue switch during image generation loading (#3091)

### Core ([v0.1.16](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.16))

#### Features

- **agent:** classify structured agent send errors ([#356](https://github.com/iOfficeAI/AionCore/issues/356))
- **mcp:** support session scoped MCP injection ([#363](https://github.com/iOfficeAI/AionCore/issues/363))

#### Bug Fixes

- channel reply stream cold start ([#366](https://github.com/iOfficeAI/AionCore/issues/366))
- **mcp:** clean up stdio test process trees ([#368](https://github.com/iOfficeAI/AionCore/issues/368))

---

## [2.1.6](https://github.com/iOfficeAI/AionUi/compare/v2.1.5...v2.1.6) (2026-05-28)

### Desktop

#### Bug Fixes

- **model-selector:** trust backend current model and persist preferences (#3084)
- **build:** align bundled aioncore target arch (#3092)
- **settings:** use provider health check probe (#3090)
- **settings:** use health check error message (#3080)
- **backend:** handle incomplete bundled aioncore installs (#3078)

#### Performance

- lazy-load full tool message content (#3086)
- improve message startup latency (#3082)

### Core ([v0.1.15](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.15))

#### Bug Fixes

- **agent:** add provider health check probe ([#358](https://github.com/iOfficeAI/AionCore/issues/358))

---

## [2.1.5](https://github.com/iOfficeAI/AionUi/compare/v2.1.4...v2.1.5) (2026-05-27)

### Desktop

#### Features

- **settings:** use backend MCP settings source (#3069)
- **settings:** rename capabilities tab + collapse speech/image-gen when disabled
- **settings:** clarify builtin assistant readonly state in editor
- **update:** add install warning on downloaded state in UpdateModal
- **tools:** allowlist image-gen models and document supported set

#### Bug Fixes

- **acp:** surface raw send errors (#3067)
- **guid:** use startsWith('custom:') to detect preset agent on New Chat reset
- **guid:** preserve CLI agent selection on New Chat, only reset preset agents
- **guid:** restore last selected agent on initial render without flash
- **guid:** include user skills in action-row Skills count
- **update:** polish downloaded state — remove desc text, drop icon from warning
- **startup:** show incompatible backend runtime (#3062)
- **image-gen:** strip response_format from gpt-image requests + remove double-save
- **tools:** use Form.Item tooltip prop for image model help icon
- **tools:** align help icon vertically with image model label
- **sendbox:** map workspace file paths for mentions (#3060)
- **settings:** route provider health check via aionrs (#3058)
- **settings:** localize sentence terminator on builtin readonly banner
- **electron:** tolerate pending backend startup (#3057)
- recover pending permission prompts (#3059)
- preserve timezone for scheduled tasks (#3056)

### Core ([v0.1.14](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.14))

#### Bug Fixes

- preserve cron timezone on legacy schedule updates ([#344](https://github.com/iOfficeAI/AionCore/issues/344))
- **startup:** add backend readiness diagnostics ([#346](https://github.com/iOfficeAI/AionCore/issues/346))

#### Refactoring

- four-layer architecture (connect / conv / biz) ([#349](https://github.com/iOfficeAI/AionCore/issues/349))

---

## [2.1.4](https://github.com/iOfficeAI/AionUi/compare/v2.1.3...v2.1.4) (2026-05-27)

### Desktop

#### Bug Fixes

- **messages:** ignore non-renderable stream events (#3053)
- **messages:** stabilize stream scrolling and initial loading (#3042)

---
