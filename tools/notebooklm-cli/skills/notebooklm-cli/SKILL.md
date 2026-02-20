---
name: notebooklm-cli
description: |
  Expert guide for the NotebookLM CLI (nlm) — a command-line interface for Google NotebookLM.
  Use when: managing notebooks, adding sources (URLs, YouTube, text, Google Drive), generating
  content (podcasts, reports, quizzes, flashcards, mind maps, slides, infographics, videos,
  data tables), conducting research, or chatting with notebook sources.
  Triggers on: "nlm", "notebooklm", "notebook lm", "podcast generation", "audio overview",
  or any NotebookLM-related automation task.
---

# NotebookLM CLI

## Instructions
Use the `nlm` command to interact with Google NotebookLM programmatically. This CLI provides full access to notebook management, source handling, AI-powered content generation, research, and chat.

## Critical Rules
1. Always verify authentication first: `nlm login --check || nlm login`
2. Sessions expire after ~20 minutes — re-authenticate when encountering auth errors
3. Use `--confirm` or `-y` for ALL generation and delete commands
4. NEVER launch the interactive REPL (`nlm chat start` without `--query`)
5. Add `sleep 2` between consecutive source additions to avoid rate limits
6. Always ask the user for explicit confirmation before running any delete command
7. Use `--json` output flag when parsing results programmatically
8. Use aliases (`nlm alias set`) for frequently-used notebook IDs
9. Notebook queries require at least one source in the notebook

USAGE
  nlm <resource> <action> [id] [options]

AUTHENTICATION
  nlm login                          # Authenticate via Chrome (session ~20 min)
  nlm login --check                  # Validate current session
  nlm login --profile <name>         # Login with named profile
  nlm auth status                    # Check authentication status
  nlm auth list                      # List all profiles
  nlm auth delete <profile> --confirm  # Delete a profile

NOTEBOOK MANAGEMENT
  nlm notebook list [--json]         # List all notebooks
  nlm notebook create "<title>"      # Create new notebook
  nlm notebook get <id>              # Get notebook details
  nlm notebook describe <id>         # AI-generated notebook summary
  nlm notebook query <id> "<question>"  # Ask a question about sources
  nlm notebook rename <id> "<title>" # Rename a notebook
  nlm notebook delete <id> --confirm # Delete notebook permanently

SOURCE MANAGEMENT
  nlm source list <nb-id> [--json]   # List sources in notebook
  nlm source add <nb-id> --url "<url>"             # Add web page or YouTube
  nlm source add <nb-id> --text "<content>" --title "<title>"  # Add text
  nlm source add <nb-id> --drive <doc-id> --type doc|slides|sheets|pdf  # Add Drive doc
  nlm source get <src-id>            # Get source metadata
  nlm source describe <src-id>       # AI-generated source summary
  nlm source content <src-id>        # Get raw text content
  nlm source content <src-id> -o file.txt  # Export to file
  nlm source stale <nb-id>           # List outdated Drive sources
  nlm source sync <nb-id> --confirm  # Sync all stale Drive sources
  nlm source delete <src-id> --confirm  # Delete source permanently

RESEARCH
  nlm research start "<query>" --notebook-id <id>             # Start research (fast, ~30s)
  nlm research start "<query>" --notebook-id <id> --mode deep # Deep research (~5 min)
  nlm research status <nb-id>                    # Poll until complete (max 300s)
  nlm research status <nb-id> --max-wait 0       # Single status check
  nlm research import <nb-id> <task-id>          # Import all discovered sources
  nlm research import <nb-id> <task-id> --indices 0,2,5  # Import specific sources

CONTENT GENERATION (all require -y or --confirm)
  nlm audio create <nb-id> -y                    # Generate podcast (deep_dive)
  nlm audio create <nb-id> -y --format brief|critique|debate --length short|default|long
  nlm report create <nb-id> -y                   # Generate briefing doc
  nlm report create <nb-id> -y --format "Study Guide"|"Blog Post"|"Create Your Own"
  nlm quiz create <nb-id> -y --count 10 --difficulty 3     # Generate quiz (1-5 scale)
  nlm flashcards create <nb-id> -y --difficulty easy|medium|hard
  nlm mindmap create <nb-id> -y --title "<title>"
  nlm slides create <nb-id> -y --format detailed|presenter --length short|default
  nlm infographic create <nb-id> -y --orientation landscape|portrait|square --detail concise|standard|detailed
  nlm video create <nb-id> -y --format explainer|brief --style auto_select|classic|whiteboard|kawaii|anime|watercolor
  nlm data-table create <nb-id> "<description>" -y   # Extract structured data

  Common generation options:
    --source-ids <id1>,<id2>   Limit to specific sources
    --language <code>          BCP-47 language (en, es, fr, de, ja)
    --focus "<topic>"          Focus on specific topic (audio, slides, infographic, video)

STUDIO (generated artifacts)
  nlm studio status <nb-id> [--json]            # List all generated artifacts
  nlm studio delete <nb-id> <artifact-id> --confirm  # Delete artifact

CHAT
  nlm notebook query <nb-id> "<question>"       # One-shot question (preferred)
  nlm notebook query <nb-id> "<question>" --conversation-id <id>  # Follow-up
  nlm chat configure <nb-id> --goal default|learning_guide|custom
  nlm chat configure <nb-id> --goal custom --prompt "<prompt>"
  nlm chat configure <nb-id> --response-length default|longer|shorter

ALIASES
  nlm alias set <name> <uuid>   # Create alias for notebook/source ID
  nlm alias get <name>          # Resolve alias to UUID
  nlm alias list                # List all aliases
  nlm alias delete <name>       # Delete alias

CONFIGURATION
  nlm config show [--json]      # Display current config
  nlm config get <key>          # Get specific value
  nlm config set <key> <value>  # Set value

OUTPUT FORMATS
  --json       Structured JSON output
  --quiet, -q  IDs only (for scripting)
  --title      "ID: Title" format
  --url        "ID: URL" format
  --full       All columns

COMMON PATTERNS

  # Research-to-Podcast
  $ nlm notebook create "Topic Research"
  $ nlm source add <id> --url "https://example.com/article"
  $ sleep 2
  $ nlm research start "topic" --notebook-id <id> --mode deep
  $ nlm research status <id> --max-wait 300
  $ nlm research import <id> <task-id>
  $ nlm audio create <id> --format deep_dive -y

  # Quick Q&A
  $ nlm notebook query <id> "What are the main themes?"
  $ nlm notebook query <id> "Elaborate on theme 1" --conversation-id <conv-id>

  # Study Materials
  $ nlm report create <id> --format "Study Guide" -y
  $ nlm quiz create <id> --count 10 --difficulty 3 -y
  $ nlm flashcards create <id> --difficulty medium -y

  # Drive Sync
  $ nlm source stale <id>
  $ nlm source sync <id> --confirm

ERROR RECOVERY
  Session expired        → nlm login
  Notebook not found     → nlm notebook list
  Source not found       → nlm source list <nb-id>
  Research in progress   → nlm research status <nb-id> or --force
  Rate limit exceeded    → Wait 30s, add sleep between operations
  Network blocked        → Check internet; sandbox users need network_access=true

RATE LIMITING
  Source additions:      2 seconds between operations
  Content generation:    5 seconds between operations
  Research operations:   2 seconds between operations
  Query operations:      2 seconds between operations
  Daily limit (free):    ~50 operations/day

LEARN MORE
  Use `nlm <command> --help` for detailed command help
  Use `nlm --ai` for full AI-friendly documentation
