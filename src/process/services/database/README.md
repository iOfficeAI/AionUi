# AionUi Database System

本文档介绍 AionUi 的新数据库系统，它使用 **better-sqlite3** (主进程) 作为持久化存储。

## 架构概览

```
┌─────────────────────────────────────┐
│         主进程 (Main Process)        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   better-sqlite3            │   │
│  │   - 账户系统                 │   │
│  │   - 聊天记录持久化           │   │
│  │   - 配置信息 (db_version)    │   │
│  └─────────────────────────────┘   │
│              ↕ IPC                  │
└─────────────────────────────────────┘
              ↕ IPC
┌─────────────────────────────────────┐
│       渲染进程 (Renderer Process)    │
│                                     │
│  - IPC Bridge 直接查询主进程数据库   │
│  - React State 管理UI状态           │
│  - localStorage 保存临时数据        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         文件系统 (File System)       │
│                                     │
│  - 图片文件 (message.resultDisplay) │
│  - 大文件附件                       │
│  - 数据库文件 (aionui.db)           │
└─────────────────────────────────────┘
```

## 设计特点

### ✅ 复用现有类型系统

数据库层完全复用现有的业务类型定义：

- `TChatConversation` - 会话类型
- `TMessage` - 消息类型

### ✅ 自动迁移

首次启动时，系统会自动将文件存储的数据迁移到数据库，无需手动操作。

### ✅ 图片存储

- 图片文件存储在文件系统中
- 通过message.resultDisplay字段引用图片路径
- 不在数据库中存储图片元数据

### ✅ 高性能

- better-sqlite3 的同步API，避免mutex争用
- WAL模式，提升并发性能
- 完善的索引设计
- 支持事务操作

## 使用方式

### 主进程 (Main Process)

```typescript
import { getDatabase } from '@/process/database/export';

// 获取数据库实例
const db = getDatabase();

// 创建会话
const conversation: TChatConversation = {
  id: 'conv_123',
  name: 'My Conversation',
  type: 'gemini',
  extra: { workspace: '/path/to/workspace' },
  model: {
    /* provider info */
  },
  createTime: Date.now(),
  modifyTime: Date.now(),
};

const result = db.createConversation(conversation);
if (result.success) {
  console.log('Conversation created');
}

// 插入消息
const message: TMessage = {
  id: 'msg_123',
  conversation_id: 'conv_123',
  type: 'text',
  content: { content: 'Hello world' },
  position: 'right',
  createdAt: Date.now(),
};

db.insertMessage(message);

// 查询会话的消息（分页）
const messages = db.getConversationMessages('conv_123', 0, 50);
console.log(messages.data); // TMessage[]
```

### 渲染进程 (Renderer Process)

```typescript
import { ipcBridge } from '@/common';

// 通过IPC查询消息
const messages = await ipcBridge.database.getConversationMessages({
  conversation_id: 'conv_123',
  page: 0,
  pageSize: 100,
});

// 草稿使用React状态管理
const [draft, setDraft] = useState('');

// UI状态使用localStorage
localStorage.setItem('sidebar_collapsed', 'true');
const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
```

## 数据库文件位置

- **数据库文件**: `{userData}/config/aionui.db`
- **图片文件**: `{userData}/data/images/`

其中 `{userData}` 为：

- macOS: `~/Library/Application Support/AionUi/`
- Windows: `%APPDATA%/AionUi/`
- Linux: `~/.config/AionUi/`

## 迁移管理

### 查看迁移状态

```typescript
import { getMigrationStatus } from '@/process/database/export';

const status = await getMigrationStatus();
console.log(status);
// {
//   completed: true,
//   date: 1738012345678,
//   version: 1,
//   stats: { conversations: 10, messages: 532, ... }
// }
```

### 手动触发迁移

```typescript
import { migrateFileStorageToDatabase } from '@/process/database/export';

const result = await migrateFileStorageToDatabase();
if (result.success) {
  console.log('Migration completed:', result.stats);
} else {
  console.error('Migration errors:', result.errors);
}
```

### 回滚迁移（测试用）

```typescript
import { rollbackMigration } from '@/process/database/export';

await rollbackMigration();
// 清除迁移标记，可以重新运行迁移
```

## 备份与恢复

### 导出数据

```typescript
import { exportDatabaseToJSON } from '@/process/database/export';

const data = await exportDatabaseToJSON();
await fs.writeFile('backup.json', JSON.stringify(data, null, 2));
```

### 导入数据

```typescript
import { importDatabaseFromJSON } from '@/process/database/export';

const data = JSON.parse(await fs.readFile('backup.json', 'utf-8'));
await importDatabaseFromJSON(data);
```

### 数据库文件备份

直接复制 `aionui.db` 和 `aionui.db-wal` 文件即可。

## API 参考

### AionUIDatabase 主要方法

#### 会话操作

- `createConversation(conversation, userId?)` - 创建会话
- `getConversation(conversationId)` - 获取会话
- `getUserConversations(userId?, page?, pageSize?)` - 获取用户的所有会话（分页）
- `updateConversation(conversationId, updates)` - 更新会话
- `deleteConversation(conversationId)` - 删除会话

#### 消息操作

- `insertMessage(message)` - 插入单条消息
- `insertMessages(messages)` - 批量插入消息
- `getConversationMessages(conversationId, page?, pageSize?)` - 获取会话消息（分页）
- `deleteConversationMessages(conversationId)` - 删除会话的所有消息

#### 配置操作

- `setConfig(key, value)` - 设置配置（主要用于数据库版本跟踪）
- `getConfig<T>(key)` - 获取配置
- `getAllConfigs()` - 获取所有配置
- `deleteConfig(key)` - 删除配置

#### 工具方法

- `getStats()` - 获取数据库统计信息（返回: users, conversations, messages）
- `vacuum()` - 清理数据库，回收空间

### IPC Bridge 方法

- `database.getConversationMessages({ conversation_id, page?, pageSize? })` - 查询消息（支持分页）

## 性能优化建议

1. **批量插入消息**: 使用 `insertMessages()` 而不是循环调用 `insertMessage()`
2. **分页查询**: 大量数据时使用分页参数
3. **定期清理**: 定期调用 `db.vacuum()` 清理数据库
4. **WAL模式**: 数据库已启用WAL模式，支持读写并发
5. **图片去重**: 系统自动通过hash去重，无需额外处理

## 故障排查

### 数据库锁定错误

如果出现 "database is locked" 错误：

1. 确保只有一个应用实例在运行
2. 检查是否有其他进程在访问数据库文件
3. 重启应用

### 迁移失败

如果迁移失败：

1. 查看错误日志确定具体原因
2. 使用 `rollbackMigration()` 回滚
3. 修复数据问题后重新迁移

### Native模块问题

如果better-sqlite3加载失败：

1. 运行 `npm rebuild better-sqlite3`
2. 确认Electron版本与依赖兼容
3. 查看Electron Forge配置

## 数据库版本升级和迁移

### 版本管理

数据库Schema有版本控制，当前版本为 **v4**。每个版本升级都有对应的迁移脚本。

```typescript
import { getDatabase } from '@/process/database/export';

const db = getDatabase();

// 查看迁移历史
const history = db.getMigrationHistory();
console.log(history);
// [
//   { version: 1, name: 'Initial schema', timestamp: 1738012345678 },
//   { version: 2, name: 'Add performance indexes', timestamp: 1738012345679 },
//   ...
// ]

// 检查特定迁移是否已执行
const isV2Applied = db.isMigrationApplied(2);
```

### 迁移脚本

迁移脚本在 `migrations.ts` 中定义。每个迁移包含：

- **version**: 目标版本号
- **name**: 迁移名称
- **up()**: 升级脚本
- **down()**: 降级脚本（用于回滚）

#### 当前迁移列表

- **v1**: 初始Schema（用户、会话、消息、配置）
- **v2**: 添加性能索引（复合索引优化查询）
- **v3**: ~~添加全文搜索支持~~ (已跳过，不创建FTS表)
- **v4**: 添加用户偏好设置表
- **v5**: 删除FTS表（清理v3遗留的表，确保数据库结构一致）

### 如何添加新迁移

1. **编辑 migrations.ts**

```typescript
const migration_v5: IMigration = {
  version: 5,
  name: 'Add user sessions table',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_token
        ON user_sessions(token);
    `);
    console.log('[Migration v5] Added user sessions table');
  },
  down: (db) => {
    db.exec(`DROP TABLE IF EXISTS user_sessions;`);
    console.log('[Migration v5] Rolled back: Removed user sessions table');
  },
};

// 添加到迁移列表
export const ALL_MIGRATIONS: IMigration[] = [
  migration_v1,
  migration_v2,
  migration_v3,
  migration_v4,
  migration_v5, // 新增
];
```

2. **更新 schema.ts 中的版本号**

```typescript
export const CURRENT_DB_VERSION = 5; // 从 4 改为 5
```

3. **重启应用**

应用启动时会自动检测版本变化并执行迁移：

```
[Database] Migrating from version 4 to 5
[Migrations] Running 1 migrations from v4 to v5
[Migrations] Running migration v5: Add user sessions table
[Migration v5] Added user sessions table
[Migrations] ✓ Migration v5 completed
[Migrations] All migrations completed successfully
```

### 迁移特性

#### ✅ 事务保护

所有迁移在单个事务中执行。如果任何迁移失败，所有更改将回滚：

```typescript
// migrations.ts
const runAll = db.transaction(() => {
  for (const migration of migrations) {
    migration.up(db); // 如果抛出异常，整个事务回滚
  }
});
```

#### ✅ 迁移历史

每个成功的迁移都会记录在 `configs` 表中：

```sql
SELECT * FROM configs WHERE key LIKE 'migration_v%';
-- migration_v1: {"version":1,"name":"Initial schema","timestamp":1738012345678}
-- migration_v2: {"version":2,"name":"Add performance indexes","timestamp":1738012345679}
```

#### ✅ 幂等性

所有迁移使用 `IF NOT EXISTS` 确保可以安全重复执行。

### 回滚迁移（测试用）

```typescript
import { rollbackMigrations } from '@/process/database/export';

// ⚠️ WARNING: 这会导致数据丢失！
const db = getDatabase();
rollbackMigrations(db.db, 4, 2); // 从 v4 回滚到 v2

// 回滚后需要手动更新版本号
setDatabaseVersion(db.db, 2);
```

### 迁移最佳实践

1. **向后兼容**: 尽量使用 `ALTER TABLE ADD COLUMN` 而不是删除字段
2. **数据转换**: 在迁移中处理数据格式变更
3. **索引优化**: 添加索引不会影响现有数据
4. **测试回滚**: 确保 `down()` 方法能正确恢复
5. **小步迁移**: 一个迁移只做一件事

### 常见迁移操作

#### 添加新表

```typescript
up: (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS new_table (
      id TEXT PRIMARY KEY,
      ...
    );
  `);
};
```

#### 添加字段

```typescript
up: (db) => {
  db.exec(`
    ALTER TABLE users ADD COLUMN phone TEXT;
  `);
};
```

#### 添加索引

```typescript
up: (db) => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  `);
};
```

#### 数据迁移

```typescript
up: (db) => {
  // 先添加新字段
  db.exec(`ALTER TABLE users ADD COLUMN full_name TEXT;`);

  // 然后迁移数据
  db.exec(`
    UPDATE users
    SET full_name = COALESCE(first_name || ' ' || last_name, username)
    WHERE full_name IS NULL;
  `);
};
```

## 未来计划

- [x] 数据库版本升级和迁移系统
- [ ] 支持多用户账户系统
- [ ] 数据加密
- [ ] 云端同步
- [ ] 更多查询API（搜索、过滤等）
- [ ] 性能监控和优化
- [ ] 数据分析和统计

## 技术栈

- **better-sqlite3** v12.4.1 - 主进程SQLite数据库
- **Electron IPC Bridge** - 渲染进程与主进程通信
- **Electron Forge** - 自动处理native模块

## 贡献

如需添加新的数据库功能：

1. 在 `schema.ts` 中添加表结构
2. 在 `types.ts` 中定义类型（优先复用现有业务类型）
3. 在 `index.ts` 中添加CRUD方法
4. 更新本README文档

---

**最后更新**: 2025-01-27
