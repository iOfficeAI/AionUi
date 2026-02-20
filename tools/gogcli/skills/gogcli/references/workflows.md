# Google Suite CLI (gog) - Workflow Examples

End-to-end workflow sequences for common tasks with the `gog` CLI.

---

## Critical Rule: Confirm Destructive Operations

Before executing ANY delete or permanent-delete command, ALWAYS ask the user for explicit confirmation. Deletions may be irreversible.

Commands requiring user confirmation:
- `gog drive delete <fileId> --permanent`
- `gog contacts delete <resourceName>`
- `gog tasks delete <tasklistId> <taskId>`
- `gog tasks clear <tasklistId>`
- `gog gmail batch delete <msgId1> <msgId2>`
- `gog auth remove <email>`

---

## Workflow 1: First-Time Setup

```bash
# Step 1: Store OAuth credentials (from Google Cloud Console)
gog auth credentials ./client_secret.json

# Step 2: Authorize your Google account
gog auth add user@gmail.com

# Step 3: Verify authentication
gog auth status

# Step 4: Test with a simple command
gog gmail search 'is:unread' --max 5

# Step 5: Set up account alias (optional)
gog auth alias set me user@gmail.com
```

---

## Workflow 2: Email Triage

Search, read, and organize unread emails.

```bash
# List unread emails
gog gmail search 'is:unread' --max 20

# Read a specific thread
gog gmail thread get <threadId>

# Star important threads
gog gmail thread modify <threadId> --add STARRED

# Archive processed threads
gog gmail thread modify <threadId> --remove INBOX

# Download attachments from a thread
gog gmail thread get <threadId> --download --out-dir ./attachments
```

---

## Workflow 3: Send Email with Attachment

```bash
# Upload attachment to Drive first
gog drive upload ./report.pdf --parent <folderId>

# Send email with body from file
gog gmail send \
  --to recipient@example.com \
  --subject "Q4 Report" \
  --body-file ./email-body.txt

# Or send HTML email
gog gmail send \
  --to recipient@example.com \
  --subject "Q4 Report" \
  --body "Please see attached report." \
  --body-html "<p>Please see the <b>attached report</b>.</p>"
```

---

## Workflow 4: Calendar Management

View schedule, create events, respond to invitations.

```bash
# Check today's schedule
gog calendar events primary --today

# Check this week
gog calendar events primary --week

# Check multiple calendars
gog calendar events --all --today

# Create a meeting
gog calendar create primary \
  --summary "Team Sync" \
  --from 2025-02-15T14:00:00Z \
  --to 2025-02-15T15:00:00Z \
  --attendees "alice@company.com,bob@company.com" \
  --location "Zoom" \
  --send-updates all

# Accept an invitation
gog calendar respond primary <eventId> --status accepted

# Find scheduling conflicts
gog calendar conflicts --calendars "primary,work@company.com" --today

# Check team availability
gog calendar freebusy \
  --calendars "alice@company.com,bob@company.com" \
  --from 2025-02-15T00:00:00Z \
  --to 2025-02-16T00:00:00Z
```

---

## Workflow 5: Drive File Management

Upload, organize, and share files.

```bash
# Create a project folder
gog drive mkdir "Q4 Project"

# Upload files to the folder
gog drive upload ./report.docx --parent <folderId> --convert
sleep 1
gog drive upload ./data.xlsx --parent <folderId> --convert
sleep 1
gog drive upload ./slides.pptx --parent <folderId> --convert

# Share folder with team
gog drive share <folderId> --to user --email alice@company.com --role writer
gog drive share <folderId> --to user --email bob@company.com --role reader

# Download a file as PDF
gog drive download <fileId> --format pdf --out ./export.pdf

# Search for files
gog drive search "quarterly report" --max 10
```

---

## Workflow 6: Spreadsheet Data Pipeline

Read from and write to Google Sheets.

```bash
# Create a new spreadsheet
gog sheets create "Sales Data" --sheets "Q1,Q2,Q3,Q4"

# Write headers
gog sheets update <spreadsheetId> 'Q1!A1' 'Date|Product|Revenue|Units'

# Append data rows
gog sheets append <spreadsheetId> 'Q1!A:D' '2025-01-15|Widget A|1500|50'
gog sheets append <spreadsheetId> 'Q1!A:D' '2025-01-16|Widget B|2300|75'

# Read data back
gog sheets get <spreadsheetId> 'Q1!A1:D10' --json

# Format header row as bold
gog sheets format <spreadsheetId> 'Q1!A1:D1' \
  --format-json '{"textFormat":{"bold":true}}' \
  --format-fields 'userEnteredFormat.textFormat.bold'

# Export to Excel
gog sheets export <spreadsheetId> --format xlsx --out ./sales-data.xlsx
```

---

## Workflow 7: Document Creation

Create and manage Google Docs.

```bash
# Create document from markdown
gog docs create "Meeting Notes" --file ./notes.md

# Read document content
gog docs cat <docId>

# Update content from markdown
gog docs write <docId> --replace --markdown --file ./updated-notes.md

# Find and replace text
gog docs find-replace <docId> "DRAFT" "FINAL"

# Export to PDF
gog docs export <docId> --format pdf --out ./meeting-notes.pdf
```

---

## Workflow 8: Task Management

Organize tasks across lists.

```bash
# List all task lists
gog tasks lists

# Create a new task list
gog tasks lists create "Sprint 42"

# Add tasks
gog tasks add <tasklistId> --title "Review PR #123"
gog tasks add <tasklistId> --title "Deploy v2.0" --due 2025-02-20
gog tasks add <tasklistId> --title "Weekly standup" --due 2025-02-17 --repeat weekly --repeat-count 4

# View tasks
gog tasks list <tasklistId>

# Mark task as done
gog tasks done <tasklistId> <taskId>

# Update a task
gog tasks update <tasklistId> <taskId> --title "Deploy v2.1"
```

---

## Workflow 9: Presentation from Markdown

Create and export slide decks.

```bash
# Create presentation from markdown
gog slides create-from-markdown "Q4 Results" --content-file ./slides.md

# Add a slide with image
gog slides add-slide <presentationId> ./chart.png --notes "Revenue grew 15% YoY"

# List slides
gog slides list-slides <presentationId>

# Update speaker notes
gog slides update-notes <presentationId> <slideId> --notes "Updated talking points"

# Export as PDF and PPTX
gog slides export <presentationId> --format pdf --out ./deck.pdf
gog slides export <presentationId> --format pptx --out ./deck.pptx
```

---

## Workflow 10: Multi-Account Workflow

Work with both personal and work accounts.

```bash
# Set up aliases
gog auth alias set work user@company.com
gog auth alias set personal user@gmail.com

# Check work email
gog --account work gmail search 'is:unread' --max 10

# Check personal calendar
gog --account personal calendar events primary --today

# Upload to work Drive
gog --account work drive upload ./report.pdf

# Or set default via environment
export GOG_ACCOUNT=work
gog gmail search 'is:unread' --max 10
```

---

## Workflow 11: Contact Management

Search and manage contacts.

```bash
# Search contacts
gog contacts search "Alice" --max 10

# Get contact details
gog contacts get alice@example.com

# Create a new contact
gog contacts create \
  --given "Alice" \
  --family "Smith" \
  --email "alice@example.com" \
  --phone "+1-555-0100"

# Update contact
gog contacts update people/<resourceName> \
  --notes "Met at conference 2025"

# Search workspace directory
gog contacts directory search "Engineering"
```

---

## Workflow 12: Google Chat Notifications (Workspace)

Send messages to Chat spaces.

```bash
# Find the target space
gog chat spaces list
gog chat spaces find "Engineering"

# Send a notification
gog chat messages send spaces/<spaceId> --text "Build #42 completed successfully"

# Reply in a thread
gog chat messages send spaces/<spaceId> \
  --text "Deploying to production..." \
  --thread spaces/<spaceId>/threads/<threadId>

# Send a DM
gog chat dm send colleague@company.com --text "Can you review PR #123?"
```

---

## Workflow 13: Gmail Automation

Set up filters and forwarding.

```bash
# Create a filter for newsletters
gog gmail filters create \
  --from 'newsletter@example.com' \
  --add-label 'Newsletters' \
  --skip-inbox

# Set up vacation responder
gog gmail vacation enable \
  --subject "Out of Office" \
  --message "I'm away until Jan 20. For urgent matters, contact team@company.com."

# Disable vacation responder on return
gog gmail vacation disable

# Set up email forwarding
gog gmail forwarding add --email backup@example.com
```

---

## Rate Limiting Guidelines

| Service | Recommended Delay |
|---------|-------------------|
| Gmail send | 1 second |
| Gmail batch operations | 2 seconds |
| Drive upload | 2 seconds |
| Sheets write | 1 second |
| Calendar create | 1 second |
| Contacts operations | 1 second |
| Batch / loop operations | 2-5 seconds |
