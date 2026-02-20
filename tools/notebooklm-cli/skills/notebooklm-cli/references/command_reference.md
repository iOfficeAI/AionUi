# NotebookLM CLI - Complete Command Reference

Complete command signatures and all available options for every `nlm` command.

---

## Global Options

```bash
nlm --version, -v         # Show version and exit
nlm --ai                  # Output AI-friendly documentation
nlm --install-completion  # Install shell completion
nlm --show-completion     # Show completion script
nlm --help                # Show help and exit
```

---

## Authentication

### nlm login

Authenticate with NotebookLM using Chrome DevTools Protocol.

```bash
nlm login [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Profile name for multiple accounts |
| `--check` | | Validate current credentials without re-authenticating |
| `--legacy` | `-l` | Use browser-cookie3 fallback (not recommended) |
| `--browser` | `-b` | Browser for legacy mode (chrome, firefox, edge) |
| `--manual` | `-m` | Import cookies from file |
| `--file` | `-f` | Cookie file path for manual mode |

### nlm auth status

```bash
nlm auth status [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Profile to check |

### nlm auth list

```bash
nlm auth list
```

### nlm auth delete

```bash
nlm auth delete <profile> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--confirm` | Required to confirm deletion |

---

## Notebook Commands

### nlm notebook list

```bash
nlm notebook list [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--json` | | Output as JSON |
| `--quiet` | `-q` | Output IDs only |
| `--title` | | Output as "ID: Title" |
| `--full` | | Show all columns |
| `--profile` | `-p` | Use specific profile |

### nlm notebook create

```bash
nlm notebook create <title> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm notebook get

```bash
nlm notebook get <notebook-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm notebook describe

Get AI-generated notebook summary with suggested topics.

```bash
nlm notebook describe <notebook-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm notebook query

```bash
nlm notebook query <notebook-id> <question> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--source-ids` | Limit to specific sources (comma-separated) |
| `--conversation-id` | Continue existing conversation |
| `--profile` | Use specific profile |

### nlm notebook rename

```bash
nlm notebook rename <notebook-id> <new-title> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm notebook delete

```bash
nlm notebook delete <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--confirm` | **Required** to confirm deletion |
| `--profile` | Use specific profile |

---

## Source Commands

### nlm source list

```bash
nlm source list <notebook-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--json` | | Output as JSON |
| `--quiet` | `-q` | Output IDs only |
| `--title` | | Output as "ID: Title" |
| `--url` | | Output as "ID: URL" |
| `--full` | | Show all columns |
| `--drive` | | Show Drive sources with freshness status |
| `--skip-freshness` | `-S` | Skip freshness checks (faster with --drive) |
| `--profile` | `-p` | Use specific profile |

### nlm source add

```bash
nlm source add <notebook-id> [OPTIONS]
```

**URL Source:**

| Option | Description |
|--------|-------------|
| `--url` | URL to add (web page or YouTube) |

**Text Source:**

| Option | Description |
|--------|-------------|
| `--text` | Text content to add |
| `--title` | Title for text source |

**Drive Source:**

| Option | Description |
|--------|-------------|
| `--drive` | Google Drive document ID |
| `--type` | Drive doc type: `doc`, `slides`, `sheets`, `pdf` |
| `--title` | Display title |

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm source get

```bash
nlm source get <source-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm source describe

Get AI-generated source summary with keywords.

```bash
nlm source describe <source-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm source content

Get raw text content of a source.

```bash
nlm source content <source-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--output` | `-o` | Export to file path |
| `--profile` | `-p` | Use specific profile |

### nlm source stale

List stale (outdated) Drive sources.

```bash
nlm source stale <notebook-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

### nlm source sync

Sync Drive sources with latest content.

```bash
nlm source sync <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--confirm` | **Required** to execute sync |
| `--source-ids` | Specific source IDs to sync (comma-separated) |
| `--profile` | Use specific profile |

### nlm source delete

```bash
nlm source delete <source-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--confirm` | **Required** to confirm deletion |
| `--profile` | Use specific profile |

---

## Research Commands

### nlm research start

Start a research task to discover new sources.

```bash
nlm research start <query> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--notebook-id` | **Required** — Target notebook ID |
| `--mode` | `fast` (default, ~30s) or `deep` (~5min, web only) |
| `--source` | `web` (default) or `drive` |
| `--force` | Override pending research |
| `--profile` | Use specific profile |

### nlm research status

```bash
nlm research status <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--task-id` | Check specific task (auto-detected if omitted) |
| `--max-wait` | Max seconds to wait (default: 300, 0=single check) |
| `--full` | Show full details |
| `--profile` | Use specific profile |

### nlm research import

```bash
nlm research import <notebook-id> <task-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--indices` | Comma-separated indices of sources to import (default: all) |
| `--profile` | Use specific profile |

---

## Generation Commands

All generation commands share these common options:

| Option | Short | Description |
|--------|-------|-------------|
| `--confirm` | `-y` | **Required** to execute generation |
| `--source-ids` | | Limit to specific sources (comma-separated) |
| `--language` | | BCP-47 language code (en, es, fr, de, ja) |
| `--profile` | `-p` | Use specific profile |

### nlm audio create

```bash
nlm audio create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `deep_dive`, `brief`, `critique`, `debate` | `deep_dive` |
| `--length` | `short`, `default`, `long` | `default` |
| `--focus` | Focus text/topic | |

### nlm report create

```bash
nlm report create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `"Briefing Doc"`, `"Study Guide"`, `"Blog Post"`, `"Create Your Own"` | `"Briefing Doc"` |
| `--prompt` | Custom prompt (required for "Create Your Own") | |

### nlm quiz create

```bash
nlm quiz create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--count` | Number of questions | 2 |
| `--difficulty` | 1-5 (1=easy, 5=hard) | 2 |

### nlm flashcards create

```bash
nlm flashcards create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--difficulty` | `easy`, `medium`, `hard` | `medium` |

### nlm mindmap create

```bash
nlm mindmap create <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--title` | Display title for the mind map |

### nlm mindmap list

```bash
nlm mindmap list <notebook-id> [OPTIONS]
```

### nlm slides create

```bash
nlm slides create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `detailed`, `presenter` | `detailed` |
| `--length` | `short`, `default` | `default` |
| `--focus` | Focus text/topic | |

### nlm infographic create

```bash
nlm infographic create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--orientation` | `landscape`, `portrait`, `square` | `landscape` |
| `--detail` | `concise`, `standard`, `detailed` | `standard` |
| `--focus` | Focus text/topic | |

### nlm video create

```bash
nlm video create <notebook-id> [OPTIONS]
```

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `explainer`, `brief` | `explainer` |
| `--style` | `auto_select`, `classic`, `whiteboard`, `kawaii`, `anime`, `watercolor`, `retro_print`, `heritage`, `paper_craft` | `auto_select` |
| `--focus` | Focus text/topic | |

### nlm data-table create

```bash
nlm data-table create <notebook-id> <description> [OPTIONS]
```

Note: `<description>` is a **required positional argument** describing what data to extract.

---

## Studio Commands

### nlm studio status

```bash
nlm studio status <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--full` | Show all details |
| `--profile` | Use specific profile |

### nlm studio delete

```bash
nlm studio delete <notebook-id> <artifact-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--confirm` | **Required** to confirm deletion |
| `--profile` | Use specific profile |

---

## Chat Commands

### nlm chat start

Start interactive chat REPL session.

```bash
nlm chat start <notebook-id> [OPTIONS]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--profile` | `-p` | Use specific profile |

REPL Commands: `/sources`, `/clear`, `/help`, `/exit`

**Note:** Prefer `nlm notebook query` for non-interactive usage.

### nlm chat configure

```bash
nlm chat configure <notebook-id> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--goal` | `default`, `learning_guide`, `custom` |
| `--prompt` | Custom system prompt (required when goal is `custom`) |
| `--response-length` | `default`, `longer`, `shorter` |
| `--profile` | Use specific profile |

---

## Alias Commands

### nlm alias set

```bash
nlm alias set <name> <uuid>
```

Type is auto-detected (notebook, source, artifact, task).

### nlm alias get

```bash
nlm alias get <name>
```

### nlm alias list

```bash
nlm alias list
```

### nlm alias delete

```bash
nlm alias delete <name>
```

---

## Config Commands

### nlm config show

```bash
nlm config show [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON instead of TOML |

### nlm config get

```bash
nlm config get <key>
```

### nlm config set

```bash
nlm config set <key> <value>
```
