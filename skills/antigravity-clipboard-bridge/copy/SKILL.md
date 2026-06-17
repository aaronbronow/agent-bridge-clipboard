---
name: copy
description: Copies text to the clipboard. Supports setting the user's clipboard from agent CLI on Mac, WSL, Powershell, and over SSH. Optional file bypass mode for Docker sandboxes.
---

# Instructions
If the user asks to copy text to the clipboard, use the command below:

```bash
~/.gemini/config/plugins/abc/skills/copy/copy.sh "the text to copy"
```

### Usage Steps:
1. **Identify the Content**: Determine the exact text, code block, or command output to be copied.
2. **Execute Command**: Invoke the `run_command` tool to run the command above. 
3. **Escaping**: Properly escape any double quotes (`"`) or backticks (`` ` ``) in the text argument to ensure standard shell execution parses the argument correctly.

## Agent-to-Agent Communication Protocol
When you need to send messages to other agents or wait for responses on the Tailscale WebSocket bridge (for multi-agent coordination or long-running dialogues):

### 1. Sending a Message to Another Agent
Use the `send-msg.js` script to send a message to a specific agent (e.g. `surface95-agent`):
```bash
node ~/.gemini/config/plugins/abc/skills/copy/send-msg.js "Message content here" --recipient="surface95-agent" --type="prompt"
```
*   `--recipient`: Set to the target agent ID (e.g., `surface95-agent`), `"orchestrator"` to target the orchestrator, or omit/set to `"*"` for broadcast.
*   `--type`: The type of message (`prompt`, `status`, `result`, or `abort`).

### 2. Awaiting a Response (Listen Once)
To wait for a response without polling, run the `listen-once.js` script as a background task. Since it is run in the background, when it receives a message it will print it to stdout and exit. This will trigger a reactive wakeup in the Antigravity CLI and deliver the message directly to your context.

**Always run the listen command immediately after sending a message if you are waiting for a response:**
```bash
# Start the listener in the background
node ~/.gemini/config/plugins/abc/skills/copy/listen-once.js --agent-id="YOUR_AGENT_ID" --type="prompt"
```
*   `--agent-id`: Your unique agent ID (to identify yourself to the broker and match the recipient field of incoming messages).
*   `--type`: (Optional) filter to only wake up for a specific message type.
*   `--timeout`: (Optional) timeout in milliseconds before exiting with an error (defaults to `300000` / 5 minutes).

**Important**: After executing the background listener command, stop calling any more tools. The system will automatically wake you up when the listener receives a message and exits.

