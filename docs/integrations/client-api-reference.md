# Client API reference

The developer-only scanner reads AionUi TypeScript source using ts-morph. It produces a traceable client call inventory and local Scalar reference without running the application or contacting AionCore. This is a client-consumption view, not the authoritative server contract.

## Run

```sh
bun install --frozen-lockfile
bun run api:docs
bun run api:docs --serve
bun run api:docs --serve --port 8088
```

The default output is `.workspace/api-docs`, which is ignored by Git. `--root` selects the checkout to read and `--out` selects the output directory. The server binds only to `127.0.0.1`, prints its URL, and stops with Ctrl+C. It serves only generated reference assets, not the checkout. Scalar assets are supplied by the pinned local development dependency; there is no CDN or external proxy.

## Outputs

| Artifact                                  | Purpose                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `inventory.json`                          | HTTP inventory, parameters, request schemas, client response schemas, source locations, scope and diagnostics |
| `inventory.md`                            | Human-readable HTTP overview                                                                                  |
| `openapi.json`                            | AionCore client-view OpenAPI 3.1                                                                              |
| `openapi-N.json`, `documents.json`        | Separate documents and Scalar source selector for other known service targets                                 |
| `export-diagnostics.json`                 | Unresolved routes and conflicting entries omitted from OpenAPI                                                |
| `websocket.json`, `websocket.md`          | Separate connection, send, subscription and message-handler inventory                                         |
| `index.html`, `scalar.js`, `reference.js` | Local Scalar reference                                                                                        |

The reference disables request execution buttons, persistence, telemetry, AI assistance and developer publishing tools. Loading it makes no business requests. Existing backend authentication and runtime credentials are not imported. JSON/Markdown remain the first-version review interface; there is no custom Arco page.

## Evidence and limits

- Source roots are the desktop, web-host, web-cli and mobile source directories that exist in the selected checkout. Declaration files, test/fixture files, dependencies and transport implementation internals are excluded from HTTP call discovery. The output records the scope and exclusions.
- HTTP discovery recognizes the existing HTTP Bridge factories and direct browser/Electron fetch calls by symbol provenance. It follows supported straight-line returned wrappers up to three levels. Symbols with the same name from unrelated modules are not treated as the bridge.
- Constants, simple templates, encoded path parameters, aliases and supported parameter substitutions are resolved statically. Conditional targets, mutable values, complex query builders and unsupported expressions remain explicitly unknown. Arbitrary program execution and unbounded dataflow analysis are not supported.
- Entries are grouped only by known target, method and path, retaining call locations. Different targets receive separate OpenAPI documents. Conflicting client schemas are retained in the inventory and excluded from OpenAPI.
- `resolved` means the supported client fields were extracted; `partial` means the route is known but some client fields are missing or conflicting; `unknown` means a method or target/path is unresolved. None of these states certifies server behavior. Candidate records include wrapper expansions and are not a coverage percentage or a count of all server endpoints.
- `httpRequest<T>` unwraps the backend envelope. Its generic describes the client value, so generated documents use `x-client-response-schema` and standalone component models, not fabricated HTTP response bodies or success status codes. A `default` response documents this limit. Query requiredness, authentication and server error schemas are not inferred.
- Schema extraction is bounded to five recursive levels and fails conservatively for unsupported types. The full client type expression is retained. The request body's media type is exported only when the client transport or headers establish it.
- WebSocket bridge subscriptions and typed socket sends are separate from HTTP. Mapped payloads are marked as client projections; dynamic event names and connection associations remain unknown. Message handlers are listed without inventing business events from arbitrary handler logic. Local stub emitters are excluded.
- Scan outputs can contain source expressions and interface structure. Keep them local unless their publication is explicitly authorized. Existing frozen OpenAPI contracts remain unchanged.

Electron fetch supports imported aliases and `require('electron')` bindings. Injected functions with URL-like input and `Promise<Response>` output are recorded as fetch-contract candidates with `injected-fetch-contract`; this does not prove network execution. Numeric addition and string concatenation retain their distinct semantics. Object aliases, escapes, and unsupported writes make paths unknown. Merged status is recalculated from the combined diagnostics.

WebSocket receivers include both `addEventListener('message', ...)` and `onmessage` handler assignments, excluding null cleanup assignments. Structural WebSocket contracts with the full handler, send, and close surface carry `injected-websocket-contract`; the injected runtime implementation is not inferred. Mobile Axios and its dedicated Bridge wrappers remain unsupported; including a directory does not imply support for every transport form in it.

## Verification

```sh
bun run api:docs:check
bunx vitest run tests/unit/api-docs/scan.test.ts
bun run api:docs:smoke --url http://127.0.0.1:8088 --channel chrome
```

Tests exercise the generation entry point with source fixtures, inspecting the JSON, Markdown and validated OpenAPI artifacts. They cover aliases, wrappers, parameters, service separation, mutable/conditional routes, conflicts and WebSocket inventory. Browser acceptance additionally checks Scalar loading from the generated local site without business or external requests. Server-side integration and real service acceptance are separate checks.
