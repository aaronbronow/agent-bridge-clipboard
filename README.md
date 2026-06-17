# Agent Bridge Clipboard (ABC)

A universal clipboard synchronization bridge and testing suite for AI agents (Gemini, Claude, Copilot, etc.). This project provides the core transport logic and escape sequence protocols required to bridge isolated agent environments (Docker, SSH, WSL) with the host system clipboard.

## Architecture
- **Upstream (`agent-bridge-clipboard`)**: This repository. Contains core transport protocols and provides agent-specific "raw skills" for downstream consumption.
- **Standalone Extension**: This repository also serves as the primary source for the `agent-bridge-clipboard` Gemini CLI extension.

## Project Structure
- `scripts/`: Core transport and network synchronization logic.
  - `copy.sh`: Core shell script resolving local copy transports.
  - `broker.ts`: WebSocket broker server resolving client identities via Tailscale.
  - `client.ts`: Persistent background synchronization client.
  - `listen-once.ts`: One-shot background listener for agent-to-agent messaging.
  - `send-msg.ts`: Targeted sender for agent-to-agent messaging.
- `SKILL.md`: The main ABC skill definition.
- `skills/`: Discrete, logic-only bridge implementations for other agent ecosystems.
  - `gemini-clipboard-bridge/`: Raw skill for downstream Gemini extensions.
  - `antigravity-clipboard-bridge/`: Raw skill for Antigravity coding assistant.
  - `claude-clipboard-bridge/`: Placeholder for Claude MCP integration.
  - `copilot-clipboard-bridge/`: Placeholder for VS Code Copilot integration.
- `commands/abc/`: CLI command definitions for the standalone extension.
- `tests/`: Compatibility matrix, unit tests, and verification scripts.

## Core Logic: `copy.sh`
The heart of the project is the `scripts/copy.sh` bridge. It prioritizes transport methods based on environment detection:
1. **Bypass Check**: Evaluates if `send-clip.js` is present. If found (and `ABC_DISABLE_SYNC` is not `1`), publishes the copy to the WebSocket broker.
2. **Sandbox Detection**: Identifies if running in a Docker/Container environment.
3. **Native**: `clip.exe` (WSL) or `pbcopy` (macOS).
4. **SSH TTY Bypass**: Writes to `$SSH_TTY` for remote background reliability.
5. **Bypass**: File-based signaling via `.clipboard_bypass` (Mandatory for Docker sandboxes).
6. **Transport**: Direct OSC 52 escape sequences to `/dev/tty` or `stdout`.

## WebSocket Sync & Agent-to-Agent Messaging (ABC Protocol)
The Agent Bridge Clipboard includes a WebSocket-based sync protocol ("ABC Protocol") designed to securely synchronize clipboard states and coordinate message payloads across multiple connected agents (e.g., Windows/WSL, Linux/tmux, and Orchestrator instances) over a secure network (such as Tailscale).

### Running the Broker Server (Docker)
The broker runs as a containerized service. It leverages the local Tailscale socket to securely identify connected clients and enforces a single-orchestrator limit per bridge.

1. **Build the image**:
   ```bash
   docker build --network=host -t abc-broker -f Dockerfile .
   ```
2. **Run the container**:
   ```bash
   docker run -d --name abc-broker --restart unless-stopped --network host -v /var/run/tailscale/tailscaled.sock:/var/run/tailscale/tailscaled.sock abc-broker
   ```

### Client Sync & Agent-to-Agent Messaging
- **Background Client**: Run `npm run start:client -- --role=worker` (or `--role=orchestrator`) to start a persistent client that automatically syncs the clipboard in the background. Caches updates to `.bridge_clipboard_cache` and triggers a terminal bell/tmux alert when the clipboard changes.
- **Send Message**: Send targeted prompt/status frames to another agent:
   ```bash
   node ./scripts/send-msg.js "My message content" --recipient="surface95-agent" --type="prompt"
   ```
- **Listen Once**: To receive a response without polling, run the one-shot listener as a background task. It will exit immediately upon receiving the message, triggering a native reactive wakeup in the Antigravity/Gemini CLI:
   ```bash
   node ./scripts/listen-once.js --agent-id="my-agent-id" --type="prompt"
   ```

### Disabling Network Sync
To temporarily run `copy.sh` locally without background WebSocket publishing, set `ABC_DISABLE_SYNC=1` in your environment.

## Distribution Model
This project uses a hybrid distribution model to support both end-users and downstream developers. See [DISTRIBUTION.md](DISTRIBUTION.md) for detailed integration guides.

- **Standalone**: `dist/agent-bridge-clipboard/` (Full Gemini extension).
- **Raw Skills**: `dist/*-clipboard-bridge/` (Flattened, logic-only packages).

## Developer Workflow

### Local Plugin Installation
To install or link the plugin for the Antigravity CLI (`agy`):
* **Production Install**: `npm run install:plugin` (copies built files to `~/.gemini/config/plugins/abc`)
* **Development Link**: `npm run dev-install:plugin` (creates a symlink from `~/.gemini/config/plugins/abc` to the local build output for instant updates)

### Local Development & Testing
To test specific bridges in an isolated environment:
1. **Deploy to Sandbox**:
   ```bash
   TARGET_SKILL=gemini-clipboard-bridge make deploy-sandbox
   ```
2. **Test in Isolation**:
   ```bash
   cd ../agent-bridge-clipboard-sandbox
   gemini --sandbox
   ```

### Debugging
Enable detailed execution logging by creating a flag file:
```bash
touch .clipboard_debug
tail -f clipboard_debug.log
```

## Testing
To run the interactive compatibility verification script:
```bash
CLIENT_OS="Windows" CLIENT_TERM="Windows Terminal" AGENT_MODE="Default" make verify
```

### Headless Testing (Non-Interactive)
To test clipboard transport in non-interactive environments (e.g., within a `run_shell_command`):
1. **Write token to clipboard:**
   ```bash
   make headless METHOD=osc52-ssh
   ```
2. **Validate by pasting the result:**
   ```bash
   make validate TOKEN=<paste_your_clipboard_here>
   ```

## License
MIT
