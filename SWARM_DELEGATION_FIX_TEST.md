# Swarm Delegation Fix - Testing Guide

## Changes Made

### 1. Enhanced Debug Logging in SwarmSessionManager.ts

**File**: `src/agent/swarm/SwarmSessionManager.ts` (lines 111-130)

Added comprehensive validation logging:

- Full file path of system prompt
- Character length of prompt
- First 300 characters preview
- Validation checks for critical sections:
  - ✅ "CRITICAL REQUIREMENT" section
  - ✅ `<directive>` tag documentation
  - ✅ `<plan>` tag documentation
  - ✅ `<report>` tag documentation
- Warning if critical sections are missing

### 2. Enhanced Debug Logging in claude-skills.js

**File**: `src/agent/acp/hooks/claude-skills.js` (lines 72-92)

Added detailed injection logging:

- Backend verification
- PresetContext presence and length
- Validation of critical content in presetContext
- First 200 characters preview
- Total content length after injection

### 3. Database Cleanup

- No existing dual-claude swarm conversations found
- Fresh start ensures no cached old prompts

---

## Testing Instructions

### Step 1: Restart Application

**IMPORTANT**: The debug logging code needs to be compiled. You must:

1. Stop the current AionUi app completely
2. Run `npm start` to recompile and start fresh
3. Watch the terminal for compilation messages

### Step 2: Create New Swarm Conversation

1. In AionUi interface, create a new conversation
2. Select **"dual-claude"** assistant type
3. Name it something like "Test Delegation Fix"

### Step 3: Check Initialization Logs

Watch terminal for these log groups:

#### A. SwarmSessionManager Logs (should appear twice - once for driver, once for navigator)

```
[SwarmSessionManager] ===== LOADING SYSTEM PROMPT FOR driver =====
[SwarmSessionManager] Prompt file path: /path/to/assistant/dual-claude/swarm/driver/driver.md
[SwarmSessionManager] Total length: XXXX characters
[SwarmSessionManager] First 300 chars: ...
[SwarmSessionManager] Validation:
[SwarmSessionManager]   - Has CRITICAL REQUIREMENT section: true ✅
[SwarmSessionManager]   - Has <directive> tag docs: true ✅
[SwarmSessionManager]   - Has <plan> tag docs: true ✅
[SwarmSessionManager]   - Has <report> tag docs: true ✅
[SwarmSessionManager] ===== END SYSTEM PROMPT VALIDATION =====
```

**Expected**: All validation checks should be `true`. If any are `false`, the system prompt was not loaded correctly.

#### B. AcpAgentManager First Message Logs

```
[AcpAgentManager] First message - presetContext length: XXXX
[AcpAgentManager] After prepareFirstMessage - content length: YYYY
```

**Expected**: presetContext length should match the system prompt length from SwarmSessionManager logs.

#### C. claude-hooks Injection Logs

```
[claude-hooks] onFirstMessage - backend: claude
[claude-hooks] onFirstMessage - has presetContext: true length: XXXX
[claude-hooks] onFirstMessage - presetContext validation:
[claude-hooks]   - Has CRITICAL REQUIREMENT: true ✅
[claude-hooks]   - Has <directive> tag: true ✅
[claude-hooks]   - First 200 chars: ...
[claude-hooks] onFirstMessage - injected presetContext, total length: YYYY
```

**Expected**: All validation checks should be `true`.

### Step 4: Test Delegation with Simple Task

Send this exact message to the swarm:

```
Create a simple HTML counter button that increments when clicked
```

### Step 5: Verify Driver Behavior

Watch the Driver's first response. It should contain:

✅ **MUST HAVE**:

- `<plan>` tags with implementation strategy
- `<directive>` tags with instructions for Navigator
- NO tool calls (no Write, WebFetch, Bash, etc.)
- Text explaining the plan

❌ **MUST NOT HAVE**:

- Direct Write/Edit tool calls creating files
- WebFetch or WebSearch calls
- Implementation code
- File creation

**Good Example Response**:

```
<plan>
I'll break this down into:
1. HTML structure with button
2. JavaScript click handler
3. Simple styling
</plan>

<directive>
to: navigator

Create a counter.html file with:
- Button element with id="counterBtn"
- Display element showing current count
- JavaScript that increments counter on click
</directive>
```

**Bad Example Response** (what we're trying to fix):

```
Let me create the counter button.

[Uses Write tool to create counter.html]
[Uses Write tool to create styles.css]
```

### Step 6: Verify Navigator Reception

After Driver sends directive:

1. Check feed.jsonl: `cat ~/.aionui/swarm-temp-*/claude/.swarm/feed.jsonl`
2. Should contain entries with `type: "directive"`
3. Check navigator message queue: `cat ~/.aionui/swarm-temp-*/claude/.swarm/navigator-mq.jsonl`
4. Should contain the directive message

### Step 7: Verify Navigator Implementation

Navigator should:

- ✅ Receive the directive
- ✅ Implement the code (Write tool calls are OK here)
- ✅ Report back with `<report>` tags
- ✅ Describe what was done

### Step 8: Verify Back-and-Forth Delegation

The conversation should flow:

1. **User** → task
2. **Driver** → `<plan>` + `<directive>`
3. **Navigator** → implementation + `<report>`
4. **Driver** → review + next `<directive>` OR completion message
5. Repeat steps 3-4 until task complete

---

## Success Criteria Checklist

### Initialization Phase

- [ ] SwarmSessionManager logs show all validation checks = `true`
- [ ] AcpAgentManager logs show presetContext with correct length
- [ ] claude-hooks logs show successful injection with validation = `true`

### First Driver Response

- [ ] Contains `<plan>` tags
- [ ] Contains `<directive>` tags
- [ ] Does NOT contain Write/Edit/WebFetch tool calls
- [ ] Driver only plans and directs, doesn't implement

### Navigator Response

- [ ] Receives directive in message queue
- [ ] Implements the code (Write tools OK)
- [ ] Reports back with `<report>` tags

### Overall Flow

- [ ] Clean delegation pattern established
- [ ] Multiple directive/report cycles work
- [ ] Driver reviews Navigator's work
- [ ] Task completes successfully

---

## Troubleshooting

### Issue: Validation checks show `false`

**Diagnosis**: System prompt not loaded correctly

**Solution**:

1. Check webpack compilation: `ls -la .webpack/main/assistant/dual-claude/swarm/driver/driver.md`
2. Verify file contents: `grep "CRITICAL REQUIREMENT" .webpack/main/assistant/dual-claude/swarm/driver/driver.md`
3. If missing, rebuild: `npm run build` and restart

### Issue: presetContext length is 0

**Diagnosis**: PresetContext not being passed through

**Solution**:

1. Check SwarmSessionManager is setting it correctly (line 137)
2. Verify AcpAgentManager constructor receives it
3. May need to implement Option 2 or 3 from plan

### Issue: Driver still does implementation work

**Diagnosis**: Claude ignoring system prompt instructions

**Solutions** (in order of preference):

1. **Strengthen prompt**: Add even more explicit warnings in driver.md
2. **Implement Option 3**: Prepend system prompt in driver hooks instead of presetContext
3. **Tool-based approach**: Create custom delegation tools (more infrastructure needed)

### Issue: Navigator doesn't receive directives

**Diagnosis**: Hook not parsing `<directive>` tags

**Check**:

1. Verify driver-hooks.js has `onTurnComplete` handler
2. Check for `<directive>` tag parsing logic
3. Check feed.jsonl for directive entries

---

## Next Steps After Testing

### If All Tests Pass ✅

- Document the successful delegation pattern
- Consider adding automated tests
- Update dual-claude documentation

### If Tests Fail ❌

- Review logs to identify exact failure point
- Try Option 2: Force prompt reloading with stronger validation
- Try Option 3: Direct system prompt injection in hooks
- Consider tool-based delegation approach (see original plan appendix)

---

## Log Collection Commands

```bash
# Check webpack compiled prompts
grep "CRITICAL REQUIREMENT" .webpack/main/assistant/dual-claude/swarm/driver/driver.md
grep "CRITICAL REQUIREMENT" .webpack/main/assistant/dual-claude/swarm/navigator/navigator.md

# Check swarm workspace files
ls -la ~/.aionui/swarm-temp-*/claude/.swarm/

# View feed
cat ~/.aionui/swarm-temp-*/claude/.swarm/feed.jsonl | jq .

# View message queues
cat ~/.aionui/swarm-temp-*/claude/.swarm/driver-mq.jsonl | jq .
cat ~/.aionui/swarm-temp-*/claude/.swarm/navigator-mq.jsonl | jq .

# Follow app logs in real-time
# (in terminal where npm start was run)
```

---

## Reference: Enhanced Prompt Sections

The enhanced prompts now include:

**Driver (driver.md)**:

```markdown
## ⚠️ CRITICAL REQUIREMENT: OUTPUT FORMAT

You MUST follow this response pattern on EVERY turn:

<plan>
[Your strategic analysis and planning]
</plan>

<directive>
to: navigator

[Specific implementation task for Navigator]
</directive>
```

**Navigator (navigator.md)**:

```markdown
## ⚠️ CRITICAL REQUIREMENT: OUTPUT FORMAT

You MUST follow this response pattern on EVERY turn:

<report>
to: driver

[What you implemented and results]
</report>
```

These sections should be loaded and visible in the Driver/Navigator's system prompts.
