---
name: library-manager
description: Manage and save items to the AionUi Library. Use this skill when the user asks to save a dashboard, web page, mockups, code files, or any other creations, or when asked to organize, rename, list, move, or delete items in the library.
---

# Library Manager

Exposes a Python CLI script `library.py` to manage items in the AionUi library database. 

## Strategy & Usage

When the user asks you to **save a creation**, **register a link**, or **organize/move/delete** folders or items, you can use this utility script.

### Location of the script

The script is available at:
`src/process/resources/skills/_builtin/library-manager/scripts/library.py`
(Or in packaged environments, under the active skill directory path).

### 1. List library items

```bash
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py list
```
Returns a JSON array of all library items including their IDs, file types, parent relationships, etc.

### 2. Save/Add an item to the Library

Use this command when the user requests to save a created web page, dashboard, mockups, or note.
Specify `--type` corresponding to the content:
- For web pages/dashboards: Use `--type web` with `--path "http://..."` or local preview file path.
- For text/notes/guides: Use `--type markdown` and pass `--content "# Title\n..."`.
- Specify `--name` for the item title.

```bash
# Save a web mockup URL/file
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py add --name "Modern Dashboard Layout" --type web --path "http://localhost:3000/dashboard"

# Save a markdown document
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py add --name "Project Architecture" --type markdown --content "# System Architecture\n\n- React Frontend\n- Node Backend"
```

### 3. Organize or Update items (nesting, renaming, favorites)

- Move an item inside a parent page (create subpage relationship): Pass `--parent <parent_id>`.
- Remove from parent: Pass `--parent null`.
- Rename: Pass `--name "New Name"`.

```bash
# Move child page under parent page
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py update --id "library_17000000000" --parent "library_17800000000"

# Rename page
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py update --id "library_17000000000" --name "Updated Title"
```

### 4. Delete an item

```bash
python3 src/process/resources/skills/_builtin/library-manager/scripts/library.py delete --id "library_17000000000"
```
