# Google Suite CLI (gog) - Complete Command Reference

Full command signatures and options for every `gog` command group.

---

## Global Flags (available on all commands)

| Flag | Description |
|------|-------------|
| `--account <email\|alias>` | Select Google account |
| `--client <name>` | Select OAuth client |
| `--json` | JSON output to stdout |
| `--plain` | TSV output to stdout |
| `--color <mode>` | Color control (auto\|always\|never) |
| `--force` | Skip confirmation prompts |
| `--no-input` | Non-interactive mode |
| `--verbose` | Enable verbose logging |
| `--help` | Show command help |

---

## Authentication (gog auth)

### Credentials
```bash
gog auth credentials <path>                # Store OAuth client JSON
gog auth credentials list                  # List stored OAuth clients
gog --client work auth credentials <path>  # Store named client
```

### Account Authorization
```bash
gog auth add <email>                       # Authorize (opens browser)
gog auth add <email> --services user       # Request user-level scopes
gog auth add <email> --manual              # Headless manual flow
gog auth add <email> --remote --step 1     # Remote split flow (step 1)
gog auth add <email> --remote --step 2 --auth-url <url>  # Step 2
gog auth add <email> --readonly            # Read-only scopes
gog auth add <email> --drive-scope file    # File-only Drive scope
gog auth add <email> --force-consent       # Force re-authorization
```

### Account Management
```bash
gog auth list                              # List accounts
gog auth list --check                      # Validate refresh tokens
gog auth status                            # Show current auth state
gog auth services                          # List available services/scopes
gog auth remove <email>                    # Delete stored token
gog auth manage                            # Open accounts in browser
gog auth tokens                            # Manage stored tokens
```

### Service Accounts (Workspace only)
```bash
gog auth service-account set <email> --key <path>    # Configure delegation
gog auth service-account status <email>               # Show status
gog auth service-account unset <email>                # Remove configuration
```

### Keyring & Aliases
```bash
gog auth keyring                           # Show current backend
gog auth keyring <backend>                 # Set backend (auto|keychain|file)
gog auth alias set <alias> <email>         # Create alias
gog auth alias list                        # List aliases
gog auth alias unset <alias>               # Remove alias
```

---

## Gmail (gog gmail)

### Search & Read
```bash
gog gmail search '<query>' --max <n>                          # Search threads
gog gmail messages search '<query>' --max <n>                 # Search messages
gog gmail messages search '<query>' --include-body --json     # With body content
gog gmail get <messageId>                                     # Get message
gog gmail get <messageId> --format metadata                   # Metadata only
gog gmail thread get <threadId>                               # Get thread
gog gmail thread get <threadId> --download                    # Download attachments
gog gmail thread get <threadId> --download --out-dir ./path   # To directory
gog gmail attachment <messageId> <attachmentId>               # Get attachment
gog gmail attachment <messageId> <attachmentId> --out ./file  # Save attachment
gog gmail url <threadId>                                      # Gmail web URL
gog gmail thread modify <threadId> --add STARRED --remove INBOX  # Modify labels
```

### Send & Reply
```bash
gog gmail send --to <email> --subject "Hi" --body "Text"
gog gmail send --to <email> --subject "Hi" --body-file ./msg.txt
gog gmail send --to <email> --subject "Hi" --body-file -     # stdin
gog gmail send --to <email> --subject "Hi" --body "Plain" --body-html "<p>HTML</p>"
gog gmail send --reply-to-message-id <id> --quote --to <email> --subject "Re: Hi" --body "Reply"
gog gmail send --to <email> --subject "Hi" --body-html "<p>...</p>" --track  # With tracking
```

### Drafts
```bash
gog gmail drafts list
gog gmail drafts create --subject "Draft" --body "Body"
gog gmail drafts create --to <email> --subject "Draft" --body "Body"
gog gmail drafts update <draftId> --subject "Updated" --body "New body"
gog gmail drafts send <draftId>
```

### Labels
```bash
gog gmail labels list
gog gmail labels get INBOX --json
gog gmail labels create "<name>"
gog gmail labels modify <threadId> --add STARRED --remove INBOX
gog gmail labels delete <labelIdOrName>
```

### Batch Operations
```bash
gog gmail batch delete <msgId1> <msgId2>
gog gmail batch modify <msgId1> <msgId2> --add STARRED --remove INBOX
```

### Filters
```bash
gog gmail filters list
gog gmail filters create --from '<addr>' --add-label '<label>'
gog gmail filters delete <filterId>
```

### Settings
```bash
gog gmail autoforward get
gog gmail autoforward enable --email <forward@example.com>
gog gmail autoforward disable
gog gmail forwarding list
gog gmail forwarding add --email <email>
gog gmail sendas list
gog gmail sendas create --email <alias@example.com>
gog gmail vacation get
gog gmail vacation enable --subject "Out" --message "..."
gog gmail vacation disable
```

### Delegation (Workspace)
```bash
gog gmail delegates list
gog gmail delegates add --email <delegate@example.com>
gog gmail delegates remove --email <delegate@example.com>
```

### Watch (Pub/Sub)
```bash
gog gmail watch start --topic <pubsub-topic> --label INBOX
gog gmail watch serve --bind 127.0.0.1 --token <shared> --hook-url <url>
gog gmail history --since <historyId>
```

### Email Tracking
```bash
gog gmail track setup --worker-url <url>
gog gmail track opens <tracking_id>
gog gmail track opens --to <email>
gog gmail track status
```

---

## Calendar (gog calendar)

### List & Search
```bash
gog calendar calendars
gog calendar events <calId> --today
gog calendar events <calId> --tomorrow
gog calendar events <calId> --week
gog calendar events <calId> --days <n>
gog calendar events <calId> --from <date> --to <date>
gog calendar events <calId> --from today --to friday --weekday
gog calendar events --all
gog calendar events --calendars 1,3
gog calendar events --cal Work --cal Personal
gog calendar search "<query>" --today
gog calendar search "<query>" --days 365
gog calendar search "<query>" --from <start> --to <end> --max 50
```

### Team & Availability
```bash
gog calendar team <group-email> --today
gog calendar team <group-email> --week
gog calendar team <group-email> --freebusy
gog calendar team <group-email> --query "<filter>"
gog calendar freebusy --calendars "<ids>" --from <start> --to <end>
gog calendar conflicts --calendars "<ids>" --today
```

### Create Events
```bash
gog calendar create <calId> --summary "<title>" --from <start> --to <end>
gog calendar create <calId> --summary "<title>" --from <start> --to <end> --attendees "<emails>" --location "<loc>"
gog calendar create <calId> --summary "<title>" --from <start> --to <end> --send-updates all
gog calendar create <calId> --summary "<title>" --from <start> --to <end> --rrule "RRULE:FREQ=WEEKLY" --reminder "email:3d" --reminder "popup:30m"
```

### Special Event Types
```bash
gog calendar create primary --event-type focus-time --from <start> --to <end>
gog calendar create primary --event-type out-of-office --from <date> --to <date> --all-day
gog calendar create primary --event-type working-location --working-location-type office --working-office-label "HQ" --from <date> --to <date>
gog calendar focus-time --from <start> --to <end>
gog calendar out-of-office --from <date> --to <date> --all-day
gog calendar working-location --type office --office-label "HQ" --from <date> --to <date>
```

### Update & Delete
```bash
gog calendar update <calId> <eventId> --summary "<title>" --from <start> --to <end>
gog calendar update <calId> <eventId> --add-attendee "<emails>"
gog calendar update <calId> <eventId> --send-updates externalOnly
gog calendar delete <calId> <eventId>
gog calendar delete <calId> <eventId> --send-updates all --force
```

### Respond to Invitations
```bash
gog calendar respond <calId> <eventId> --status accepted
gog calendar respond <calId> <eventId> --status declined
gog calendar respond <calId> <eventId> --status tentative
gog calendar propose-time <calId> <eventId>
gog calendar propose-time <calId> <eventId> --decline --comment "Can we do 5pm?"
```

### Other
```bash
gog calendar acl <calendarId>
gog calendar colors
gog calendar users
```

---

## Drive (gog drive)

### List & Search
```bash
gog drive ls --max 20
gog drive ls --parent <folderId> --max 20
gog drive ls --no-all-drives
gog drive search "<query>" --max 20
gog drive search "<query>" --no-all-drives
gog drive search "mimeType = 'application/pdf'" --raw-query
gog drive get <fileId>
gog drive url <fileId>
gog drive drives --max 100
```

### Upload & Download
```bash
gog drive upload ./file --parent <folderId>
gog drive upload ./file --replace <fileId>
gog drive upload ./file --convert
gog drive upload ./file --convert-to sheet
gog drive upload ./file --convert --name <name>
gog drive download <fileId> --out ./file
gog drive download <fileId> --format pdf --out ./file
gog drive download <fileId> --format docx --out ./file
gog drive download <fileId> --format pptx --out ./file
```

### Organization
```bash
gog drive mkdir "<name>"
gog drive mkdir "<name>" --parent <parentId>
gog drive copy <fileId> "<name>"
gog drive rename <fileId> "<name>"
gog drive move <fileId> --parent <destId>
gog drive delete <fileId>
gog drive delete <fileId> --permanent
```

### Permissions
```bash
gog drive permissions <fileId>
gog drive share <fileId> --to user --email <email> --role reader
gog drive share <fileId> --to user --email <email> --role writer
gog drive share <fileId> --to domain --domain <domain> --role reader
gog drive unshare <fileId> --permission-id <permissionId>
```

---

## Sheets (gog sheets)

```bash
gog sheets metadata <spreadsheetId>
gog sheets get <spreadsheetId> 'Sheet1!A1:B10'
gog sheets notes <spreadsheetId> 'Sheet1!A1:B10'
gog sheets update <spreadsheetId> 'A1' 'val1|val2,val3|val4'
gog sheets update <spreadsheetId> 'A1' --values-json '[["a","b"],["c","d"]]'
gog sheets update <spreadsheetId> 'Sheet1!A1:C1' 'data' --copy-validation-from 'Sheet1!A2:C2'
gog sheets append <spreadsheetId> 'Sheet1!A:C' 'new|row|data'
gog sheets append <spreadsheetId> 'Sheet1!A:C' 'data' --copy-validation-from 'Sheet1!A2:C2'
gog sheets clear <spreadsheetId> 'Sheet1!A1:B10'
gog sheets format <spreadsheetId> 'Sheet1!A1:B2' --format-json '{"textFormat":{"bold":true}}' --format-fields 'userEnteredFormat.textFormat.bold'
gog sheets insert <spreadsheetId> "Sheet1" rows 2 --count 3
gog sheets insert <spreadsheetId> "Sheet1" cols 3 --after
gog sheets create "<name>" --sheets "Sheet1,Sheet2"
gog sheets export <spreadsheetId> --format pdf --out ./file
gog sheets export <spreadsheetId> --format xlsx --out ./file
gog sheets copy <spreadsheetId> "<name>"
```

---

## Docs (gog docs)

```bash
gog docs info <docId>
gog docs cat <docId>
gog docs cat <docId> --max-bytes 10000
gog docs cat <docId> --tab "Notes"
gog docs cat <docId> --all-tabs
gog docs list-tabs <docId>
gog docs create "<title>"
gog docs create "<title>" --file ./doc.md
gog docs copy <docId> "<name>"
gog docs export <docId> --format pdf --out ./file
gog docs export <docId> --format docx --out ./file
gog docs export <docId> --format txt --out ./file
gog docs update <docId> --format markdown --content-file ./doc.md
gog docs write <docId> --replace --markdown --file ./doc.md
gog docs find-replace <docId> "old" "new"
```

---

## Slides (gog slides)

```bash
gog slides info <presentationId>
gog slides create "<title>"
gog slides create-from-markdown "<title>" --content-file ./slides.md
gog slides copy <presentationId> "<name>"
gog slides export <presentationId> --format pdf --out ./file
gog slides export <presentationId> --format pptx --out ./file
gog slides list-slides <presentationId>
gog slides add-slide <presentationId> ./img.png --notes "Speaker notes"
gog slides update-notes <presentationId> <slideId> --notes "Updated notes"
gog slides replace-slide <presentationId> <slideId> ./new.png --notes "Notes"
```

---

## Tasks (gog tasks)

```bash
gog tasks lists --max 50
gog tasks lists create "<title>"
gog tasks list <tasklistId> --max 50
gog tasks get <tasklistId> <taskId>
gog tasks add <tasklistId> --title "<title>"
gog tasks add <tasklistId> --title "<title>" --due 2025-02-01 --repeat weekly --repeat-count 4
gog tasks add <tasklistId> --title "<title>" --due 2025-02-01 --repeat daily --repeat-until 2025-02-05
gog tasks update <tasklistId> <taskId> --title "<new title>"
gog tasks done <tasklistId> <taskId>
gog tasks undo <tasklistId> <taskId>
gog tasks delete <tasklistId> <taskId>
gog tasks clear <tasklistId>
```

---

## Contacts (gog contacts)

```bash
gog contacts list --max 50
gog contacts search "<query>" --max 50
gog contacts get people/<resourceName>
gog contacts get <email>
gog contacts create --given "<first>" --family "<last>" --email "<email>" --phone "<phone>"
gog contacts update people/<resourceName> --given "<first>" --email "<email>" --birthday "1990-05-12" --notes "Note"
gog contacts delete people/<resourceName>
gog contacts other list --max 50
gog contacts other search "<query>"
gog contacts directory list --max 50
gog contacts directory search "<query>"
```

---

## Chat (gog chat) — Workspace only

```bash
gog chat spaces list
gog chat spaces find "<name>"
gog chat spaces create "<name>" --member <email1> --member <email2>
gog chat messages list spaces/<spaceId> --max 5
gog chat messages list spaces/<spaceId> --thread <threadId>
gog chat messages list spaces/<spaceId> --unread
gog chat messages send spaces/<spaceId> --text "<msg>"
gog chat messages send spaces/<spaceId> --text "<msg>" --thread spaces/<spaceId>/threads/<threadId>
gog chat threads list spaces/<spaceId>
gog chat dm space <email>
gog chat dm send <email> --text "<msg>"
```

---

## Classroom (gog classroom) — Workspace for Education

```bash
gog classroom courses list
gog classroom courses list --role teacher
gog classroom courses get <courseId>
gog classroom courses create --name "<name>"
gog classroom courses update <courseId> --name "<name>"
gog classroom courses archive <courseId>
gog classroom courses url <courseId>
gog classroom roster <courseId>
gog classroom roster <courseId> --students
gog classroom students add <courseId> <userId>
gog classroom teachers add <courseId> <userId>
gog classroom coursework list <courseId>
gog classroom coursework get <courseId> <cwId>
gog classroom coursework create <courseId> --title "<title>" --type ASSIGNMENT --state PUBLISHED
gog classroom submissions list <courseId> <cwId>
gog classroom submissions grade <courseId> <cwId> <subId> --grade 85
gog classroom submissions return <courseId> <cwId> <subId>
gog classroom announcements list <courseId>
gog classroom announcements create <courseId> --text "Welcome!"
gog classroom topics list <courseId>
gog classroom topics create <courseId> --name "Unit 1"
gog classroom invitations list
gog classroom invitations create <courseId> <userId> --role student
```

---

## Forms (gog forms)

```bash
gog forms get <formId>
gog forms create --title "<title>" --description "<desc>"
gog forms responses list <formId> --max 20
gog forms responses get <formId> <responseId>
```

---

## Apps Script (gog appscript)

```bash
gog appscript get <scriptId>
gog appscript content <scriptId>
gog appscript create --title "<title>"
gog appscript create --title "<title>" --parent-id <driveFileId>
gog appscript run <scriptId> <function> --params '["arg1", 123, true]'
gog appscript run <scriptId> <function> --dev-mode
```

---

## People (gog people)

```bash
gog people me
gog people get people/<userId>
gog people search "<query>" --max 5
gog people relations
gog people relations people/<userId> --type manager
```

---

## Groups (gog groups) — Workspace only

```bash
gog groups list
gog groups members <group-email>
```

---

## Keep (gog keep) — Workspace only

```bash
gog keep list --account <email>
gog keep get <noteId> --account <email>
gog keep search "<query>" --account <email>
gog keep attachment <attachmentName> --account <email> --out ./file
```

---

## Config (gog config)

```bash
gog config path
gog config list
gog config keys
gog config get <key>
gog config set <key> <value>
gog config unset <key>
```

---

## Time (gog time)

```bash
gog time now
gog time now --timezone UTC
```

---

## Shell Completions

```bash
gog completion bash > /path/to/bash_completion
gog completion zsh > /path/to/zsh_completion
gog completion fish > /path/to/fish_completion
gog completion powershell
```
