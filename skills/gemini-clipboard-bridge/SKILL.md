---
name: Gemini Clipboard Bridge
description: Copies text to the clipboard. Supports setting the user's clipboard from agent CLI on Mac, WSL, Powershell, and over SSH. Optional file bypass mode for Docker sandboxes.
---

# Instructions
When the user wants to copy text, code blocks, or command output to their clipboard:
1. Identify the specific text to be copied.
2. **Policy Awareness (Headless Mode)**:
    - If you detect that you are running in a restricted or headless mode (e.g., `gemini -p`, one-off prompts) and `run_shell_command` is blocked by policy:
    - **Stop** and inform the user: "Clipboard operations are currently restricted by the agent's security policy for one-off prompts. To enable this, please run in interactive mode or use the `--yolo` flag to allow shell execution."
    - Do not attempt the tool call if you know it will fail.
3. **Transparent Communication**: Avoid saying "Successfully copied" without qualification. Instead, use language like "Attempting to copy to your host clipboard..." or "I've sent the clipboard sequence to your terminal...".
4. **Contextual Troubleshooting**:
    - **Sandbox**: If in a Docker sandbox, provide the host listener command: `tail -F .clipboard_bypass > $(tty)`.
    - **VS Code**: Mention that the `terminal.integrated.allowOsc52` setting must be enabled.
    - **SSH**: Remind the user that the bridge works best when an active `SSH_TTY` is present.
    - **Browser**: If the user is in a web-based terminal (like Google Cloud Shell), warn them that browsers often block clipboard writes for security.
5. Use `run_shell_command` to execute `scripts/copy.sh "the text to copy"`.

## Sandbox Setup (Action Required by User)
If you are running Gemini CLI inside a Docker sandbox, the agent cannot directly access your host clipboard. You must start a listener on your **host machine** (Windows/WSL terminal) to bridge the gap:

### Option A: Raw Stream (Recommended & Verified)
Run this in a separate terminal on your host (WSL/macOS/Linux). 
*Note: Use `tty` to find your active terminal device (e.g., `/dev/pts/22`).*
```bash
# Pipes the raw escape sequences directly to your TTY
tail -F .clipboard_bypass > $(tty)
```

### Option B: Named Pipe (Lowest Latency)
Run this in a separate terminal on your host:
```bash
mkfifo .clipboard_pipe
cat .clipboard_pipe > $(tty)
```

Once a listener is running, the `copy` command will work seamlessly from within the sandbox.

## Agent-to-Agent Communication Protocol
When you need to send messages to other agents or wait for responses on the Tailscale WebSocket bridge (for multi-agent coordination or long-running dialogues):

### 1. Sending a Message to Another Agent
Use the `send-msg.js` script to send a message to a specific agent (e.g. `surface95-agent`):
```bash
node ./scripts/send-msg.js "Message content here" --recipient="surface95-agent" --type="prompt"
```
*   `--recipient`: Set to the target agent ID (e.g., `surface95-agent`), `"orchestrator"` to target the orchestrator, or omit/set to `"*"` for broadcast.
*   `--type`: The type of message (`prompt`, `status`, `result`, or `abort`).

### 2. Awaiting a Response (Listen Once)
To wait for a response without polling, run the `listen-once.js` script as a background task. Since it is run in the background, when it receives a message it will print it to stdout and exit. This will trigger a reactive wakeup in the Gemini CLI and deliver the message directly to your context.

**Always run the listen command immediately after sending a message if you are waiting for a response:**
```bash
# Start the listener in the background
node ./scripts/listen-once.js --agent-id="YOUR_AGENT_ID" --type="prompt"
```
*   `--agent-id`: Your unique agent ID (to identify yourself to the broker and match the recipient field of incoming messages).
*   `--type`: (Optional) filter to only wake up for a specific message type.
*   `--timeout`: (Optional) timeout in milliseconds before exiting with an error (defaults to `300000` / 5 minutes).

**Important**: After executing the background listener command, stop calling any more tools. The system will automatically wake you up when the listener receives a message and exits.

> [!IMPORTANT]
> **CONNECTION LOSS HANDLED:** If the background listener task exits with a warning or error indicating the connection was closed (e.g. containing `[Disconnected] Connection to the broker was closed before a message was received`), do **NOT** attempt to troubleshoot, read task logs, write connection scripts, or run network diagnostics. Simply inform the user that the connection to the broker was lost/closed and stop execution.


