# Main Process & Shared Layer

## `src/process/` Structure

```
src/process/
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
src/process/
├── bridge/           # lowercase
├── services/         # lowercase
│   ├── cron/         # lowercase
│   └── mcp-services/ # lowercase (kebab-case for multi-word)
├── database/         # lowercase
└── task/             # lowercase
```

## Adding a New IPC Bridge

1. Create `src/process/bridge/<domain>Bridge.ts`
2. Register in `src/process/bridge/index.ts`
3. Expose channel in `src/preload.ts`
4. Add renderer-side types if needed

## Adding a New Service

- Simple → single file in `src/process/services/`
- Complex (multiple files) → subdirectory: `src/process/services/<name>/`

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

### Preload (`src/preload.ts`)

IPC bridge between main and renderer. Uses `contextBridge` to expose safe APIs.

- All main ↔ renderer communication goes through this file
- Only `contextBridge` and `ipcRenderer` APIs allowed
- No DOM manipulation, no Node.js `fs`

### Common (`src/common/`)

Code imported by **both** main and renderer processes.

- **Belongs**: shared types, API adapters, protocol converters, storage keys
- **Does NOT belong**: React components → `renderer/`, Node.js-specific → `process/`

### Agent (`src/agent/`)

One directory per AI platform (lowercase): `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/`. Each has `index.ts` entry. Runs in main or worker process.

### Worker (`src/worker/`)

```
src/worker/
├── fork/              # Fork management
├── <platform>.ts      # One file per agent platform (lowercase)
├── WorkerProtocol.ts  # Protocol definition (PascalCase — it's a class)
└── index.ts
```

### Other Modules

| Module     | Location          | Purpose                                            |
| ---------- | ----------------- | -------------------------------------------------- |
| Channels   | `src/channels/`   | Multi-channel messaging (Lark, DingTalk, Telegram) |
| Extensions | `src/extensions/` | Plugin loading, resolvers, sandbox                 |
| WebServer  | `src/webserver/`  | Express + WebSocket for WebUI                      |
| Adapter    | `src/adapter/`    | Platform adapters (browser vs main environment)    |
