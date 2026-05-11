---
name: indica-native-control
description: Use when the user asks to control, inspect, or automate the local Windows system through Indica.
---

# Indica Native Control

You have access to Indica's native Windows tool gateway through the `indica-native` MCP server.

Prefer these tools when the user asks to interact with the local system:

- Open or focus apps, websites, folders, and files.
- Inspect the active window, visible windows, installed apps, running apps, system info, and files.
- Control media keys such as mute, volume, play/pause, next, and previous.
- Read or write clipboard text.
- Send common hotkeys to the active app.
- Paste text into the active app.
- List, search, read, create, append, copy, move, rename, and delete files or folders.
- Take screenshots and write notes to the desktop scratchpad.
- Run PowerShell only when structured tools are not enough.

Safety:

- Use structured Indica tools before raw PowerShell.
- Ask for confirmation before destructive or security-sensitive work.
- Destructive tools require `confirm=YES`.
- If a user misspells a command, infer the likely action when the intent is clear.
- Do not claim you cannot access the system when Indica tools are available; explain what you can do and then do it.
