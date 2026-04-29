# Phase 3: 非业务层适配 — 任务清单

**前置**: Phase 2（旧代码清理）完成  
**目标**: 适配类型定义、字段映射、IPC 桥接层，不涉及 Hook/组件业务代码  
**并行**: 三个子任务互相独立，可并行执行

---

## Task 3-A: teamMapper.ts — 状态映射适配

**文件**: `src/common/adapter/teamMapper.ts`  
**行号**: 第 35–41 行（`toStatus` 函数）

**改动**:
更新 `toStatus()` 映射表，支持后端新状态枚举 `working | thinking | tool_use | error`：

```typescript
function toStatus(raw: string | undefined): TeammateStatus {
  const statusMap: Record<string, TeammateStatus> = {
    'idle': 'idle',
    'working': 'active',
    'thinking': 'active',
    'tool_use': 'active',
    'completed': 'completed',
    'error': 'failed',
    'pending': 'pending',
  };
  return statusMap[raw ?? ''] ?? 'idle';
}
```

**验证**:
- [ ] 单元测试覆盖全部 6 个后端状态 + 未知值 fallback
- [ ] `bunx tsc --noEmit` 无类型错误

---

## Task 3-B: teamTypes.ts — 状态枚举说明更新

**文件**: `src/common/types/teamTypes.ts`  
**行号**: 第 48 行（`TeammateStatus` 类型定义）

**改动**:
前端 `TeammateStatus` 枚举本身**保持不变**（`pending | idle | active | completed | failed`），  
但在类型旁边添加注释，标注后端状态的映射来源，便于维护：

```typescript
// Backend statuses: idle|working|thinking|tool_use|completed|error → mapped via teamMapper.toStatus()
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';
```

**验证**:
- [ ] 类型定义无变化，不影响上游组件
- [ ] `bunx tsc --noEmit` 无错误

---

~~Task 3-C 已移至 Phase 6~~

`ipcBridge.ts` 中的 `team.sendMessage` / `team.sendMessageToAgent` 删除操作**不在本 Phase 执行**。  
原因：Phase 5 的 `AcpSendBox.tsx` 和 `AionrsSendBox.tsx` 仍调用这两个方法，Phase 5 完成前删除会导致编译失败。  
→ 见 `docs/phase6/TASKS.md` Task 6-A。
