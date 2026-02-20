# Google Suite CLI (gog) - Troubleshooting Guide

Solutions for common issues when using the `gog` CLI.

---

## Quick Diagnosis

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "token has been expired or revoked" | Expired/revoked refresh token | `gog auth add <email>` |
| "oauth2: cannot fetch token" | No stored credentials | `gog auth credentials <path>` |
| "no credentials found" | Missing OAuth client | `gog auth credentials <path>` |
| "insufficient scopes" | Needs re-auth with more scopes | `gog auth add <email> --force-consent` |
| "googleapi: Error 403: Forbidden" | Missing API permission | Enable API in Google Cloud Console |
| "googleapi: Error 404: Not Found" | Wrong ID or no access | Verify resource ID and account |
| "googleapi: Error 429: Rate Limit" | Too many requests | Wait and retry with backoff |
| Commands hang | Network or auth issue | Ctrl+C, check `gog auth status` |
| No output | Wrong account | Add `--account <email>` |

---

## Authentication Issues

### No Credentials Stored

```bash
# Check if any OAuth credentials exist
gog auth credentials list

# Store OAuth client credentials (from Google Cloud Console)
gog auth credentials ./client_secret.json

# For multiple OAuth clients (e.g., work vs personal)
gog --client work auth credentials ./work_credentials.json
gog --client personal auth credentials ./personal_credentials.json
```

### Token Expired or Revoked

```bash
# Re-authorize the account
gog auth add user@example.com

# Force new consent (to add new scopes)
gog auth add user@example.com --force-consent

# Check all tokens
gog auth list --check
```

### Headless / Remote Server Authentication

```bash
# Option 1: Manual flow (paste URL in local browser)
gog auth add user@example.com --manual

# Option 2: Remote split flow
# On remote server:
gog auth add user@example.com --remote --step 1
# Copy the URL, open in local browser, authorize, get callback URL
# On remote server:
gog auth add user@example.com --remote --step 2 --auth-url "<callback-url>"
```

### Multiple Accounts

```bash
# List all accounts
gog auth list

# Use a specific account
gog --account user@example.com gmail search "test"

# Set default account via env
export GOG_ACCOUNT=user@example.com

# Create alias for convenience
gog auth alias set work user@work.com
gog --account work gmail search "test"
```

### Keyring Issues

```bash
# Check current backend
gog auth keyring

# macOS: use Keychain (recommended)
gog auth keyring keychain

# Linux/headless: use encrypted file
gog auth keyring file
export GOG_KEYRING_PASSWORD="your-password"

# Auto-detect (platform default)
gog auth keyring auto
```

---

## Scope & Permission Issues

### Insufficient Scopes

When you get "insufficient scopes" errors, re-authorize with the needed services:

```bash
# Authorize all user services
gog auth add user@example.com --services user

# Read-only access (safer for initial testing)
gog auth add user@example.com --readonly

# Limit Drive scope
gog auth add user@example.com --drive-scope file    # File-level only
gog auth add user@example.com --drive-scope readonly # Read-only Drive
```

### API Not Enabled

If you see "403: Access Not Configured" errors:
1. Go to Google Cloud Console > APIs & Services > Library
2. Search for and enable the required API (e.g., Gmail API, Calendar API, Drive API)
3. Wait a few minutes for propagation

### Workspace-Only Features

Some features require Google Workspace (not personal Gmail):
- `gog chat` — Google Chat API
- `gog keep` — Keep API (also requires service account)
- `gog groups` — Groups API
- `gog classroom` — Classroom API (Education edition)
- `gog gmail delegates` — Delegation
- `gog calendar team` — Team calendar views

---

## Resource Not Found

### Wrong Resource ID

```bash
# List available resources to find correct IDs
gog gmail labels list                    # Get label IDs
gog calendar calendars                   # Get calendar IDs
gog drive ls                             # Get file IDs
gog tasks lists                          # Get tasklist IDs
gog sheets metadata <spreadsheetId>      # Verify spreadsheet

# Common ID format issues:
# - Drive IDs: long alphanumeric string from URL
# - Calendar IDs: email-like format (primary, user@example.com)
# - Sheet ranges: 'Sheet1!A1:B10' (quote the range in shell)
```

### Wrong Account

Resources are scoped to accounts. Ensure you're using the right one:

```bash
# Check which account you're using
gog auth status

# Explicitly specify account
gog --account work@company.com drive ls
```

---

## Rate Limiting

### Recommended Delays

| Service | Recommended Delay |
|---------|-------------------|
| Gmail send | 1 second |
| Gmail batch operations | 2 seconds |
| Drive upload | 2 seconds |
| Sheets write | 1 second |
| Calendar create | 1 second |
| Contacts create | 1 second |

### Handling Rate Limits

```bash
# Simple retry pattern
gog gmail send --to user@example.com --subject "Hi" --body "Test" || sleep 5 && !!

# Batch with delays
for email in $(cat emails.txt); do
    gog gmail send --to "$email" --subject "Update" --body "..."
    sleep 2
done
```

---

## Output Issues

### Getting Structured Output

```bash
# JSON for programmatic use
gog gmail search 'is:unread' --json

# TSV for piping to awk/cut
gog calendar events primary --today --plain

# Default: human-readable table
gog drive ls
```

### Timezone Issues

```bash
# Set default timezone
gog config set default_timezone America/New_York

# Or via environment
export GOG_TIMEZONE=America/New_York

# Per-command timezone
gog calendar events primary --today  # Uses configured timezone
```

---

## Common Command Mistakes

### Sheets Range Syntax

```bash
# WRONG: unquoted range (shell interprets !)
gog sheets get abc123 Sheet1!A1:B10

# CORRECT: quoted range
gog sheets get abc123 'Sheet1!A1:B10'
```

### Sheets Update Values

```bash
# Pipe (|) separates columns, comma (,) separates rows
gog sheets update abc123 'A1' 'col1|col2,col3|col4'
# Result: A1=col1, B1=col2, A2=col3, B2=col4

# For complex data, use JSON
gog sheets update abc123 'A1' --values-json '[["a","b"],["c","d"]]'
```

### Calendar Date Formats

```bash
# RFC 3339 format required for absolute dates
gog calendar create primary --summary "Meeting" --from 2025-01-15T10:00:00Z --to 2025-01-15T11:00:00Z

# With timezone offset
gog calendar create primary --summary "Meeting" --from 2025-01-15T10:00:00-05:00 --to 2025-01-15T11:00:00-05:00

# Relative dates also work for queries
gog calendar events primary --from today --to friday
```

---

## Service Account Issues (Workspace)

```bash
# Verify service account configuration
gog auth service-account status user@domain.com

# Configure domain-wide delegation
gog auth service-account set user@domain.com --key ./service-account.json

# Remove misconfigured service account
gog auth service-account unset user@domain.com
```

Service accounts require:
1. Google Cloud project with domain-wide delegation enabled
2. Service account key JSON file
3. Admin consent for required scopes in Workspace Admin Console

---

## Getting More Help

```bash
gog --help                    # Top-level help
gog <service> --help          # Service help
gog <service> <cmd> --help    # Command help
GOG_HELP=full gog --help      # Expanded command listing
gog --verbose <command>       # Debug logging
```

Issues: https://github.com/steipete/gogcli/issues
