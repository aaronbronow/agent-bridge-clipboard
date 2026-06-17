---
name: config
description: Configure the ABC plugin connection settings (broker, bridge, agent-id, role).
---

# Instructions
If the user asks to configure the bridge connection, change the broker URL, change their agent ID, or join a specific bridge, run the command below with appropriate arguments:

```bash
node ~/.gemini/config/plugins/abc/skills/copy/config.js --broker="ws://<broker-ip>:<port>" --bridge="<bridge-name>" --agent-id="<agent-id>" --role="worker|orchestrator"
```

### Arguments:
*   `--broker`: The WebSocket URL of the broker.
*   `--bridge`: The name of the bridge session.
*   `--agent-id`: The unique ID of this agent.
*   `--role`: Either `worker` or `orchestrator`.
