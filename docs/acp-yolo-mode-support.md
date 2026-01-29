# ACP Backend YOLO Mode Support Research

## Overview

This document summarizes the research findings on YOLO mode (auto-approve / permission bypass) support across different ACP (Agent Communication Protocol) backends integrated with AionUI.

## Summary Table

| CLI Tool | AionUI Implementation | CLI Native Support | Notes |
|----------|----------------------|-------------------|-------|
| **Claude Code** | ✅ Implemented | ✅ Supported | Via `session/set_mode: bypassPermissions` |
| **Qwen Code** | ✅ Implemented | ✅ Supported | Via `session/set_mode: yolo` |
| **Goose** | ✅ Implemented | ✅ Supported | Via `GOOSE_MODE=auto` environment variable |
| **OpenCode** | ❌ Not supported | ❌ No --yolo flag | v1.1.39 tested, no yolo support; project archived, migrated to Crush |
| **Droid (Factory)** | ✅ N/A | ✅ No permission system | Executes directly, no `request_permission` messages |
| **Auggie** | ❌ Not implemented | ❌ Not supported | Design emphasizes security approval, no bypass option |
| **Kimi** | ✅ N/A | ✅ No permission system | Chat tool, no file/shell operations, no permissions needed |

## Key Findings

### 1. Multiple ACP Backends Support YOLO Mode

Several ACP backends support permission bypass, each with their own implementation:

#### Claude Code
- **Method**: `session/set_mode` with `bypassPermissions` mode ID
- **CLI Equivalent**: `--dangerously-skip-permissions` flag
- **Implementation Location**: `src/agent/acp/index.ts:183-191`

```typescript
// Claude Code "YOLO" mode: bypass all permission checks
if (this.extra.backend === 'claude' && this.extra.yoloMode) {
  await this.connection.setSessionMode(CLAUDE_YOLO_SESSION_MODE);
}
```

#### Qwen Code
- **Method**: `session/set_mode` with `yolo` mode ID
- **CLI Equivalent**: `--yolo` flag
- **Permission Modes**: `plan` | `default` | `auto-edit` | `yolo`
- **Config**: `.qwen/settings.json` → `permissions.defaultMode: "yolo"`

#### Goose
- **Method**: Mode switching via environment or command
- **CLI Equivalent**: `GOOSE_MODE=auto` or `/mode auto` in session
- **Permission Modes**: `auto` | `smart-approve` | `approve` | `chat`
- **Note**: `auto` mode auto-approves all file modifications, extensions, and deletions

#### OpenCode
- **Method**: Non-interactive mode flag
- **CLI Equivalent**: `-p "prompt"` flag
- **Note**: All permissions are auto-approved when using `-p` (non-interactive mode)

### 2. Understanding ACP Permission System

**Important**: The ACP permission system is **opt-in**. A CLI tool only requires user confirmation if it sends `session/request_permission` messages. Some tools (like Droid and Kimi) don't implement this - they execute operations directly without asking for permission.

This means:
- **Tools with permission system**: Need YOLO mode to auto-approve (Claude, Qwen, Goose, OpenCode, Auggie)
- **Tools without permission system**: Work like YOLO mode by default (Droid, Kimi)

### 3. ACP Protocol Implementation

The `session/set_mode` method is part of the ACP protocol (`src/agent/acp/AcpConnection.ts`):

```typescript
async setSessionMode(modeId: string): Promise<AcpResponse> {
  return await this.sendRequest('session/set_mode', {
    sessionId: this.sessionId,
    modeId,
  });
}
```

Each CLI determines which modes it supports. The following backends implement permission bypass:

| Backend | Mode ID | Description |
|---------|---------|-------------|
| Claude Code | `bypassPermissions` | Skip all permission checks |
| Qwen Code | `yolo` | Auto-approve all operations |
| Goose | `auto` | Fully autonomous mode |
| OpenCode | N/A | v1.1.39 tested - no yolo support in ACP mode |

### 4. CLI Launch Arguments Comparison

| CLI Tool | ACP Launch Arguments | Permission Bypass Support |
|----------|---------------------|--------------------------|
| Claude Code | `--experimental-acp` | ✅ `session/set_mode: bypassPermissions` |
| Qwen Code | `--experimental-acp` | ✅ `session/set_mode: yolo` |
| Goose | `acp` | ✅ `GOOSE_MODE=auto` environment variable |
| OpenCode | `acp` | ❌ No yolo support (v1.1.39 tested) |
| Droid | `exec --output-format acp` | ✅ N/A (no permission system) |
| Kimi | `--acp` | ✅ N/A (chat tool, no permissions) |
| Auggie | `--acp` | ❌ None (security-first design) |

## Impact on CronService

The scheduled task feature (`CronService`) uses `yoloMode: true` to auto-approve tool calls during execution:

| Agent Type | Scheduled Task Behavior |
|------------|------------------------|
| **Gemini** | ✅ Works normally - supports yolo via native config |
| **Claude (ACP)** | ✅ Works normally - supports `bypassPermissions` |
| **Qwen Code (ACP)** | ✅ Works normally - supports `yolo` mode (implemented) |
| **Goose (ACP)** | ✅ Works normally - supports `auto` mode (implemented) |
| **OpenCode (ACP)** | ⚠️ May require manual confirmation - no yolo support tested |
| **Droid (ACP)** | ✅ Works normally - no permission system, executes directly |
| **Kimi (ACP)** | ✅ Works normally - chat tool, no permissions needed |
| **Auggie (ACP)** | ⚠️ Requires manual confirmation - security-first design |

## Recommendations

### Implemented YOLO mode support:

1. **Claude Code**: `session/set_mode: bypassPermissions` ✅
2. **Qwen Code**: `session/set_mode: yolo` ✅
3. **Goose**: `GOOSE_MODE=auto` environment variable ✅

### Backends without yolo support (may require manual confirmation for scheduled tasks):

1. **OpenCode**: v1.1.39 does not support `--yolo` flag; project archived, migrated to Crush
2. **Auggie**: Security-first design, no bypass option

### For backends without permission system (Droid, Kimi):

These backends execute directly without sending `session/request_permission` messages, so YOLO mode is not applicable - they work like YOLO mode by default.

### For backends that don't support YOLO mode (Auggie only):

1. **UI Indication**: Display a warning that scheduled tasks for Auggie backend require manual confirmation
2. **Feature Limitation**: Consider disabling scheduled task creation for Auggie
3. **Monitor Updates**: Keep track of Auggie CLI updates that may add permission bypass support

## Research Methodology

This research was conducted by:

1. Analyzing the AionUI codebase for existing implementations
2. Reviewing ACP protocol specifications and connection handlers
3. Examining CLI configuration and launch parameters
4. Reviewing official documentation and GitHub repositories:
   - Qwen Code: Permission modes documented in official SDK docs
   - Goose: Mode configuration in Block's official documentation
   - OpenCode: Non-interactive mode documented in CLI help
   - Auggie: Security design principles from Augment Code docs

## References

- `src/agent/acp/index.ts` - ACP agent implementation with yoloMode check
- `src/agent/acp/AcpConnection.ts` - ACP protocol connection handler
- `src/agent/acp/constants.ts` - Claude YOLO session mode constant
- `src/types/acpTypes.ts` - ACP backend configurations
- `tests/unit/test_claude_yolo_mode.ts` - Claude YOLO mode tests

---

*Last updated: 2026-01-28*
