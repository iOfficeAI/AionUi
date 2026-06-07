import re
import sys

def main():
    try:
        with open('/Users/matt/chisl-full/CHANGELOG.md', 'r') as f:
            content = f.read()
    except FileNotFoundError:
        return

    today_marker = "## 2026-06-07"
    aionui_header = "### AionUi"
    
    new_entry = """- **Feat(workspace): rebuild Git Diff panel on IPC contract.** Rebuilt `GitChangeList` (formerly `FileChangeList`) on top of the native `ipcBridge.git` contract, decoupling the local renderer from the old `fileSnapshot` backend. Added explicit UI states for `git-not-installed` and `no-repo` with an "Initialize Git repository" flow. Implemented a commit box (message + commit action), per-file discard confirmations, and replaced legacy session polling with debounced subscriptions to `ipcBridge.git.changed`. Repointed `SiderDiffSection` and `Workspace/index.tsx` to the new `useGitChanges` hook while leaving the remote-session mode unchanged. Added 20+ missing i18n keys across all 8 locales for the new Git terminology. All tsc/lint/i18n checks pass.
"""

    if today_marker in content:
        # Split by today_marker
        parts = content.split(today_marker, 1)
        today_section = parts[1]
        
        # Find first AionUi in today's section
        if aionui_header in today_section:
            # Insert right after the header
            sub_parts = today_section.split(aionui_header, 1)
            new_today = sub_parts[0] + aionui_header + "\n" + new_entry + sub_parts[1]
            content = parts[0] + today_marker + new_today
        else:
            # Add AionUi under today
            content = parts[0] + today_marker + "\n\n" + aionui_header + "\n" + new_entry + parts[1]
    else:
        # Add today's marker at the top
        # Find first ##
        first_h2 = content.find("## ")
        if first_h2 != -1:
            content = content[:first_h2] + today_marker + "\n\n" + aionui_header + "\n" + new_entry + "\n" + content[first_h2:]
        else:
            content = today_marker + "\n\n" + aionui_header + "\n" + new_entry + "\n" + content
            
    with open('/Users/matt/chisl-full/CHANGELOG.md', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
