#!/usr/bin/env python3

import os
import sys
import json
import sqlite3
import time
import random

def get_db_path():
    home = os.path.expanduser('~')
    paths_to_check = [
        os.path.join(home, '.aionui-dev-2', 'aionui.db'),
        os.path.join(home, '.aionui-dev', 'aionui.db'),
        os.path.join(home, '.aionui', 'aionui.db'),
    ]
    
    app_support = os.path.join(home, 'Library', 'Application Support')
    paths_to_check.extend([
        os.path.join(app_support, 'AionUi-coworker', 'aionui', 'aionui.db'),
        os.path.join(app_support, 'Electron', 'aionui', 'aionui.db'),
        os.path.join(app_support, 'AionUi', 'aionui', 'aionui.db'),
    ])

    if sys.platform == 'win32':
        app_data = os.environ.get('APPDATA', '')
        paths_to_check.extend([
            os.path.join(app_data, 'AionUi-coworker', 'aionui', 'aionui.db'),
            os.path.join(app_data, 'Electron', 'aionui', 'aionui.db'),
        ])
    else:
        config_home = os.environ.get('XDG_CONFIG_HOME', os.path.join(home, '.config'))
        paths_to_check.extend([
            os.path.join(config_home, 'AionUi-coworker', 'aionui', 'aionui.db'),
            os.path.join(config_home, 'Electron', 'aionui', 'aionui.db'),
        ])

    # Find the first path that exists and actually contains the library_items table
    fallback = None
    for p in paths_to_check:
        if os.path.exists(p):
            if not fallback:
                fallback = p
            try:
                temp_conn = sqlite3.connect(p)
                temp_cursor = temp_conn.cursor()
                temp_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='library_items'")
                has_table = temp_cursor.fetchone()
                temp_conn.close()
                if has_table:
                    return p
            except Exception:
                pass
                
    return fallback or os.path.join(home, '.aionui', 'aionui.db')

db_path = get_db_path()
if not os.path.exists(db_path):
    print(json.dumps({"error": f"Database not found at {db_path}"}))
    sys.exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

def parse_args():
    parsed = {}
    args = sys.argv[3:]
    i = 0
    while i < len(args):
        arg = args[i]
        if arg.startswith('--'):
            key = arg[2:]
            if i + 1 < len(args) and not args[i+1].startswith('--'):
                parsed[key] = args[i+1]
                i += 2
            else:
                parsed[key] = True
                i += 1
        else:
            i += 1
    return parsed

def generate_id(prefix="library"):
    timestamp = int(time.time() * 1000)
    rand = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=7))
    return f"{prefix}_{timestamp}_{rand}"

command = sys.argv[1] if len(sys.argv) > 1 else None
args = parse_args()

if command == 'list':
    try:
        cursor.execute("SELECT id, name, file_path, file_type, source, parent_id, folder_id, favorite FROM library_items ORDER BY created_at DESC")
        rows = [dict(row) for row in cursor.fetchall()]
        print(json.dumps(rows, indent=2))
    except Exception as e:
        print(json.dumps({"error": f"List failed: {str(e)}"}))
        sys.exit(1)

elif command == 'add':
    name = args.get('name', 'Untitled')
    file_type = args.get('type', 'web')
    parent_id = args.get('parent', None)
    folder_id = args.get('folder', None)
    content = args.get('content', '')
    source_path = args.get('path', '')
    favorite = 1 if args.get('favorite') else 0

    item_id = generate_id('library')
    now = int(time.time() * 1000)
    library_dir = os.path.join(os.path.dirname(db_path), 'library')
    os.makedirs(library_dir, exist_ok=True)

    final_file_path = ''
    if file_type == 'markdown':
        final_file_path = os.path.join(library_dir, f"{item_id}.md")
        with open(final_file_path, 'w', encoding='utf-8') as f:
            f.write(content)
    elif file_type == 'web':
        final_file_path = source_path or content or ''
    else:
        final_file_path = os.path.join(library_dir, f"{item_id}.txt")
        with open(final_file_path, 'w', encoding='utf-8') as f:
            f.write(content or '')

    try:
        cursor.execute("""
            INSERT INTO library_items (
                id, name, file_path, file_type, source,
                favorite, shared, private, folder_id, parent_id, created_at, updated_at, last_opened_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item_id, name, final_file_path, file_type, 'agent',
            favorite, 0, 1, folder_id, parent_id, now, now, now
        ))
        conn.commit()
        print(json.dumps({"success": True, "item": {"id": item_id, "name": name, "fileType": file_type, "filePath": final_file_path}}, indent=2))
    except Exception as e:
        print(json.dumps({"error": f"Add failed: {str(e)}"}))
        sys.exit(1)

elif command in ('organize', 'update'):
    item_id = args.get('id')
    if not item_id:
        print(json.dumps({"error": "Missing --id"}))
        sys.exit(1)

    updates = []
    params = []

    if 'name' in args:
        updates.append("name = ?")
        params.append(args['name'])
    if 'parent' in args:
        updates.append("parent_id = ?")
        params.append(None if args['parent'] == 'null' else args['parent'])
    if 'folder' in args:
        updates.append("folder_id = ?")
        params.append(None if args['folder'] == 'null' else args['folder'])
    if 'favorite' in args:
        updates.append("favorite = ?")
        params.append(1 if args['favorite'] else 0)

    if not updates:
        print(json.dumps({"error": "No updates provided"}))
        sys.exit(1)

    updates.append("updated_at = ?")
    params.append(int(time.time() * 1000))
    params.append(item_id)

    try:
        query = f"UPDATE library_items SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        print(json.dumps({"success": cursor.rowcount > 0}))
    except Exception as e:
        print(json.dumps({"error": f"Update failed: {str(e)}"}))
        sys.exit(1)

elif command == 'delete':
    item_id = args.get('id')
    if not item_id:
        print(json.dumps({"error": "Missing --id"}))
        sys.exit(1)

    try:
        cursor.execute("SELECT file_path, file_type, source FROM library_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if row:
            row_dict = dict(row)
            if row_dict['source'] != 'web' and os.path.exists(row_dict['file_path']):
                try:
                    os.remove(row_dict['file_path'])
                except Exception:
                    pass

        cursor.execute("UPDATE library_items SET parent_id = NULL WHERE parent_id = ?", (item_id,))
        cursor.execute("DELETE FROM library_items WHERE id = ?", (item_id,))
        conn.commit()
        print(json.dumps({"success": cursor.rowcount > 0}))
    except Exception as e:
        print(json.dumps({"error": f"Delete failed: {str(e)}"}))
        sys.exit(1)

else:
    print(json.dumps({"error": "Invalid command. Use: list, add, update, delete"}))

conn.close()
