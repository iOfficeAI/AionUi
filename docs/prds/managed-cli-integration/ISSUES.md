# Managed CLI Integration — ISSUES

## Closed (frontend scope)

| #   | Issue                                                             | Fix                                                                                |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `reconcileManagedRuntimeState` crash from `prefs` reference error | Fixed                                                                              |
| 2   | Dev runtime state split masked sync path                          | Fixed — fresh runtime confirmed                                                    |
| 3   | Managed sync wrote to backend DB but not CLI config files         | Fixed — `syncManagedProviderRuntimeConfigs` rewritten with fallback + verification |
| 4   | Packaged runtime failed to launch                                 | Fixed — app resolver handles `POUNDING.app`                                        |
| 5   | Packaged update check crashed at startup                          | Fixed — now logs 404 instead of crashing                                           |
| 6   | Claude cleanup was incomplete                                     | Fixed — `removeFromKnownPaths()` covers bun/npm/Windows                            |
| 7   | Hermes install fails if venv exists                               | Fixed — `uv venv --clear`                                                          |
| 8   | OpenCode config fell back to `~/.config/opencode/`                | Fixed — managed-only path in `resolveOpencodeConfigPath()`                         |
| 9   | Claude ACP agent exited code 1 due to model env vars              | Fixed — removed `ANTHROPIC_*_MODEL` from env injection                             |
| 10  | Brand asset `pounding-heart-solid.png` 404                        | Fixed — added to AionCore assets + rebuild                                         |
| 11  | Update feed repo path mismatch                                    | Fixed — `electron-builder.yml` repo → `halojerry/AionUi`                           |
| 12  | macOS app resolver scanned entire `Contents/MacOS/`               | Fixed — `Info.plist` `CFBundleExecutable` preferred                                |

## Open (backend ACP agent scope — AionCore)

| #   | Issue                                                       | Notes                                      |
| --- | ----------------------------------------------------------- | ------------------------------------------ |
| 13  | Claude `session/new` crashes with `guide_mcp` injection     | Backend ACP agent; not frontend sync       |
| 14  | Hermes returns empty response                               | Backend SDK spawn; not frontend sync       |
| 15  | OpenCode `end_turn` with zero assistant text                | Backend ACP protocol; not frontend sync    |
| 16  | OpenClaw response text duplicated                           | Backend fallback mapper; not frontend sync |
| 17  | Final UI manual smoke (login/register/Feishu/Sentry/visual) | Manual QA                                  |
