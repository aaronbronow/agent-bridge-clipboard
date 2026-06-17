---
name: copy
description: Copies text to the clipboard. Supports setting the user's clipboard from agent CLI on Mac, WSL, Powershell, and over SSH. Optional file bypass mode for Docker sandboxes.
---

# Instructions
If the user asks to copy text to the clipboard, you should use the **Static Command Method** to avoid causing repetitive security permission prompts for the user:

1. **Write the content** to the file `~/.gemini/config/plugins/abc/pending_copy.txt` (resolve `~` to the user's home directory).
2. **Execute the static command** using `run_command`:
   ```bash
   node ~/.gemini/config/plugins/abc/skills/copy/copy.js
   ```
   *(Since this command has no arguments, the user only has to approve/persist this command once, and it will be auto-allowed for all future copies).*

> [!NOTE]
> **Fallback Method**: If needed, you can still run `node ~/.gemini/config/plugins/abc/skills/copy/copy.js "text to copy"`, but this will prompt the user to approve the specific text every time.

## Agent-to-Agent Communication Protocol
When you need to send messages to other agents or wait for responses on the Tailscale WebSocket bridge (for multi-agent coordination or long-running dialogues):

### 1. Sending a Message to Another Agent
To avoid dynamic CLI arguments that trigger repetitive permission approvals, use the **Static Message Method**:

1. **Write the message payload** as a JSON object to the file `~/.gemini/config/plugins/abc/pending_message.json` (resolve `~` to the user's home directory):
   ```json
   {
     "content": "Message content here",
     "recipient": "surface95-agent",
     "type": "prompt"
   }
   ```
   *   `recipient`: Set to the target agent ID (e.g., `surface95-agent`), `"orchestrator"` to target the orchestrator, or `"*"`/omit for broadcast.
   *   `type`: The type of message (`prompt`, `status`, `result`, or `abort`).

2. **Execute the static command** using `run_command`:
   ```bash
   node ~/.gemini/config/plugins/abc/skills/copy/send-msg.js
   ```
   *(Since this command has no arguments, the user only has to approve/persist this command once).*

> [!NOTE]
> **Fallback Method**: You can still run `node ~/.gemini/config/plugins/abc/skills/copy/send-msg.js "Message content" --recipient="surface95-agent" --type="prompt"`, but it will prompt the user to approve the specific message string.

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
