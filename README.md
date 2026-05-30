# Agent Bridge Clipboard (ABC)

A universal clipboard synchronization bridge and testing suite for AI agents (Gemini, Claude, Copilot, etc.). This project provides the core transport logic and escape sequence protocols required to bridge isolated agent environments (Docker, SSH, WSL) with the host system clipboard.

## Architecture
- **Upstream (`agent-bridge-clipboard`)**: This repository. Contains core transport protocols and provides agent-specific "raw skills" for downstream consumption.
- **Standalone Extension**: This repository also serves as the primary source for the `agent-bridge-clipboard` Gemini CLI extension.

## Project Structure
- `scripts/`: Core transport logic (`copy_to_clipboard.sh`) for the main ABC extension.
- `SKILL.md`: The main ABC skill definition.
- `skills/`: Discrete, logic-only bridge implementations for other agent ecosystems.
  - `gemini-clipboard-bridge/`: Raw skill for downstream Gemini extensions.
  - `claude-clipboard-bridge/`: Placeholder for Claude MCP integration.
  - `copilot-clipboard-bridge/`: Placeholder for VS Code Copilot integration.
- `commands/abc/`: CLI command definitions for the standalone extension.
- `tests/`: Compatibility matrix and verification scripts.

## Core Logic: `copy_to_clipboard.sh`
The heart of the project is the `scripts/copy_to_clipboard.sh` bridge. It prioritizes transport methods based on environment detection:
1. **Sandbox Detection**: Identifies if running in a Docker/Container environment.
2. **Native**: `clip.exe` (WSL) or `pbcopy` (macOS).
3. **SSH TTY Bypass**: Writes to `$SSH_TTY` for remote background reliability.
4. **Bypass**: File-based signaling via `.clipboard_bypass` (Mandatory for Docker sandboxes).
5. **Transport**: Direct OSC 52 escape sequences to `/dev/tty` or `stdout`.

## Distribution Model
This project uses a hybrid distribution model to support both end-users and downstream developers. See [DISTRIBUTION.md](DISTRIBUTION.md) for detailed integration guides.

- **Standalone**: `dist/agent-bridge-clipboard/` (Full Gemini extension).
- **Raw Skills**: `dist/*-clipboard-bridge/` (Flattened, logic-only packages).

## Developer Workflow

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
