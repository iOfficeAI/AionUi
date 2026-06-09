#!/usr/bin/env node
/**
 * Sync `opencodeProviderTypes.ts` from the installed `@opencode-ai/sdk` package.
 *
 * The hand-mirrored OpenCode types in
 * `packages/desktop/src/common/types/opencode/opencodeProviderTypes.ts` drifted
 * from the SDK over time, so this script regenerates that file by re-exporting
 * the SDK's v2 gen types under the AionUi `OpenCode*` aliases that the rest of
 * the app (ipcBridge, opencodeProviderCatalog, ProviderAuthCard, …) imports.
 *
 * AionUi-internal view models that don't exist in the SDK (OpenCodeProviderView,
 * OpenCodeProviderCatalogView) are appended at the bottom and are not generated.
 *
 * ## Version pin (single source of truth)
 *
 * The pinned SDK version lives in `<chisl-root>/opencode-sdk-version.json`,
 * which is consumed by BOTH sides:
 *   - This script (reads `version`, fails fast if `package.json` /
 *     `node_modules/@opencode-ai/sdk/package.json` disagree with the pin).
 *   - `AionCore/crates/aionui-opencode-conformance/build.rs` (reads the same
 *     JSON, exposes `OPENCODE_SDK_VERSION` to the Rust conformance suite and
 *     the test in `aionui_opencode_conformance::tests::sdk_version_pin_*`).
 *
 * When bumping the SDK: update the JSON, run `bun add -d @opencode-ai/sdk@<v>`,
 * re-run this script, then `cargo test -p aionui-opencode-conformance` so the
 * Rust pin-test sees the new `package.json` value.
 *
 * Usage:
 *   node scripts/sync-opencode-types.js
 *   node scripts/sync-opencode-types.js --check   # CI mode: exit 2 on drift
 *
 * The script is idempotent — running it twice with no SDK version change
 * produces an identical file. If the SDK adds a new field that we want to
 * expose, update the `SDK_TYPE_MAP` below and re-run.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.resolve(REPO_ROOT, 'packages/desktop/src/common/types/opencode/opencodeProviderTypes.ts');
const SDK_PKG_JSON = path.resolve(REPO_ROOT, 'node_modules/@opencode-ai/sdk/package.json');
const SDK_ENTRY = '@opencode-ai/sdk/v2';

// Single source of truth for the pinned @opencode-ai/sdk version. The path is
// resolved by walking up from AionUi/ to the chisl-root (i.e. the directory
// that contains both AionUi/ and AionCore/). The AionCore side reaches the
// same file via `crates/aionui-opencode-conformance/build.rs` and a relative
// `../../../opencode-sdk-version.json` path.
const PIN_FILE_CANDIDATES = [
  path.resolve(REPO_ROOT, '..', 'opencode-sdk-version.json'),
  path.resolve(REPO_ROOT, 'opencode-sdk-version.json'),
];

function findPinFile() {
  for (const candidate of PIN_FILE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readPinnedVersion() {
  const pinFile = findPinFile();
  if (!pinFile) {
    throw new Error(
      `Cannot find the SDK pin file. Looked at:\n` +
        PIN_FILE_CANDIDATES.map((p) => `  - ${p}`).join('\n') +
        `\nCreate <chisl-root>/opencode-sdk-version.json (see existing schema) before running this script.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(pinFile, 'utf-8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${pinFile}: ${err.message}`);
  }
  const pkg = parsed.package || '@opencode-ai/sdk';
  const version = parsed.version;
  if (!version) {
    throw new Error(`${pinFile} is missing required \`version\` field`);
  }
  return { pinFile, packageName: pkg, pinnedVersion: version };
}

/**
 * SDK type -> AionUi alias. Each entry means:
 *   `export type AionUiAlias = SdkType;`
 * The aliases preserve AionUi's public type surface so no consumer needs to
 * change when the SDK is bumped.
 */
const SDK_TYPE_MAP = [
  // §8 Auth union
  { aionui: 'OpenCodeApiAuth', sdk: 'ApiAuth' },
  { aionui: 'OpenCodeWellKnownAuth', sdk: 'WellKnownAuth' },
  // §8 ProviderAuthMethod (prompts are inlined in the SDK; we just alias)
  { aionui: 'OpenCodeProviderAuthMethod', sdk: 'ProviderAuthMethod' },
  { aionui: 'OpenCodeProviderAuthAuthorization', sdk: 'ProviderAuthAuthorization' },
  // §9 Model / Provider
  { aionui: 'OpenCodeProviderModel', sdk: 'Model' },
  { aionui: 'OpenCodeProvider', sdk: 'Provider' },
];

/**
 * Types we extract from a path inside the SDK rather than aliasing the top
 * level. Each entry is rendered as `export type AIONUI = SDK[...];`.
 */
const SDK_DERIVED_TYPE_MAP = [
  // The SDK inlines the prompt union inside ProviderAuthMethod.prompts.
  // AionUi uses `OpenCodeAuthPrompt` as a named handle for the union element
  // (e.g. `renderPrompt(prompt: OpenCodeAuthPrompt, idx: number)`), so we
  // extract it here to keep the call sites type-safe.
  { aionui: 'OpenCodeAuthPrompt', sdk: "NonNullable<ProviderAuthMethod['prompts']>[number]" },
  { aionui: 'OpenCodePromptWhen', sdk: "NonNullable<NonNullable<ProviderAuthMethod['prompts']>[number]['when']>" },
];

/**
 * Endpoints whose response shape is a stable SDK export. We alias them so
 * AionUi can keep saying `OpenCodeProviderListResponse` even though the SDK
 * sometimes wraps the body in `ProviderListResponses[keyof ProviderListResponses]`.
 *
 * The SDK's `ProviderListResponses[200]` literal body matches the AionUi
 * view of the wire format.
 *
 * NOTE: `ProviderAuthResponses[200]` is `{ [key: string]: Array<ProviderAuthMethod> }`,
 * which is the same as `Record<string, OpenCodeProviderAuthMethod[]>`. We
 * intentionally keep the explicit form in the AionUi view-model block below
 * (more readable, identical type) and don't emit an SDK alias for it to avoid
 * a duplicate-identifier compile error.
 */
const SDK_ENDPOINT_TYPE_MAP = [{ aionui: 'OpenCodeProviderListResponse', sdk: 'ProviderListResponses' }];

const HEADER = `/**
 * OpenCode provider catalog types.
 *
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *   Source: @opencode-ai/sdk v2 gen types
 *   Script: scripts/sync-opencode-types.js
 *   Pin: <chisl-root>/opencode-sdk-version.json (single source of truth,
 *        mirrored by AionCore/crates/aionui-opencode-conformance::OPENCODE_SDK_VERSION)
 *
 * Each export below aliases an SDK type under its AionUi name so the rest of
 * the app (ipcBridge.ts, opencodeProviderCatalog.ts, ProviderAuthCard.tsx,
 * …) can keep using \`OpenCode*\` names without caring which SDK version is
 * installed. To regenerate after bumping @opencode-ai/sdk:
 *
 *   1. Update <chisl-root>/opencode-sdk-version.json::version (the SoT).
 *   2. bun add -d @opencode-ai/sdk@<version>
 *   3. node scripts/sync-opencode-types.js
 *   4. cd AionCore && cargo test -p aionui-opencode-conformance
 *      (the pin test will fail if step 1 + 2 disagree).
 *
 * AionUi-internal view models (OpenCodeProviderView, OpenCodeProviderCatalogView)
 * live at the bottom of this file — they are not in the SDK and are preserved
 * across regenerations.
 *
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §8 Provider authentication
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §9 Discovery — GET /provider
 */
`;

function readSdkVersion() {
  if (!fs.existsSync(SDK_PKG_JSON)) {
    throw new Error(`Cannot find ${SDK_PKG_JSON}. Install @opencode-ai/sdk first: bun add -d @opencode-ai/sdk`);
  }
  const pkg = JSON.parse(fs.readFileSync(SDK_PKG_JSON, 'utf-8'));
  return pkg.version || 'unknown';
}

/**
 * Assert the installed SDK (from `node_modules`) matches the version pinned in
 * `<chisl-root>/opencode-sdk-version.json` AND the `devDependencies` entry in
 * `AionUi/package.json`. This is the TS-side mirror of
 * `aionui_opencode_conformance::tests::sdk_version_pin_matches_package_json_dev_dependency`.
 *
 * Returns an object with both versions so the caller can format a precise
 * error message and continue with the installed version for the actual
 * generation (we don't refuse to regenerate; the pin failure is reported and
 * the user decides whether to abort).
 */
function checkPinDrift() {
  const installed = readSdkVersion();
  const { pinFile, packageName, pinnedVersion } = readPinnedVersion();
  const packageJsonPath = path.resolve(REPO_ROOT, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const declared = packageJson.devDependencies?.[packageName] || packageJson.dependencies?.[packageName] || null;

  const issues = [];
  if (declared !== pinnedVersion) {
    issues.push(
      `${packageJsonPath} ${packageName} = ${JSON.stringify(declared)} does not match pin ${JSON.stringify(pinnedVersion)} from ${pinFile}`
    );
  }
  if (installed !== pinnedVersion) {
    issues.push(
      `installed ${packageName}@${installed} (${SDK_PKG_JSON}) does not match pin ${JSON.stringify(pinnedVersion)} from ${pinFile}`
    );
  }
  return { installed, declared, pinnedVersion, packageName, pinFile, issues };
}

function renderTypeAliases() {
  const lines = [];
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// §8 Auth union — aliased from @opencode-ai/sdk/v2');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');

  const auth = SDK_TYPE_MAP.filter((m) => ['OpenCodeApiAuth', 'OpenCodeWellKnownAuth'].includes(m.aionui));
  for (const { aionui, sdk } of auth) {
    lines.push(`export type ${aionui} = ${sdk};`);
  }
  lines.push('');

  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// §8 Provider auth method (GET /provider/auth) — aliased from SDK');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');
  for (const { aionui, sdk } of SDK_TYPE_MAP.filter((m) =>
    ['OpenCodeProviderAuthMethod', 'OpenCodeProviderAuthAuthorization'].includes(m.aionui)
  )) {
    lines.push(`export type ${aionui} = ${sdk};`);
  }
  lines.push('');

  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// §8 Prompt types — derived from ProviderAuthMethod.prompts');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');
  for (const { aionui, sdk } of SDK_DERIVED_TYPE_MAP) {
    lines.push(`export type ${aionui} = ${sdk};`);
  }
  lines.push('');

  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// §9 Provider / Model — aliased from SDK');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');
  for (const { aionui, sdk } of SDK_TYPE_MAP.filter((m) =>
    ['OpenCodeProviderModel', 'OpenCodeProvider'].includes(m.aionui)
  )) {
    lines.push(`export type ${aionui} = ${sdk};`);
  }
  lines.push('');

  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// §9 GET /provider + §8 GET /provider/auth — response shape aliased from SDK');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');
  for (const { aionui, sdk } of SDK_ENDPOINT_TYPE_MAP) {
    lines.push(`export type ${aionui} = ${sdk}[keyof ${sdk}];`);
  }
  return lines.join('\n');
}

/**
 * View-model types live in the SDK-free portion of the file. We preserve them
 * exactly across regenerations so the call sites in
 * opencodeProviderCatalog.ts / ProviderAuthCard.tsx keep compiling.
 */
const VIEW_MODEL_BLOCK = `// ---------------------------------------------------------------------------
// AionUi-internal view model (not in the SDK).
// Built by opencodeProviderCatalog.buildProviderCatalogView from the SDK
// responses above. Kept verbatim across regenerations.
// ---------------------------------------------------------------------------

/** \`GET /provider/auth\` response — provider id → methods */
export type OpenCodeProviderAuthMethodsResponse = Record<string, OpenCodeProviderAuthMethod[]>;

/** Merged view model for the settings UI */
export type OpenCodeProviderView = {
  provider: OpenCodeProvider;
  connected: boolean;
  authMethods: OpenCodeProviderAuthMethod[];
  models: OpenCodeProviderModel[];
  isDefaultProvider: boolean;
};

export type OpenCodeProviderCatalogView = {
  providers: OpenCodeProviderView[];
  defaultProviderId?: string;
  defaultModelId?: string;
  connectedCount: number;
};
`;

function buildOutput(sdkVersion, pin) {
  // The import list is split one-per-line so oxfmt (which wraps a single-line
  // `import type { a, b, c, ... }` after ~80 columns) leaves it alone —
  // otherwise the generated file would re-format itself every time someone
  // runs `bun run format`.
  const sdkImports = [...SDK_TYPE_MAP.map((m) => m.sdk), ...SDK_ENDPOINT_TYPE_MAP.map((m) => m.sdk)];
  const importBlock = ['import type {', ...sdkImports.map((name) => `  ${name},`), `} from '${SDK_ENTRY}';`].join('\n');
  // Surface the pin in the generated header so a code-search for the SDK
  // version finds the JSON path of the SoT in the same view.
  const pinNote = pin
    ? `\n// Pinned at generation: ${pin.packageName}@${sdkVersion} (matches ${path.relative(REPO_ROOT, pin.pinFile)}).\n`
    : '';
  const parts = [HEADER.trimStart(), pinNote.trimStart(), importBlock, '', renderTypeAliases().trimEnd(), '', VIEW_MODEL_BLOCK.trim(), ''];
  // The trailing newline above already gives us one; we don't want double-blocks.
  let out = parts.join('\n');
  // Drop accidental 3+ consecutive blank lines (oxfmt is fine with up to 2).
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function main() {
  const checkMode = process.argv.includes('--check');

  // Pin check: the JSON, `package.json`, and the installed SDK must all
  // agree. We always run this (not just in --check) so a developer who
  // regenerates with a stale `package.json` gets an actionable error
  // *before* a CI run on a different machine disagrees with the local one.
  let drift;
  try {
    drift = checkPinDrift();
  } catch (err) {
    if (checkMode) {
      process.stderr.write(`[sync-opencode-types] (--check) ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }

  if (drift.issues.length > 0) {
    const summary =
      `[sync-opencode-types] SDK pin drift detected:\n` +
      drift.issues.map((s) => `  - ${s}`).join('\n') +
      `\nBump the JSON (${path.relative(REPO_ROOT, drift.pinFile)}), ` +
      `package.json devDependencies.${drift.packageName}, ` +
      `and the installed SDK together.`;
    if (checkMode) {
      process.stderr.write(summary + '\n');
      process.exit(2);
    }
    // Outside --check we still warn loudly and continue; refusing to
    // regenerate would block unrelated format/alias changes from being
    // applied. The drift is recorded in the changelog by the developer
    // who runs the script.
    process.stderr.write(summary + '\n');
    return;
  }

  const sdkVersion = drift.installed;
  const content = buildOutput(sdkVersion, drift);

  const prev = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf-8') : null;
  if (prev === content) {
    process.stdout.write(
      `[sync-opencode-types] up-to-date (SDK ${sdkVersion}, matches pin ${drift.pinnedVersion}) — no changes.\n`
    );
    return;
  }

  if (checkMode) {
    process.stderr.write(
      `[sync-opencode-types] drift detected for SDK ${sdkVersion}.\n` +
        `Run \`bun run types:sync-opencode\` to regenerate ${path.relative(REPO_ROOT, OUTPUT_FILE)}.\n`
    );
    process.exit(2);
  }

  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  process.stdout.write(
    `[sync-opencode-types] regenerated ${path.relative(REPO_ROOT, OUTPUT_FILE)} (SDK ${sdkVersion}, pin ${drift.pinnedVersion})\n`
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[sync-opencode-types] ${err.message}\n`);
  process.exit(1);
}
