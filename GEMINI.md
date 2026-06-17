# Project Instructions: Agent Bridge Clipboard

## Project Architecture: The Hybrid Hub
This repository serves as the **Upstream Hub** for universal clipboard synchronization across AI agent ecosystems (Gemini, Claude, Copilot, etc.). 

### Architectural Tiers
1.  **Primary Extension (`agent-bridge-clipboard`)**: The root-level source. It is a fully self-contained Gemini CLI extension, including metadata, commands, and the universal transport logic.
2.  **Discrete Agent Skills**: Located in `skills/`. These are "logic-only" sub-packages (Flattened `SKILL.md` + universal `copy.sh`). They are designed to be linked or vendored into downstream projects without carrying redundant extension metadata.
3.  **Universal Transport (`scripts/copy.sh`)**: The single source of truth for all transport logic (OSC 52, SSH Bypass, WSL Fallbacks). It is shared by all tiers via the build process.

## Strategic Learnings & Intent
The current architecture is the result of several key learnings:

- **Source-to-Dist Alignment**: By promoting the main ABC extension to the root, we ensure that the development environment exactly mirrors the distribution structure. This eliminated the need for complex build-time patching (e.g., `sed` or `jq`).
- **Hybrid Distribution Philosophy**:
    - **End Users**: Get a clean, installable extension in `dist/agent-bridge-clipboard/`.
    - **Downstream Developers**: Get modular, logic-only skills in `dist/*-clipboard-bridge/` that they can link into their own manifests.
    - **Tiered Plugin Installation Strategy**:
        - **Combined Flagship Plugin (`agent-bridge-clipboard`)**: Serves as the comprehensive tier. Designed for users who want both local clipboard integration and multi-agent synchronization/messaging over the ABC protocol. It groups the copy script, background client, broker, and agent-to-agent messaging together.
        - **Discrete Standalone Skills (e.g., `gemini-clipboard-bridge`)**: Expose only the core local clipboard copying functionality (`copy.sh`) with zero network dependencies or background daemons. Useful for downstream developers or users who only want simple copy-to-clipboard capabilities.
- **Universal Logic**: Centralizing `copy.sh` at the root ensures that bug fixes and transport improvements propagate to all agent bridges (Gemini, Claude, Copilot) simultaneously.
- **Portable Relative Paths**: All commands and manifests use `./scripts/copy.sh`. This path is stable across source, standalone installation, and downstream linking.

## Clipboard Testing Protocol
The verification process for the `tests/COMPATIBILITY.md` matrix is handled **strictly** by the `tests/verify.sh` script.

### Protocol Rules
- **Interactive Requirement**: The script is interactive and **must** be run in a live, interactive subshell. It will exit immediately if executed as a non-interactive command.
- **Mandatory Metadata**: You MUST provide client metadata via environment variables (e.g., `CLIENT_OS`, `CLIENT_TERM`) for accurate matrix reporting.
- **Workflow**: `CLIENT_OS="macOS" CLIENT_TERM="iTerm2" make verify`
- **Manual testing bypass**: Do NOT attempt to run manual tests to update the matrix. Use the script to ensure consistent logging and state management.

### Technical Learnings
- **SSH Bypass**: Writing directly to the `$SSH_TTY` device (e.g., `/dev/pts/0`) is the most reliable way to bypass Gemini CLI subshell capture in remote environments.
- **Multiplexer Passthrough**: TMUX and GNU Screen require DCS (Device Control String) wrapping (e.g., `\ePtmux;\e...\e\\`) to allow OSC 52 sequences to reach the parent terminal emulator.
- **WSL/PowerShell Encoding**: When using `powershell.exe` for clipboard access in WSL, `[Console]::InputEncoding = [System.Text.Encoding]::UTF8` must be set to prevent character corruption.
- **Linux Desktop Support**: Prioritize `wl-copy` (Wayland) -> `xclip` -> `xsel` (X11) for local desktop environments.
- **Input Handling**: Use `printf "%s"` and stdin piping for large payloads to avoid `ARG_MAX` limits and accidental escape character expansion.
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
