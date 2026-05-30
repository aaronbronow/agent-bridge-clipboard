# Downstream Integration Guide

This guide describes how downstream agent ecosystems (Gemini, Claude, Copilot) should consume the artifacts produced by this project.

## Overview
This project is a template extension for Agent Bridge Clipboards. Specific agent skills are in the `skills/` directory. These are designed to be imported as "raw skills" that you then wrap with your own project-specific metadata (manifests) and commands.

---

## The Hybrid Distribution Model

Run `make build` to package skills into the `dist/` folder.

Each subfolder in `dist/` is optimized for a different integration path:

| Folder | Target | Content Type | Usage |
| :--- | :--- | :--- | :--- |
| `dist/agent-bridge-clipboard` | **Standalone** | Full Extension | Installable via `gemini extensions install` |
| `dist/gemini-clipboard-bridge` | **Downstream** | Raw Skill + Scripts | Link into a custom Gemini extension |
| `dist/claude-clipboard-bridge` | **Downstream** | MCP / Raw Logic | Link into a Claude MCP server |
| `dist/copilot-clipboard-bridge`| **Downstream** | Plugin / Raw Logic | Link into a VS Code plugin |

---

## Integration Patterns

### 1. Makefile Import (Recommended for Local Dev)
The most reliable way to sync artifacts locally is to use the provided `import-skill` target. This avoids the complexity of Git submodules while ensuring you get the full `dist/` bundle.

1. **In the downstream project**, run:
   ```bash
   # Point to the directory where you have agent-bridge-clipboard cloned
   UPSTREAM_DIR=../agent-bridge-clipboard make -f ../agent-bridge-clipboard/Makefile import-skill
   ```

2. **What this does**:
   - Creates a `.vendor/agent-bridge-clipboard/` directory in your downstream project.
   - Copies the contents of the upstream `dist/` directory.

### 2. GitHub Release Download (Recommended for CI/CD)
For stable, versioned production usage, download the release asset during your build or setup phase.

1. **Download the latest release**:
   ```bash
   # Using GitHub CLI
   gh release download --repo aaronbronow/agent-bridge-clipboard --pattern "*.tar.gz" --output upstream.tar.gz
   tar -xzvf upstream.tar.gz -C .vendor/clipboard
   ```

2. **Integration**:
   Your extension should then reference the extracted files (e.g., in `.vendor/clipboard/gemini-clipboard-bridge/...`).

### 3. Manual Integration (Simplest)
If you just want the script and the "brain" (SKILL.md), you can copy the files directly.

1. Copy `dist/<agent>-clipboard-bridge/scripts/copy_to_clipboard.sh` to your scripts folder.
2. Copy `dist/<agent>-clipboard-bridge/SKILL.md` to your skills folder.
3. Update your agent's system prompt or tool configuration to use these files.

---

## Path Normalization Rules
The `copy_to_clipboard.sh` script is designed to be portable. It uses environment detection and fallback channels that work regardless of where the script is located on the filesystem, provided it has execute permissions.

When importing into a Gemini extension, ensure your `gemini-extension.json` correctly maps the skill paths.

### Example `gemini-extension.json` for Downstream:
```json
{
  "name": "my-specialized-agent",
  "skills": ["./vendor/clipboard/gemini-clipboard-bridge"],
  "commands": ["./commands/my-custom-commands"]
}
```

## Verification
After importing, always run the upstream verification script from within your downstream environment to ensure the transport is still working:
```bash
bash ./vendor/clipboard/gemini-clipboard-bridge/tests/verify.sh
```
*(Note: Adjust the path based on your vendoring structure.)*
