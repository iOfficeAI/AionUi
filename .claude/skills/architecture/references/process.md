# Main Process & Shared Layer

## `packages/desktop/src/process/` Structure

```
packages/desktop/src/process/
├── bridge/        # IPC handlers — one file per domain
│   ├── index.ts   # Registers all bridges
│   └── *Bridge.ts # Individual bridge files
├── services/      # Business logic services
│   ├── cron/      # Complex service → subdirectory
│   └── mcp-services/
├── database/      # SQLite layer — schema, migrations, repositories
├── task/          # Agent/task management — managers, factories
├── utils/         # Main-process-only utilities
└── i18n/          # Main-process i18n
```

## Naming Conventions

| Type              | Pattern                         | Examples                          |
| ----------------- | ------------------------------- | --------------------------------- |
| Bridge            | `<domain>Bridge.ts` (camelCase) | `cronBridge.ts`, `webuiBridge.ts` |
| Service           | `<Name>Service.ts` (PascalCase) | `CronService.ts`, `McpService.ts` |
| Service interface | `I<Name>Service.ts`             | `IConversationService.ts`         |
| Repository        | `<Name>Repository.ts`           | `SqliteConversationRepository.ts` |
| Agent Manager     | `<Platform>AgentManager.ts`     | `AcpAgentManager.ts`              |

All directories use lowercase (Node.js convention):

```
packages/desktop/src/process/
├── bridge/           # lowercase
├── services/         # lowercase
│   ├── cron/         # lowercase
│   └── mcp-services/ # lowercase (kebab-case for multi-word)
├── database/         # lowercase
└── task/             # lowercase
```

## Adding a New IPC Bridge

1. Create `packages/desktop/src/process/bridge/<domain>Bridge.ts`
2. Register in `packages/desktop/src/process/bridge/index.ts`
3. Expose channel in `packages/desktop/src/preload/`
4. Add renderer-side types if needed

## Adding a New Service

- Simple → single file in `packages/desktop/src/process/services/`
- Complex (multiple files) → subdirectory: `packages/desktop/src/process/services/<name>/`

## Service Testability Rules

### Pure Logic vs IO Separation

- **Pure logic** (transformation, validation, formatting) → standalone functions, no `fs`/`db`/`net`
- **IO operations** (file read, DB query, HTTP call) → thin wrappers in service class or repository
- Service methods should receive IO results as parameters

### Dependency Injection

```typescript
// ❌ Hard to test
import { db } from '@process/database';
function getConversation(id: string) {
  return db.query('SELECT * FROM conversations WHERE id = ?', id);
}

// ✅ Easy to test
function getConversation(repo: IConversationRepository, id: string) {
  return repo.findById(id);
}
```

For existing code using direct imports, `vi.mock()` is acceptable. For new code, prefer parameter injection.

---

## Shared Layer

### Preload (`packages/desktop/src/preload/`)

IPC bridge between main and renderer. Uses `contextBridge` to expose safe APIs.

- All main ↔ renderer communication goes through this file
- Only `contextBridge` and `ipcRenderer` APIs allowed
- No DOM manipulation, no Node.js `fs`

### Common (`packages/desktop/src/common/`)

Code imported by **both** main and renderer processes.

- **Belongs**: shared types, API adapters, protocol converters, storage keys
- **Does NOT belong**: React components → `renderer/`, Node.js-specific → `process/`

### Agent (`packages/desktop/src/process/agent/`)

One directory per AI platform (lowercase): `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/`. Each has `index.ts` entry. Runs in main or worker process.

### Worker (`packages/desktop/src/process/worker/`)

```
packages/desktop/src/process/worker/
├── fork/              # Fork management
├── <platform>.ts      # One file per agent platform (lowercase)
├── WorkerProtocol.ts  # Protocol definition (PascalCase — it's a class)
└── index.ts
```

### Other Modules

| Module     | Location                                   | Purpose                                            |
| ---------- | ------------------------------------------ | -------------------------------------------------- |
| Channels   | `packages/desktop/src/process/channels/`   | Multi-channel messaging (Lark, DingTalk, Telegram) |
| Extensions | `packages/desktop/src/process/extensions/` | Plugin loading, resolvers, sandbox                 |
| WebServer  | `packages/desktop/src/process/webserver/`  | Express + WebSocket for WebUI                      |
| Adapter    | `packages/desktop/src/common/adapter/`     | Platform adapters (browser vs main environment)    |
