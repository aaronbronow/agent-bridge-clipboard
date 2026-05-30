# Project Instructions: Agent Bridge Clipboard

## Project Architecture: The Hybrid Hub
This repository serves as the **Upstream Hub** for universal clipboard synchronization across AI agent ecosystems (Gemini, Claude, Copilot, etc.). 

### Architectural Tiers
1.  **Primary Extension (`agent-bridge-clipboard`)**: The root-level source. It is a fully self-contained Gemini CLI extension, including metadata, commands, and the universal transport logic.
2.  **Discrete Agent Skills**: Located in `skills/`. These are "logic-only" sub-packages (Flattened `SKILL.md` + universal `copy_to_clipboard.sh`). They are designed to be linked or vendored into downstream projects without carrying redundant extension metadata.
3.  **Universal Transport (`scripts/copy_to_clipboard.sh`)**: The single source of truth for all transport logic (OSC 52, SSH Bypass, WSL Fallbacks). It is shared by all tiers via the build process.

## Strategic Learnings & Intent
The current architecture is the result of several key learnings:

- **Source-to-Dist Alignment**: By promoting the main ABC extension to the root, we ensure that the development environment exactly mirrors the distribution structure. This eliminated the need for complex build-time patching (e.g., `sed` or `jq`).
- **Hybrid Distribution Philosophy**:
    - **End Users**: Get a clean, installable extension in `dist/agent-bridge-clipboard/`.
    - **Downstream Developers**: Get modular, logic-only skills in `dist/*-clipboard-bridge/` that they can link into their own manifests.
- **Universal Logic**: Centralizing `copy_to_clipboard.sh` at the root ensures that bug fixes and transport improvements propagate to all agent bridges (Gemini, Claude, Copilot) simultaneously.
- **Portable Relative Paths**: All commands and manifests use `./scripts/copy_to_clipboard.sh`. This path is stable across source, standalone installation, and downstream linking.

## Clipboard Testing Protocol
The verification process for the `tests/COMPATIBILITY.md` matrix is handled **strictly** by the `tests/verify.sh` script.

### Protocol Rules
- **Interactive Requirement**: The script is interactive and **must** be run in a live, interactive subshell. It will exit immediately if executed as a non-interactive command.
- **Mandatory Metadata**: You MUST provide client metadata via environment variables (e.g., `CLIENT_OS`, `CLIENT_TERM`) for accurate matrix reporting.
- **Workflow**: `CLIENT_OS="macOS" CLIENT_TERM="iTerm2" make verify`
- **Manual testing bypass**: Do NOT attempt to run manual tests to update the matrix. Use the script to ensure consistent logging and state management.

### Technical Learnings
- **SSH Bypass**: Writing directly to the `$SSH_TTY` device (e.g., `/dev/pts/0`) is the most reliable way to bypass Gemini CLI subshell capture in remote environments.
- **False Positives**: The script performs a robust clipboard clear before every test case to prevent stale data from compromising results.
- **WSL Success**: `clip.exe` and `powershell.exe` are the verified fallback methods for local WSL2 sessions where OSC 52 might be captured.

## Sandbox Clipboard Bypasses (Verified)
Direct clipboard access from a Docker sandbox is restricted. We use shared workspace files as signaling channels:

1.  **SSH TTY Redirection**: Writing directly to the host's `$SSH_TTY` (Remote/Background).
2.  **Named Pipe (FIFO)**: Preferred for low-latency local sandboxes (`.clipboard_pipe`).
3.  **File-Based Signaling**: Robust fallback for local sandboxes (`.clipboard_bypass`).

### Headless Verification
For testing in non-interactive environments (e.g., `run_shell_command`):
1.  `make headless METHOD=osc52-ssh` (Generates a unique token).
2.  `make validate TOKEN=<paste_result>` (Validates the transport).

## Development Workflow
To test changes in an isolated environment without a full extension reinstall:
1.  **Deploy**: `TARGET_SKILL=gemini-clipboard-bridge make deploy-sandbox`.
2.  **Test**: Run `gemini --sandbox` in the target directory.

## Environment Notes
- **WSL2 (Ubuntu 24.04)**: Requires `clip.exe` for reliable access.
- **ARM64 Compatibility**: Use the local Dockerfile in `.gemini/` to build a native sandbox image if running on Apple Silicon or ARM Surface.
