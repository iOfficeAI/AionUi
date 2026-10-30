---
name: "playwright-interactive"
description: "Persistent browser and Electron interaction through `js_repl` for fast iterative UI debugging."
---

# Playwright Interactive Skill

Use a persistent `js_repl` Playwright session to debug local web or Electron apps, keep the same handles alive across iterations, and run functional plus visual QA without restarting the whole toolchain unless the process ownership changed.

## Preconditions

- `js_repl` must be enabled for this skill.
- If `js_repl` is missing, enable it in `~/.codex/config.toml`:

```toml
[features]
js_repl = true
```

- You can also start a new session with `--enable js_repl` (equivalent to `-c features.js_repl=true`).
- After enabling `js_repl`, start a new Codex session so the tool list refreshes.
- For now, run this workflow with sandboxing disabled: start Codex with `--sandbox danger-full-access` (or the equivalent config for `sandbox_mode=danger-full-access`). This is a temporary requirement while `js_repl` + Playwright support inside the sandbox is still being completed.
- Run setup from the same project directory you need to debug.
- Treat `js_repl_reset` as a recovery tool, not routine cleanup. Resetting the kernel destroys your Playwright handles.

## One-time setup

```bash
test -f package.json || npm init -y
npm install playwright
# Web-only, for headed Chromium or mobile emulation:
# npx playwright install chromium
# Electron-only, and only if the target workspace is the app itself:
# npm install --save-dev electron
node -e "import('playwright').then(() => console.log('playwright import ok')).catch((error) => { console.error(error); process.exit(1); })"
```

If you switch to a different workspace later, repeat setup there.

## Core Workflow

1. Write a brief QA inventory before testing:
   - Build the inventory from three sources: the user's requested requirements, the user-visible features or behaviors you actually implemented, and the claims you expect to make in the final response.
   - Anything that appears in any of those three sources must map to at least one QA check before signoff.
   - List the user-visible claims you intend to sign off on.
   - List every meaningful user-facing control, mode switch, or implemented interactive behavior.
   - List the state changes or view changes each control or implemented behavior can cause.
   - Use this as the shared coverage list for both functional QA and visual QA.
   - For each claim or control-state pair, note the intended functional check, the specific state where the visual check must happen, and the evidence you expect to capture.
   - If a requirement is visually central but subjective, convert it into an observable QA check instead of leaving it implicit.
   - Add at least 2 exploratory or off-happy-path scenarios that could expose fragile behavior.
2. Run the bootstrap cell once.
3. Start or confirm any required dev server in a persistent TTY session.
4. Launch the correct runtime and keep reusing the same Playwright handles.
5. After each code change, reload for renderer-only changes or relaunch for main-process/startup changes.
6. Run functional QA with normal user input.
7. Run a separate visual QA pass.
8. Verify viewport fit and capture the screenshots needed to support your claims.
9. Clean up the Playwright session only when the task is actually finished.

## Bootstrap (Run Once)

```javascript
var chromium;
var electronLauncher;
var browser;
var context;
var page;
var mobileContext;
var mobilePage;
var electronApp;
var appWindow;

try {
  ({ chromium, _electron: electronLauncher } = await import("playwright"));
  console.log("Playwright loaded");
} catch (error) {
  throw new Error(
    `Could not load playwright from the current js_repl cwd. Run the setup commands from this workspace first. Original error: ${error}`
  );
}
```

Binding rules:

- Use `var` for the shared top-level Playwright handles because later `js_repl` cells reuse them.
- The setup cells below are intentionally short happy paths. If a handle looks stale, set that binding to `undefined` and rerun the cell instead of adding recovery logic everywhere.
- Prefer one named handle per surface you care about (`page`, `mobilePage`, `appWindow`) over repeatedly rediscovering pages from the context.

Shared web helpers:

```javascript
var resetWebHandles = function () {
  context = undefined;
  page = undefined;
  mobileContext = undefined;
  mobilePage = undefined;
};

var ensureWebBrowser = async function () {
  if (browser && !browser.isConnected()) {
    browser = undefined;
    resetWebHandles();
  }

  browser ??= await chromium.launch({ headless: false });
  return browser;
};

var reloadWebContexts = async function () {
  for (const currentContext of [context, mobileContext]) {
    if (!currentContext) continue;
    for (const p of currentContext.pages()) {
      await p.reload({ waitUntil: "domcontentloaded" });
    }
  }
  console.log("Reloaded existing web tabs");
};
```

## Choose Session Mode

For web apps, use an explicit viewport by default and treat native-window mode as a separate validation pass.

- Use an explicit viewport for routine iteration, breakpoint checks, reproducible screenshots, snapshot diffs, and model-assisted localization. This is the default because it is stable across machines and avoids host window-manager variability.
- When you need deterministic high-DPI behavior, keep the explicit viewport and add `deviceScaleFactor` rather than switching straight to native-window mode.
- Use native-window mode (`viewport: null`) for a separate headed pass when you need to validate launched window size, OS-level DPI behavior, browser chrome interactions, or bugs that may depend on the host display configuration.
- For Electron, assume native-window behavior all the time. Electron launches through Playwright with `noDefaultViewport`, so treat it like a real desktop window and check the as-launched size and layout before resizing anything.
- When signoff depends on both layout breakpoints and real desktop behavior, do both passes: explicit viewport first for deterministic QA, then native-window validation for final environment-specific checks.
- Treat switching modes as a context reset. Do not reuse a viewport-emulated `context` for a native-window pass or vice versa; close the old `page` and `context`, then create a new one for the new mode.

## Start or Reuse Web Session

Desktop and mobile web sessions share the same `browser`, helpers, and QA flow. The main difference is which context and page pair you create.

### Desktop Web Context

Set `TARGET_URL` to the app you are debugging. For local servers, prefer `127.0.0.1` over `localhost`.

```javascript
var TARGET_URL = "http://127.0.0.1:3000";

if (page?.isClosed()) page = undefined;

await ensureWebBrowser();
context ??= await browser.newContext({
  viewport: { width: 1600, height: 900 },
});
page ??= await context.newPage();

await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded:", await page.title());
```

If `context` or `page` is stale, set `context = page = undefined` and rerun the cell.

### Mobile Web Context

Reuse `TARGET_URL` when it already exists; otherwise set a mobile target directly.

```javascript
var MOBILE_TARGET_URL = typeof TARGET_URL === "string"
  ? TARGET_URL
  : "http://127.0.0.1:3000";

if (mobilePage?.isClosed()) mobilePage = undefined;

await ensureWebBrowser();
mobileContext ??= await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
mobilePage ??= await mobileContext.newPage();

await mobilePage.goto(MOBILE_TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded mobile:", await mobilePage.title());
```

If `mobileContext` or `mobilePage` is stale, set `mobileContext = mobilePage = undefined` and rerun the cell.

### Native-Window Web Pass

```javascript
var TARGET_URL = "http://127.0.0.1:3000";

await ensureWebBrowser();

await page?.close().catch(() => {});
await context?.close().catch(() => {});
page = undefined;
context = undefined;

browser ??= await chromium.launch({ headless: false });
context = await browser.newContext({ viewport: null });
page = await context.newPage();

await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded native window:", await page.title());
```

## Start or Reuse Electron Session

Set `ELECTRON_ENTRY` to `.` when the current workspace is the Electron app and `package.json` points `main` to the right entry file. If you need to target a specific main-process file directly, use a path such as `./main.js` instead.

```javascript
var ELECTRON_ENTRY = ".";

if (appWindow?.isClosed()) appWindow = undefined;

if (!appWindow && electronApp) {
  await electronApp.close().catch(() => {});
  electronApp = undefined;
}

electronApp ??= await electronLauncher.launch({
  args: [ELECTRON_ENTRY],
});

appWindow ??= await electronApp.firstWindow();

console.log("Loaded Electron window:", await appWindow.title());
```

If `js_repl` is not already running from the Electron app workspace, pass `cwd` explicitly when launching.

If the app process looks stale, set `electronApp = appWindow = undefined` and rerun the cell.

If you already have an Electron session but need a fresh process after a main-process, preload, or startup change, use the restart cell in the next section instead of rerunning this one.

## Reuse Sessions During Iteration

Keep the same session alive whenever you can.

Web renderer reload:

```javascript
await reloadWebContexts();
```

Electron renderer-only reload:

```javascript
await appWindow.reload({ waitUntil: "domcontentloaded" });
console.log("Reloaded Electron window");
```

Electron restart after main-process, preload, or startup changes:

```javascript
await electronApp.close().catch(() => {});
electronApp = undefined;
appWindow = undefined;

electronApp = await electronLauncher.launch({
  args: [ELECTRON_ENTRY],
});

appWindow = await electronApp.firstWindow();
console.log("Relaunched Electron window:", await appWindow.title());
```

If your launch requires an explicit `cwd`, include the same `cwd` here.

Default posture:

- Keep each `js_repl` cell short and focused on one interaction burst.
- Reuse the existing top-level bindings (`browser`, `context`, `page`, `electronApp`, `appWindow`) instead of redeclaring them.
- If you need isolation, create a new page or a new context inside the same browser.
- For Electron, use `electronApp.evaluate(...)` only for main-process inspection or purpose-built diagnostics.
- Fix helper mistakes in place; do not reset the REPL unless the kernel is actually broken.

## Checklists

### Session Loop

- Bootstrap `js_repl` once, then keep the same Playwright handles alive across iterations.
- Launch the target runtime from the current workspace.
- Make the code change.
- Reload or relaunch using the correct path for that change.
- Update the shared QA inventory if exploration reveals an additional control, state, or visible claim.
- Re-run functional QA.
- Re-run visual QA.
- Capture final artifacts only after the current state is the one you are evaluating.

### Reload Decision

- Renderer-only change: reload the existing page or Electron window.
- Main-process, preload, or startup change: relaunch Electron.
- New uncertainty about process ownership or startup code: relaunch instead of guessing.

### Functional QA

- Use real user controls for signoff: keyboard, mouse, click, touch, or equivalent Playwright input APIs.
- Verify at least one end-to-end critical flow.
- Confirm the visible result of that flow, not just internal state.
- For realtime or animation-heavy apps, verify behavior under actual interaction timing.
- Work through the shared QA inventory rather than ad hoc spot checks.
- Cover every obvious visible control at least once before signoff, not only the main happy path.
- For reversible controls or stateful toggles in the inventory, test the full cycle: initial state, changed state, and return to the initial state.
- After the scripted checks pass, do a short exploratory pass using normal input for 30-90 seconds instead of following only the intended path.
- If the exploratory pass reveals a new state, control, or claim, add it to the shared QA inventory and cover it before signoff.
- `page.evaluate(...)` and `electronApp.evaluate(...)` may inspect or stage state, but they do not count as signoff input.

### Visual QA

- Treat visual QA as separate from functional QA.
- Use the same shared QA inventory defined before testing and updated during QA; do not start visual coverage from a different implicit list.
- Restate the user-visible claims and verify each one explicitly; do not assume a functional pass proves a visual claim.
- A user-visible claim is not signed off until it has been inspected in the specific state where it is meant to be perceived.
- Inspect the initial viewport before scrolling.
- Confirm that the initial view visibly supports the interface's primary claims; if a core promised element is not clearly perceptible there, treat that as a bug.
- Inspect all required visible regions, not just the main interaction surface.
- Inspect the states and modes already enumerated in the shared QA inventory, including at least one meaningful post-interaction state when the task is interactive.
- If motion or transitions are part of the experience, inspect at least one in-transition state in addition to the settled endpoints.
- If labels, overlays, annotations, guides, or highlights are meant to track changing content, verify that relationship after the relevant state change.
- For dynamic or interaction-dependent visuals, inspect long enough to judge stability, layering, and readability; do not rely on a single screenshot for signoff.
- For interfaces that can become denser after loading or interaction, inspect the densest realistic state you can reach during QA, not only the empty, loading, or collapsed state.
- If the product has a defined minimum supported viewport or window size, run a separate visual QA pass there; otherwise, choose a smaller but still realistic size and inspect it explicitly.
- Distinguish presence from implementation: if an intended affordance is technically there but not clearly perceptible because of weak contrast, occlusion, clipping, or instability, treat that as a visual failure.
- If any required visible region is clipped, cut off, obscured, or pushed outside the viewport in the state you are evaluating, treat that as a bug even if page-level scroll metrics appear acceptable.
- Look for clipping, overflow, distortion, layout imbalance, inconsistent spacing, alignment problems, illegible text, weak contrast, broken layering, and awkward motion states.
- Judge aesthetic quality as well as correctness. The UI should feel intentional, coherent, and visually pleasing for the task.
- Prefer viewport screenshots for signoff. Use full-page captures only as secondary debugging artifacts, and capture a focused screenshot when a region needs closer inspection.
- If motion makes a screenshot ambiguous, wait briefly for the UI to settle, then capture the image you are actually evaluating.
- Before signoff, explicitly ask: what visible part of this interface have I not yet inspected closely?
- Before signoff, explicitly ask: what visible defect would most likely embarrass this result if the user looked closely?

### Signoff

- The functional path passed with normal user input.
- Coverage is explicit against the shared QA inventory: note which requirements, implemented features, controls, states, and claims were exercised, and call out any intentional exclusions.
- The visual QA pass covered the whole relevant interface.
- Each user-visible claim has a matching visual check and reviewed screenshot artifact from the state and viewport or window size where that claim matters.
- The viewport-fit checks passed for the intended initial view and any required minimum supported viewport or window size.
- If the product launches in a window, the as-launched size, placement, and initial layout were checked before any manual resize or repositioning.
- The UI is not just functional; it is visually coherent and not aesthetically weak for the task.
- Functional correctness, viewport fit, and visual quality must each pass on their own; one does not imply the others.
- A short exploratory pass was completed for interactive products, and the response mentions what that pass covered.
- If screenshot review and numeric checks disagreed at any point, the discrepancy was investigated before signoff; visible clipping in screenshots is a failure to resolve, not something metrics can overrule.
- Include a brief negative confirmation of the main defect classes you checked for and did not find.
- Cleanup was executed, or you intentionally kept the session alive for further work.

## Screenshot Examples

If you plan to emit a screenshot through `codex.emitImage(...)`, use the CSS-normalized paths in the next section by default. Those are the canonical examples for screenshots that will be interpreted by the model or used for coordinate-based follow-up actions. Keep raw captures as an exception for fidelity-sensitive debugging only; the raw exception examples appear after the normalization guidance.

### Model-bound screenshots (default)

If you will emit a screenshot with `codex.emitImage(...)` for model interpretation, normalize it to CSS pixels for the exact region you captured before emitting. This keeps returned coordinates aligned with Playwright CSS pixels if the reply is later used for clicking, and it also reduces image payload size and model token cost.

Do not emit raw native-window screenshots by default. Skip normalization only when you explicitly need device-pixel fidelity, such as Retina or DPI artifact debugging, pixel-accurate rendering inspection, or another fidelity-sensitive case where raw pixels matter more than payload size. For local-only inspection that will not be emitted to the model, raw capture is fine.

Do not assume `page.screenshot({ scale: "css" })` is enough in native-window mode (`viewport: null`). In Chromium on macOS Retina displays, headed native-window screenshots can still come back at device-pixel size even when `scale: "css"` is requested. The same caveat applies to Electron windows launched through Playwright because Electron runs with `noDefaultViewport`, and `appWindow.screenshot({ scale: "css" })` may still return device-pixel output.

Use separate normalization paths for web pages and Electron windows:

- Web: prefer `page.screenshot({ scale: "css" })` directly. If native-window Chromium still returns device-pixel output, resize inside the current page with canvas; no scratch page is required.
- Electron: do not use `appWindow.context().newPage()` or `electronApp.context().newPage()` as a scratch page. Electron contexts do not support that path reliably. Capture in the main process with `BrowserWindow.capturePage(...)`, resize with `nativeImage.resize(...)`, and emit those bytes directly.

Shared helpers and conventions:

```javascript
var emitJpeg = async function (bytes) {
  await codex.emitImage({
    bytes,
    mimeType: "image/jpeg",
    detail: "original",
  });
};

var emitWebJpeg = async function (surface, options = {}) {
  await emitJpeg(await surface.screenshot({
    type: "jpeg",
    quality: 85,
    scale: "css",
    ...options,
  }));
};

var clickCssPoint = async function ({ surface, x, y, clip }) {
  await surface.mouse.click(
    clip ? clip.x + x : x,
    clip ? clip.y + y : y
  );
};

var tapCssPoint = async function ({ page, x, y, clip }) {
  await page.touchscreen.tap(
    clip ? clip.x + x : x,
    clip ? clip.y + y : y
  );
};
```

- Use `page` or `mobilePage` for web, or `appWindow` for Electron, as the `surface`.
- Treat `clip` as CSS pixels from `getBoundingClientRect()` in the renderer.
- Prefer JPEG at `quality: 85` unless lossless fidelity is specifically required.
- For full-image captures, use returned `{ x, y }` directly.
- For clipped captures, add the clip origin back when clicking.

### Web CSS normalization

Preferred web path for explicit-viewport contexts, and often for web in general:

```javascript
await emitWebJpeg(page);
```

Mobile web uses the same path; substitute `mobilePage` for `page`:

```javascript
await emitWebJpeg(mobilePage);
```

If the model returns `{ x, y }`, click it directly:

```javascript
await clickCssPoint({ surface: page, x, y });
```

Mobile web click path:

```javascript
await tapCssPoint({ page: mobilePage, x, y });
```

For web `clip` screenshots or element screenshots in this normal path, `scale: "css"` usually works directly. Add the region origin back when clicking.

- `await emitWebJpeg(page, { clip })`
- `await emitWebJpeg(mobilePage, { clip })`
- `await clickCssPoint({ surface: page, clip, x, y })`
- `await tapCssPoint({ page: mobilePage, clip, x, y })`
- `await clickCssPoint({ surface: page, clip: box, x, y })` after `const box = await locator.boundingBox()`

Web native-window fallback when `scale: "css"` still comes back at device-pixel size:

```javascript
var emitWebScreenshotCssScaled = async function ({ page, clip, quality = 0.85 } = {}) {
  var NodeBuffer = (await import("node:buffer")).Buffer;
  const target = clip
    ? { width: clip.width, height: clip.height }
    : await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));

  const screenshotBuffer = await page.screenshot({
    type: "png",
    ...(clip ? { clip } : {}),
  });

  const bytes = await page.evaluate(
    async ({ imageBase64, targetWidth, targetHeight, quality }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${imageBase64}`;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );

      return new Uint8Array(await blob.arrayBuffer());
    },
    {
      imageBase64: NodeBuffer.from(screenshotBuffer).toString("base64"),
      targetWidth: target.width,
      targetHeight: target.height,
      quality,
    }
  );

  await emitJpeg(bytes);
};
```

For a full viewport fallback capture, treat returned `{ x, y }` as direct CSS coordinates:

```javascript
await emitWebScreenshotCssScaled({ page });
await clickCssPoint({ surface: page, x, y });
```

For a clipped fallback capture, add the clip origin back:

```javascript
await emitWebScreenshotCssScaled({ page, clip });
await clickCssPoint({ surface: page, clip, x, y });
```

### Electron CSS normalization

For Electron, normalize in the main process instead of opening a scratch Playwright page. The helper below returns CSS-scaled bytes for the full content area or for a clipped CSS-pixel region. Treat `clip` as content-area CSS pixels, for example values taken from `getBoundingClientRect()` in the renderer.

```javascript
var emitElectronScreenshotCssScaled = async function ({ electronApp, clip, quality = 85 } = {}) {
  const bytes = await electronApp.evaluate(async ({ BrowserWindow }, { clip, quality }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const image = clip ? await win.capturePage(clip) : await win.capturePage();

    const target = clip
      ? { width: clip.width, height: clip.height }
      : (() => {
          const [width, height] = win.getContentSize();
          return { width, height };
        })();

    const resized = image.resize({
      width: target.width,
      height: target.height,
      quality: "best",
    });

    return resized.toJPEG(quality);
  }, { clip, quality });

  await emitJpeg(bytes);
};
```

Full Electron window:

```javascript
await emitElectronScreenshotCssScaled({ electronApp });
await clickCssPoint({ surface: appWindow, x, y });
```

Clipped Electron region using CSS pixels from the renderer:

```javascript
var clip = await appWindow.evaluate(() => {
  const rect = document.getElementById("board").getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
});

await emitElectronScreenshotCssScaled({ electronApp, clip });
await clickCssPoint({ surface: appWindow, clip, x, y });
```

### Raw Screenshot Exception Examples

Use these only when raw pixels matter more than CSS-coordinate alignment, such as Retina or DPI artifact debugging, pixel-accurate rendering inspection, or other fidelity-sensitive review.

Web desktop raw emit:

```javascript
await codex.emitImage({
  bytes: await page.screenshot({ type: "jpeg", quality: 85 }),
  mimeType: "image/jpeg",
  detail: "original",
});
```

Electron raw emit:

```javascript
await codex.emitImage({
  bytes: await appWindow.screenshot({ type: "jpeg", quality: 85 }),
  mimeType: "image/jpeg",
  detail: "original",
});
```

Mobile raw emit after the mobile web context is already running:

```javascript
await codex.emitImage({
  bytes: await mobilePage.screenshot({ type: "jpeg", quality: 85 }),
  mimeType: "image/jpeg",
  detail: "original",
});
```

## Viewport Fit Checks (Required)

Do not assume a screenshot is acceptable just because the main widget is visible. Before signoff, explicitly verify that the intended initial view matches the product requirement, using both screenshot review and numeric checks.

- Define the intended initial view before signoff. For scrollable pages, this is the above-the-fold experience. For app-like shells, games, editors, dashboards, or tools, this is the full interactive surface plus the controls and status needed to use it.
- Use screenshots as the primary evidence for fit. Numeric checks support the screenshots; they do not overrule visible clipping.
- Signoff fails if any required visible region is clipped, cut off, obscured, or pushed outside the viewport in the intended initial view, even if page-level scroll metrics appear acceptable.
- Scrolling is acceptable when the product is designed to scroll and the initial view still communicates the core experience and exposes the primary call to action or required starting context.
- For fixed-shell interfaces, scrolling is not an acceptable workaround if it is needed to reach part of the primary interactive surface or essential controls.
- Do not rely on document scroll metrics alone. Fixed-height shells, internal panes, and hidden-overflow containers can clip required UI while page-level scroll checks still look clean.
- Check region bounds, not just document bounds. Verify that each required visible region fits within the viewport in the startup state.
- For Electron or desktop apps, verify both the launched window size and placement and the renderer's initial visible layout before any manual resize or repositioning.
- Passing viewport-fit checks only proves that the intended initial view is visible without unintended clipping or scrolling. It does not prove that the UI is visually correct or aesthetically successful.

Web or renderer check:

```javascript
console.log(await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  clientWidth: document.documentElement.clientWidth,
  clientHeight: document.documentElement.clientHeight,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
})));
```

Electron check:

```javascript
console.log(await appWindow.evaluate(() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  clientWidth: document.documentElement.clientWidth,
  clientHeight: document.documentElement.clientHeight,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
})));
```

Augment the numeric check with `getBoundingClientRect()` checks for the required visible regions in your specific UI when clipping is a realistic failure mode; document-level metrics alone are not sufficient for fixed shells.

## Dev Server

For local web debugging, keep the app running in a persistent TTY session. Do not rely on one-shot background commands from a short-lived shell.

Use the project's normal start command, for example:

```bash
npm start
```

Before `page.goto(...)`, verify the chosen port is listening and the app responds.

For Electron debugging, launch the app from `js_repl` through `_electron.launch(...)` so the same session owns the process. If the Electron renderer depends on a separate dev server (for example Vite or Next), keep that server running in a persistent TTY session and then relaunch or reload the Electron app from `js_repl`.

## Cleanup

Only run cleanup when the task is actually finished:

- This cleanup is manual. Exiting Codex, closing the terminal, or losing the `js_repl` session does not implicitly run `electronApp.close()`, `context.close()`, or `browser.close()`.
- For Electron specifically, assume the app may keep running if you leave the session without executing the cleanup cell first.

```javascript
if (electronApp) {
  await electronApp.close().catch(() => {});
}

if (mobileContext) {
  await mobileContext.close().catch(() => {});
}

if (context) {
  await context.close().catch(() => {});
}

if (browser) {
  await browser.close().catch(() => {});
}

browser = undefined;
context = undefined;
page = undefined;
mobileContext = undefined;
mobilePage = undefined;
electronApp = undefined;
appWindow = undefined;

console.log("Playwright session closed");
```

If you plan to exit Codex immediately after debugging, run the cleanup cell first and wait for the `"Playwright session closed"` log before quitting.

## Common Failure Modes

- `Cannot find module 'playwright'`: run the one-time setup in the current workspace and verify the import before using `js_repl`.
- Playwright package is installed but the browser executable is missing: run `npx playwright install chromium`.
- `page.goto: net::ERR_CONNECTION_REFUSED`: make sure the dev server is still running in a persistent TTY session, recheck the port, and prefer `http://127.0.0.1:<port>`.
- `electron.launch` hangs, times out, or exits immediately: verify the local `electron` dependency, confirm the `args` target, and make sure any renderer dev server is already running before launch.
- `Identifier has already been declared`: reuse the existing top-level bindings, choose a new name, or wrap the code in `{ ... }`. Use `js_repl_reset` only when the kernel is genuinely stuck.
- `browserContext.newPage: Protocol error (Target.createTarget): Not supported` while working with Electron: do not use `appWindow.context().newPage()` or `electronApp.context().newPage()` as a scratch page; use the Electron-specific screenshot normalization flow in the model-bound screenshots section.
- `js_repl` timed out or reset: rerun the bootstrap cell and recreate the session with shorter, more focused cells.
- Browser launch or network operations fail immediately: confirm the session was started with `--sandbox danger-full-access` and restart that way if needed.
