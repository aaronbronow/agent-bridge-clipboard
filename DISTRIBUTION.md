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
| `dist/antigravity-clipboard-bridge` | **Downstream** | Raw Skill + Scripts | Link into Antigravity skill directory |
| `dist/claude-clipboard-bridge` | **Downstream** | MCP / Raw Logic | Link into a Claude MCP server |
| `dist/copilot-clipboard-bridge`| **Downstream** | Plugin / Raw Logic | Link into a VS Code plugin |

---

## Integration Patterns

### 1. Linking a Raw Skill (Gemini CLI)
If you are building a downstream Gemini extension that needs clipboard support, do not copy the full `agent-bridge-clipboard` extension. Instead, link the specific bridge skill.

1. **Import the Artifact**:
   Copy `dist/gemini-clipboard-bridge/` into your repo (e.g., under `vendor/clipboard/`).

2. **Wrap in your Manifest**:
   In your downstream `gemini-extension.json`, point to the vendored skill:
   ```json
   {
     "name": "my-specialized-agent",
     "skills": ["./vendor/clipboard/gemini-clipboard-bridge"],
     "commands": ["./commands/my-custom-commands"]
   }
   ```

3. **Reuse Logic in Commands**:
   Your custom commands can now invoke the vendored `copy.sh` directly:
   ```toml
   # commands/my-custom-commands/copy-it.toml
   prompt = """
   <task>
   !{./vendor/clipboard/gemini-clipboard-bridge/scripts/copy.sh {{args}}}
   </task>
   """
   ```

### 2. Manual Integration (Simplest)
If you just want the script and the "brain" (SKILL.md), you can copy the files directly.

1. Copy `dist/<agent>-clipboard-bridge/scripts/copy.sh` to your scripts folder.
2. Copy `dist/<agent>-clipboard-bridge/SKILL.md` to your skills folder.
3. Update your agent's system prompt or tool configuration to use these files.

---

## Path Normalization
The `copy.sh` script is designed to be portable. It uses environment detection and fallback channels that work regardless of where the script is located on the filesystem, provided it has execute permissions.

