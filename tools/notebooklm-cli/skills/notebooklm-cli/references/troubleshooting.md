# NotebookLM CLI - Troubleshooting Guide

Solutions for common issues when using the `nlm` CLI.

---

## Quick Diagnosis

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "Cookies have expired" | Session timeout (~20 min) | `nlm login` |
| "Notebook not found" | Invalid/stale ID | `nlm notebook list` |
| "Source not found" | Invalid source ID | `nlm source list <nb-id>` |
| Chrome doesn't open | Port conflict | Close existing Chrome, retry |
| "Research already in progress" | Pending task | `--force` or import existing |
| "nodename nor servname" | Network blocked | See Sandbox Environments |
| Commands hang forever | Network/auth issue | Ctrl+C, `nlm login` |
| "Missing required flag: --confirm" | Forgot -y flag | Add `--confirm` or `-y` |

---

## Authentication Issues

### Session Expired

Sessions last approximately 20 minutes.

```bash
# Re-authenticate
nlm login

# Check-then-login pattern for scripts
nlm login --check || nlm login
```

### Chrome Doesn't Launch

1. Ensure Chrome is installed and in PATH:
   ```bash
   which google-chrome || which chromium
   ```

2. Close existing Chrome instances:
   ```bash
   pkill -f "Chrome"
   nlm login
   ```

3. Port conflict (the CLI tries ports 9222-9231):
   ```bash
   lsof -i :9222
   kill -9 <PID>
   ```

### Profile Issues

```bash
# List existing profiles
nlm auth list

# Create new profile
nlm login --profile work

# Delete corrupted profile
nlm auth delete <profile-name> --confirm
nlm login --profile <profile-name>

# Check active profile
nlm auth status
```

---

## Network Issues

### Sandbox Environments

Running inside a sandboxed environment (containers, Codex) that blocks network access.

For OpenAI Codex, add to `~/.codex/config.toml`:
```toml
[sandbox_workspace_write]
network_access = true
```

Or run with full network access:
```bash
codex exec --sandbox danger-full-access "nlm notebook list"
```

For Docker/containers, ensure the container can reach `notebooklm.google.com`.

### Rate Limiting

Free tier: ~50 operations/day.

```bash
# Wait between operations
nlm source add $ID --url "..." && sleep 2
nlm source add $ID --url "..." && sleep 2

# Use batch operations where possible
nlm research import <nb-id> <task-id>    # Imports multiple sources at once
nlm source sync <nb-id> --confirm         # Syncs all stale sources at once
```

---

## Source Issues

### Source Not Found

```bash
# Verify source exists in correct notebook
nlm source list <notebook-id>
```

Sources are scoped to notebooks — ensure you're using the right notebook ID.

### Drive Source Issues

```bash
# Verify document ID (extract from URL)
# https://docs.google.com/document/d/[DOC_ID]/edit

# Specify correct type
nlm source add <nb-id> --drive <doc-id> --type slides  # for Slides
nlm source add <nb-id> --drive <doc-id> --type sheets  # for Sheets
nlm source add <nb-id> --drive <doc-id> --type pdf     # for PDF
```

Large documents (100+ slides) may take longer — the CLI has a 120-second timeout.

### Stale Drive Sources

```bash
# Check which sources are stale
nlm source stale <notebook-id>

# Sync all stale sources
nlm source sync <notebook-id> --confirm

# Sync specific sources
nlm source sync <notebook-id> --source-ids <id1>,<id2> --confirm
```

---

## Research Issues

### Research Already in Progress

```bash
# Wait for completion
nlm research status <notebook-id>

# Import existing results
nlm research status <notebook-id> --full  # Get task ID
nlm research import <notebook-id> <task-id>

# Force new research
nlm research start "query" --notebook-id <id> --force
```

### Research Takes Too Long

Expected durations: fast mode ~30s, deep mode ~5 min.

```bash
# Check status without waiting
nlm research status <notebook-id> --max-wait 0
```

Try a more specific query — broader queries take longer.

---

## Generation Issues

### Expected Generation Times

| Content Type | Duration |
|-------------|----------|
| Reports, quizzes, flashcards | 30-60 seconds |
| Audio podcasts | 2-5 minutes |
| Videos | 3-7 minutes |
| Deep research | 4-5 minutes |

### Generation Failed

```bash
# Check artifact status
nlm studio status <notebook-id>

# Ensure notebook has sources
nlm source list <notebook-id>

# Delete failed artifact and retry
nlm studio delete <notebook-id> <artifact-id> --confirm
nlm audio create <notebook-id> --confirm
```

Common causes: no sources in notebook, sources too short, or temporary API issues.

---

## Command Syntax Issues

### Wrong Argument Order

```bash
# WRONG: research start without --notebook-id flag
nlm research start "query" <notebook-id>

# CORRECT: --notebook-id is a required flag
nlm research start "query" --notebook-id <notebook-id>
```

```bash
# WRONG: data-table without description
nlm data-table create <notebook-id> --confirm

# CORRECT: description is a required positional argument
nlm data-table create <notebook-id> "Extract all dates" --confirm
```

### Custom Chat Prompt Without --goal

```bash
# WRONG: --prompt without --goal custom
nlm chat configure <id> --prompt "Act as a tutor..."

# CORRECT: specify both
nlm chat configure <id> --goal custom --prompt "Act as a tutor..."
```

---

## Error Recovery Patterns

### Re-authentication on Failure

```bash
nlm notebook list || (nlm login && nlm notebook list)
```

### Retry with Backoff

```bash
retry_command() {
    local max=3 delay=5
    for ((i=1; i<=max; i++)); do
        "$@" && return 0
        sleep $delay
        delay=$((delay * 2))
    done
    return 1
}

retry_command nlm audio create $NOTEBOOK_ID --confirm
```

### Check Before Generate

```bash
SOURCE_COUNT=$(nlm source list $NOTEBOOK_ID --quiet | wc -l)
if [ "$SOURCE_COUNT" -gt 0 ]; then
    nlm audio create $NOTEBOOK_ID --confirm
else
    echo "Error: No sources in notebook"
fi
```

---

## Getting More Help

```bash
nlm <command> --help    # Command-specific help
nlm --ai                # Full AI-friendly documentation
nlm --version           # Check installed version
```

Issues: https://github.com/jacob-bd/notebooklm-cli/issues
