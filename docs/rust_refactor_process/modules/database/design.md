# Database Module -- Rust Design

> This document will be fully populated by the `rust-design` skill after analyzing the TypeScript source.
> Source: `src/process/services/database/`

## 1. TypeScript Interface Analysis

**Source files:**
- `src/process/services/database/index.ts` (AionUIDatabase class)
- `src/process/services/database/schema.ts`
- `src/process/services/database/migrations.ts`
- `src/process/services/database/types.ts`
- `src/process/services/database/SqliteConversationRepository.ts`
- `src/process/services/database/SqliteChannelRepository.ts`

**Function signatures:**

<!-- TO BE FILLED by rust-design: extract all public methods from AionUIDatabase -->

| TS Function | Parameters | Return Type | Sync/Async |
|-------------|-----------|-------------|------------|
| `getDatabase` | -- | `AionUIDatabase` | sync |
| `closeDatabase` | -- | `void` | sync |
| `createUser` | user data | `IUser` | sync |
| `getUser` | id | `IUser \| undefined` | sync |
| `getUserByUsername` | username | `IUser \| undefined` | sync |
| `hasUsers` | -- | `boolean` | sync |
| `getConversation` | id | `IConversationRow` | sync |
| `createConversation` | data | `IConversationRow` | sync |
| `updateConversation` | id, data | `void` | sync |
| `getConversationMessages` | conversationId | `IMessageRow[]` | sync |
| `insertMessage` | data | `IMessageRow` | sync |
| `insertMessages` | data[] | `IMessageRow[]` | sync |
| `getMessage` | id | `IMessageRow` | sync |
| `updateMessage` | id, data | `void` | sync |
| `deleteMessage` | id | `void` | sync |
| `getConfig` | key | `string \| undefined` | sync |
| `setConfig` | key, value | `void` | sync |
| `vacuum` | -- | `void` | sync |
| `runMigrations` | db, from, to | `void` | sync |

**Caller sites:**

<!-- TO BE FILLED by rust-design -->

## 2. Rust API Design

<!-- TO BE FILLED by rust-design -->

## 3. Error Handling Strategy

<!-- TO BE FILLED by rust-design -->

## 4. FFI Boundary Design

<!-- TO BE FILLED by rust-design -->

## 5. Migration Plan

<!-- TO BE FILLED by rust-design -->

## 6. Test Strategy

<!-- TO BE FILLED by rust-design -->
