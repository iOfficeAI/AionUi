---
name: gogcli
description: |
  CLI for Google Suite services (Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Contacts,
  Chat, Classroom, Forms, Apps Script, Keep, Groups, People).
  Use when: sending/searching email, managing calendar events, uploading/downloading Drive files,
  reading/writing spreadsheets, creating documents/slides, managing tasks, searching contacts,
  or automating any Google Workspace workflow from the command line.
---

# Google Suite CLI (gog)

## Instructions
Use the `gog` command to interact with Google Suite services. Supports Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Contacts, Chat, Classroom, Forms, Apps Script, Keep, Groups, and People.

## Critical Rules
1. Always verify authentication first: `gog auth status`
2. If not authenticated, run `gog auth add <email>` (opens browser)
3. Use `--json` for programmatic output parsing
4. Use `--force` to skip confirmations on destructive operations (only when user has confirmed)
5. Always ask user before executing delete, permanent-delete, or batch-delete commands
6. Respect rate limits — add delays between batch operations
7. Use `--account <email>` when working with multiple Google accounts
8. Never run `gog auth remove` without user confirmation
9. Calendar times must be in RFC 3339 format or use relative shortcuts (--today, --tomorrow, --week)

USAGE
  gog <service> <command> [args] [flags]

GLOBAL FLAGS
  --account <email|alias>    Select Google account
  --json                     JSON output
  --plain                    TSV output
  --force                    Skip confirmations
  --no-input                 Non-interactive mode
  --verbose                  Verbose logging
  --client <name>            Select OAuth client

AUTHENTICATION
  gog auth add <email>                     # Authorize account (opens browser)
  gog auth add <email> --manual            # Headless manual flow
  gog auth list                            # List stored accounts
  gog auth list --check                    # Validate tokens
  gog auth status                          # Show current auth state
  gog auth services                        # List available services/scopes
  gog auth remove <email>                  # Remove stored token
  gog auth credentials <path>              # Store OAuth client JSON
  gog auth keyring [backend]               # Show/set keyring (auto|keychain|file)
  gog auth alias set <alias> <email>       # Create account alias
  gog auth alias list                      # List aliases

GMAIL
  gog gmail search '<query>' --max <n>                  # Search threads
  gog gmail messages search '<query>' --max <n>         # Search messages
  gog gmail messages search '<query>' --include-body    # Include message body
  gog gmail get <messageId>                             # Get message details
  gog gmail thread get <threadId>                       # Get full thread
  gog gmail thread get <threadId> --download            # Download attachments
  gog gmail send --to <email> --subject "Hi" --body "Text"  # Send email
  gog gmail send --to <email> --subject "Hi" --body-file ./msg.txt  # Send from file
  gog gmail send --reply-to-message-id <id> --quote --to <email> --subject "Re: Hi" --body "Reply"
  gog gmail drafts list                                 # List drafts
  gog gmail drafts create --subject "Draft" --body "Body"  # Create draft
  gog gmail drafts send <draftId>                       # Send draft
  gog gmail labels list                                 # List labels
  gog gmail labels create "<name>"                      # Create label
  gog gmail thread modify <threadId> --add STARRED --remove INBOX  # Modify labels
  gog gmail filters list                                # List filters
  gog gmail filters create --from '<addr>' --add-label '<label>'  # Create filter
  gog gmail vacation get                                # Show vacation responder
  gog gmail vacation enable --subject "Out" --message "..."  # Enable vacation

CALENDAR
  gog calendar calendars                                # List calendars
  gog calendar events <calId> --today                   # Today's events
  gog calendar events <calId> --tomorrow                # Tomorrow's events
  gog calendar events <calId> --week                    # This week
  gog calendar events <calId> --days <n>                # Next N days
  gog calendar events <calId> --from <date> --to <date> # Date range
  gog calendar events --all                             # All calendars
  gog calendar search "<query>" --today                 # Search events
  gog calendar create <calId> --summary "<title>" --from <start> --to <end>  # Create event
  gog calendar create <calId> --summary "<title>" --from <start> --to <end> --attendees "<emails>"
  gog calendar update <calId> <eventId> --summary "<title>"  # Update event
  gog calendar delete <calId> <eventId>                 # Delete event
  gog calendar respond <calId> <eventId> --status accepted|declined|tentative
  gog calendar freebusy --calendars "<ids>" --from <start> --to <end>  # Check availability
  gog calendar conflicts --calendars "<ids>" --today    # Find conflicts
  gog calendar team <group-email> --today               # Team schedule

DRIVE
  gog drive ls --max 20                                 # List My Drive
  gog drive ls --parent <folderId>                      # List folder
  gog drive search "<query>" --max 20                   # Search files
  gog drive get <fileId>                                # File metadata
  gog drive upload ./file --parent <folderId>           # Upload file
  gog drive upload ./file --replace <fileId>            # Replace file
  gog drive upload ./file --convert                     # Convert to Google format
  gog drive download <fileId> --out ./file              # Download file
  gog drive download <fileId> --format pdf --out ./file # Export as PDF
  gog drive mkdir "<name>"                              # Create folder
  gog drive rename <fileId> "<name>"                    # Rename file
  gog drive move <fileId> --parent <folderId>           # Move file
  gog drive delete <fileId>                             # Trash file
  gog drive delete <fileId> --permanent                 # Permanent delete
  gog drive share <fileId> --to user --email <email> --role reader|writer
  gog drive permissions <fileId>                        # List permissions

SHEETS
  gog sheets metadata <spreadsheetId>                   # Spreadsheet metadata
  gog sheets get <spreadsheetId> 'Sheet1!A1:B10'        # Read range
  gog sheets update <spreadsheetId> 'A1' 'val1|val2,val3|val4'  # Write cells
  gog sheets update <spreadsheetId> 'A1' --values-json '[["a","b"]]'  # Write JSON
  gog sheets append <spreadsheetId> 'Sheet1!A:C' 'new|row|data'  # Append row
  gog sheets clear <spreadsheetId> 'Sheet1!A1:B10'     # Clear range
  gog sheets create "<name>" --sheets "Sheet1,Sheet2"   # Create spreadsheet
  gog sheets export <spreadsheetId> --format xlsx --out ./file  # Export

DOCS
  gog docs info <docId>                                 # Document metadata
  gog docs cat <docId>                                  # Display content
  gog docs create "<title>"                             # Create document
  gog docs create "<title>" --file ./doc.md             # Create from markdown
  gog docs export <docId> --format pdf --out ./file     # Export to PDF
  gog docs write <docId> --replace --markdown --file ./doc.md  # Replace content
  gog docs find-replace <docId> "old" "new"             # Find and replace

SLIDES
  gog slides info <presentationId>                      # Presentation metadata
  gog slides create "<title>"                           # Create presentation
  gog slides create-from-markdown "<title>" --content-file ./slides.md
  gog slides export <presentationId> --format pdf --out ./file
  gog slides list-slides <presentationId>               # List slides
  gog slides add-slide <presentationId> ./img.png --notes "Notes"

TASKS
  gog tasks lists                                       # List task lists
  gog tasks lists create "<title>"                      # Create task list
  gog tasks list <tasklistId>                           # List tasks
  gog tasks add <tasklistId> --title "<title>"          # Add task
  gog tasks add <tasklistId> --title "<title>" --due 2025-02-01 --repeat weekly
  gog tasks done <tasklistId> <taskId>                  # Mark complete
  gog tasks undo <tasklistId> <taskId>                  # Unmark complete
  gog tasks update <tasklistId> <taskId> --title "<title>"  # Update task
  gog tasks delete <tasklistId> <taskId>                # Delete task

CONTACTS
  gog contacts list --max 50                            # List contacts
  gog contacts search "<query>"                         # Search contacts
  gog contacts get <email>                              # Get by email
  gog contacts create --given "<first>" --family "<last>" --email "<email>"
  gog contacts update <resourceName> --given "<first>" --email "<email>"
  gog contacts directory list                           # Workspace directory
  gog contacts directory search "<query>"               # Search directory

CHAT (Workspace only)
  gog chat spaces list                                  # List spaces
  gog chat spaces find "<name>"                         # Find space
  gog chat messages list spaces/<id> --max 5            # List messages
  gog chat messages send spaces/<id> --text "<msg>"     # Send message
  gog chat dm send <email> --text "<msg>"               # Send DM

FORMS
  gog forms get <formId>                                # Get form
  gog forms create --title "<title>"                    # Create form
  gog forms responses list <formId>                     # List responses

CLASSROOM
  gog classroom courses list                            # List courses
  gog classroom courses create --name "<name>"          # Create course
  gog classroom roster <courseId>                        # List roster
  gog classroom coursework list <courseId>               # List coursework
  gog classroom submissions list <courseId> <cwId>       # List submissions
  gog classroom submissions grade <courseId> <cwId> <subId> --grade 85

APPS SCRIPT
  gog appscript get <scriptId>                          # Get project
  gog appscript run <scriptId> <function> --params '[...]'  # Run function

PEOPLE
  gog people me                                         # Current user profile
  gog people search "<query>"                           # Search directory

GROUPS (Workspace only)
  gog groups list                                       # List groups
  gog groups members <group-email>                      # List members

KEEP (Workspace only)
  gog keep list                                         # List notes
  gog keep get <noteId>                                 # Get note
  gog keep search "<query>"                             # Search notes

CONFIG
  gog config path                                       # Show config path
  gog config list                                       # List all settings
  gog config get <key>                                  # Get setting
  gog config set <key> <value>                          # Set setting

OUTPUT FORMATS
  --json       Structured JSON output
  --plain      TSV output (pipe-friendly)
  (default)    Human-readable table format

ENVIRONMENT VARIABLES
  GOG_ACCOUNT              Default account email/alias
  GOG_JSON                 Default JSON output (true/false)
  GOG_PLAIN                Default plain output (true/false)
  GOG_TIMEZONE             Output timezone (IANA format)
  GOG_COLOR                Color mode (auto|always|never)
  GOG_KEYRING_BACKEND      Keyring backend (auto|keychain|file)
  GOG_KEYRING_PASSWORD     Password for file-based keyring

LEARN MORE
  gog <service> --help          Service-level help
  gog <service> <cmd> --help    Command-level help
  GOG_HELP=full gog --help      Expanded command listing
