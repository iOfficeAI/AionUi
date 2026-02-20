# NotebookLM CLI - Workflow Examples

End-to-end workflow sequences for common tasks with the `nlm` CLI.

---

## Critical Rule: Confirm Destructive Operations

Before executing ANY delete command, ALWAYS ask the user for explicit confirmation. Deletions are irreversible.

Commands requiring user confirmation before execution:
- `nlm notebook delete <id> --confirm`
- `nlm source delete <id> --confirm`
- `nlm studio delete <notebook-id> <artifact-id> --confirm`
- `nlm auth delete <profile> --confirm`

---

## Workflow 1: First-Time Setup

```bash
# Authenticate (opens Chrome)
nlm login

# Verify authentication
nlm login --check

# Create a notebook
nlm notebook create "My First Notebook"

# Set alias for convenience
nlm alias set first <notebook-id>

# Verify
nlm notebook get first
```

---

## Workflow 2: Content Ingestion

Add multiple sources to a notebook.

```bash
# Add web pages (throttle with sleep)
nlm source add <nb-id> --url "https://example.com/article1"
sleep 2
nlm source add <nb-id> --url "https://example.com/article2"
sleep 2

# Add YouTube video
nlm source add <nb-id> --url "https://youtube.com/watch?v=VIDEO_ID"
sleep 2

# Add text/notes
nlm source add <nb-id> --text "My observations about this topic..." --title "My Notes"
sleep 2

# Add Google Drive document
nlm source add <nb-id> --drive <doc-id> --type doc
sleep 2

# Verify all sources
nlm source list <nb-id>
```

---

## Workflow 3: Research to Podcast

Discover sources via research and generate a podcast.

```bash
# Create notebook
nlm notebook create "AI Trends Research"
nlm alias set research <notebook-id>

# Start deep research (~5 minutes)
nlm research start "agentic AI trends 2026" --notebook-id research --mode deep

# Monitor progress
nlm research status research --max-wait 300

# View discovered sources
nlm research status research --full

# Import all discovered sources
nlm research import research <task-id>

# Generate podcast
nlm audio create research --format deep_dive --length default -y

# Check generation status (2-5 minutes)
nlm studio status research
```

---

## Workflow 4: Study Materials

Generate comprehensive study materials from existing sources.

```bash
# Verify sources exist
nlm source list <nb-id>

# Generate study guide
nlm report create <nb-id> --format "Study Guide" -y
sleep 5

# Generate quiz (10 questions, medium difficulty)
nlm quiz create <nb-id> --count 10 --difficulty 3 -y
sleep 3

# Generate flashcards
nlm flashcards create <nb-id> --difficulty medium -y
sleep 3

# Generate mind map
nlm mindmap create <nb-id> --title "Topic Overview" -y

# Check all artifacts
nlm studio status <nb-id>
```

---

## Workflow 5: Quick Q&A

Ask questions about notebook sources.

```bash
# One-shot question
nlm notebook query <nb-id> "What are the main themes across these sources?"

# Follow-up (maintains context via conversation-id from previous output)
nlm notebook query <nb-id> "Can you elaborate on the first theme?" --conversation-id <conv-id>
```

---

## Workflow 6: Drive Document Sync

Keep Drive sources up-to-date.

```bash
# Check freshness status
nlm source list <nb-id> --drive

# Find stale sources
nlm source stale <nb-id>

# Sync all stale sources
nlm source sync <nb-id> --confirm

# Or sync specific sources
nlm source sync <nb-id> --source-ids <id1>,<id2> --confirm

# Verify
nlm source stale <nb-id>
```

---

## Workflow 7: Multi-Account Management

Work with multiple Google accounts.

```bash
# Login to different profiles
nlm login --profile work
nlm login --profile personal

# List profiles
nlm auth list

# Use specific profile
nlm notebook list --profile work
nlm notebook list --profile personal

# Create notebook in specific account
nlm notebook create "Work Project" --profile work
```

---

## Workflow 8: Content Export

Extract and export source content.

```bash
# Get AI summary
nlm source describe <source-id>

# Get raw text
nlm source content <source-id>

# Export to file
nlm source content <source-id> --output ./export/source_content.txt

# Batch export
for id in $(nlm source list <nb-id> --quiet); do
    nlm source content $id --output "./export/${id}.txt"
    sleep 1
done
```

---

## Workflow 9: Presentation Preparation

Generate presentation materials.

```bash
# Create focused notebook
nlm notebook create "Q4 Presentation Prep"
nlm alias set pres <notebook-id>

# Add sources
nlm source add pres --url "https://company.com/q4-results"
nlm source add pres --drive <slides-doc-id> --type slides
nlm source add pres --text "Key talking points: ..." --title "Talking Points"

# Generate slide deck
nlm slides create pres --format detailed -y
sleep 5

# Generate briefing doc
nlm report create pres --format "Briefing Doc" -y
sleep 5

# Generate infographic
nlm infographic create pres --orientation landscape --detail standard -y

# Check outputs
nlm studio status pres
```

---

## Workflow 10: Cleanup

```bash
# List notebooks
nlm notebook list

# Inspect before deletion
nlm notebook get <nb-id>
nlm source list <nb-id>
nlm studio status <nb-id>

# Delete artifact (ask user first!)
nlm studio delete <nb-id> <artifact-id> --confirm

# Delete source (ask user first!)
nlm source delete <source-id> --confirm

# Delete notebook (ask user first!)
nlm notebook delete <nb-id> --confirm

# Clean up aliases
nlm alias delete <alias-name>
```

---

## Rate Limiting Guidelines

| Operation Type | Recommended Delay |
|---------------|-------------------|
| Source additions | 2 seconds |
| Content generation | 5 seconds |
| Research operations | 2 seconds |
| Query operations | 2 seconds |
| Batch operations | 10 seconds |

Daily limit (free tier): ~50 operations/day.
