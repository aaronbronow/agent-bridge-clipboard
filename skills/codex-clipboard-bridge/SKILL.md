---
name: clipboard
description: Copy any text to the clipboard over SSH, Tmux, WSL, Powershell
---

# Instructions

When the user asks to copy text, code blocks, logs, or command output to their clipboard, follow these steps.

### Step 1: Execute the Staged Helper Script (Primary Method)
To avoid sandbox/container prompt overhead and handle complex environmental configurations automatically, your **primary** and preferred action is to execute the centralized `copy_to_clipboard.sh` helper script.

#### 1. Locate the Script Path
Locate the helper script relative to this skill's installation directory. Codex plugins reside inside the `~/.codex/plugins/` or `~/.codex/plugins/marketplaces/` subdirectory structure.

- **If in a development/workspace directory**, the script is located at:
  `./skills/copy/copy_to_clipboard.sh`
- **If installed in a Codex plugins environment**, search or list your plugin's install directories to find the absolute path of `copy_to_clipboard.sh`.

#### 2. Execute via Stdin (Recommended for Escape Safety)
To prevent shell-parsing errors or escaping bugs with double quotes (`"`), single quotes (`'`), or backticks (`` ` ``), always stream the text to copy into the script's standard input (stdin), and capture stderr to read the transport status line:

```bash
printf "%s" "YOUR_TEXT_TO_COPY" | /path/to/copy_to_clipboard.sh
```

On success, the script writes exactly one line to stderr in the form `Copied via <transport>`. Use this status to confirm to the user.

---

### Step 2: Platform-Native Fallbacks (Use ONLY if the script is missing or fails)
If executing the helper script fails, execute the native platform command:

#### A. Windows (PowerShell/WSL)
- **WSL/CMD**: `echo -n "YOUR_TEXT_TO_COPY" | clip.exe`
- **PowerShell (Unsandboxed)**: `Set-Clipboard -Value "YOUR_TEXT_TO_COPY"`

#### B. macOS
- `echo -n "YOUR_TEXT_TO_COPY" | pbcopy`

#### C. Linux (Desktop Display Servers)
- **Wayland**: `echo -n "YOUR_TEXT_TO_COPY" | wl-copy`
- **X11**: `echo -n "YOUR_TEXT_TO_COPY" | xclip -selection clipboard`

#### D. SSH / Sandbox Bypass (OSC 52)
- **SSH**: `printf "\033]52;c;$(echo -n "YOUR_TEXT_TO_COPY" | base64 | tr -d '\r\n')\007" > "$SSH_TTY"`
- **Sandbox File**: `printf "\033]52;c;$(echo -n "YOUR_TEXT_TO_COPY" | base64 | tr -d '\r\n')\007" > .clipboard_bypass`

---

### Step 3: Verify and Confirm
After performing the copy, confirm to the user with a single sentence stating that the text was copied successfully, specifying the exact transport used (e.g., "via SSH TTY (OSC 52)", "via clip.exe").
