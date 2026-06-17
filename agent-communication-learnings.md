# 🌉 Multi-Agent Communication & Orchestration Learnings

This document summarizes the technical learnings, hurdles, and architectural solutions discovered while building the distributed agent-to-agent bridge between different hosts (such as `ubuntu-dev` and the Windows/WSL guest `lal` using `fml` as an SSH file broker). 

It details the lessons learned and proposes a **Tailscale-native WebSocket architecture** to replace file-polling.

---

## 💾 1. The SSH File-Broker Architecture (Current)

In the current setup, we used a shared directory on a home lab server (`fml`) as a message queue:
*   **ubuntu-dev** writes messages to `/home/aaron/Drive/dev/bridge/to-lal.jsonl` via `ssh` and reads/deletes `/home/aaron/Drive/dev/bridge/to-ubuntu-dev.jsonl`.
*   **lal** reads/deletes `to-lal.jsonl` and writes to `to-ubuntu-dev.jsonl`.
*   **Polling Loop**: To achieve reactive wakeups, agents poll these files every 20–30 seconds.

### Major Hurdles & Implementation Solutions:

### A. SSH Agent Forwarding in Background Tasks
*   **The Issue**: SSH agent forwarding (`IdentityAgent ~/.1password/agent.sock`) is tied to the active SSH terminal session. When executing background tasks (e.g. `node bin/agent-bridge.js listen`), or if the main terminal session goes idle/disconnects, the remote socket becomes stale. SSH commands then fall back to prompting for passwords, hanging the background task indefinitely.
*   **The Solution**: We added `-o BatchMode=yes` to all SSH/SCP commands. This forces SSH to fail fast with an exit code rather than prompting for input. The listener logs the warning and continues its loop, and we set up a 20-second one-shot timer (`schedule` tool) to periodically wake the orchestrator up to poll.

### B. Double Shell Escaping
*   **The Issue**: Executing remote commands via `ssh host "cmd 'arg'"` causes the local shell to parse quotes first, followed by the remote shell parsing the quote characters *again*. This double parsing corrupts JSON formats when passing nested quotes (e.g., `'Hey LAL! I noticed you are running "wsl npm"'`).
*   **The Solution**: We bypassed shell escaping completely by spawning `ssh` as a subprocess and piping raw string payloads directly to standard input using `cat >> target_file`:
    ```javascript
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', REMOTE_HOST, `cat >> ${BRIDGE_DIR}/to-${RECIPIENT}.jsonl`]);
    ssh.stdin.write(jsonLine);
    ssh.stdin.end();
    ```

### C. PowerShell JSON Parsing Gotcha
*   **The Issue**: In PowerShell, executing `$msg = $_ | ConvertTo-Json -Depth 5 | ConvertFrom-Json` on an already serialized JSON string double-serializes the data into a string representation of JSON. Calling properties like `$msg.sender` then yields `$null`.
*   **The Solution**: Simply use `ConvertFrom-Json` directly without piping to `ConvertTo-Json`:
    ```powershell
    $msg = $_ | ConvertFrom-Json
    ```

### D. WSL Filesystem Watcher Boundaries
*   **The Issue**: When the agent runs inside WSL on Windows, file watching (e.g., `fs.watch`, `nodemon`, `chokidar`) does not trigger events if the repository resides on a Windows mount (e.g., `/mnt/c/Users/aaron/dev/`).
*   **The Solution**: Move or clone the codebase inside the native WSL ext4 filesystem (e.g. `~/dev/drive-indexer/`).

---

## 🚀 2. Next-Gen Proposal: Tailscale-Native WebSockets

To eliminate polling delays, file-locking issues, and SSH agent dependencies, we should transition to a **Tailscale-native WebSocket architecture**.

Since all hosts (`ubuntu-dev`, `lal`, `fml`) are connected via Tailscale, they have stable, private IP addresses and MagicDNS records, allowing peer-to-peer TCP communication.

```
  [ Agent on LAL ]  <--- (Tailscale P2P WS Connection) --->  [ WebSocket Broker on ubuntu-dev ]
(WS Client/Worker)                                               (Broker / Coordinator)
```

### Key Advantages:
1.  **Real-Time Sync**: Latency drops from 20 seconds to sub-millisecond ranges. Messages trigger instant execution.
2.  **Zero-Trust Identity (Keyless Auth)**: The WebSocket broker can query the local Tailscale daemon's **Whois API** using the client's connection port. Tailscale returns the validated node name (e.g., `lal`) and OS user (e.g., `aaron`). **No API keys or passwords need to be generated or shared**.
3.  **Encrypted Transport**: Tailscale automatically manages WireGuard encryption between peer nodes, meaning we don't need to configure SSL/TLS certificates for the WebSocket connection.
4.  **Stdout/Stderr Streaming**: Instead of dumping command outputs to files, workers can stream their console outputs to the orchestrator in real-time, allowing live monitoring.

### Reusable WebSocket Protocol:
We can build a simple WebSocket server/client script that exchanges JSON frames:
*   **Connection Frame**: Sent by the client to register its role:
    ```json
    { "type": "register", "name": "lal" }
    ```
*   **Job Dispatch Frame**: Sent by the orchestrator:
    ```json
    { "type": "dispatch", "jobId": "123", "command": "drive-indexer index --src D:\\ --label Drive-04" }
    ```
*   **Output Stream Frame**: Sent by the worker during execution:
    ```json
    { "type": "stream", "jobId": "123", "stream": "stdout", "text": "Scanning directory /Photos/..." }
    ```

---

## 🛠️ 3. Architectural Distinction: Persistent Host Client (`client.js`) vs. Agent Listener (`listen-once.js`)

When integrating the WebSocket bridge with interactive agents running inside Antigravity/Gemini CLI, we maintain a strict separation between the host-level clipboard synchronization client and the agent-level message listener:

### A. The Sandbox Boundary (Host vs. Guest Sandbox)
*   **The Problem**: Codebase execution and agent shells often run in containerized sandboxes (e.g., Docker containers) or remote VM subshells.
*   **The Constraint**: A process running inside a Docker sandbox or remote VM cannot directly interact with a physical host OS clipboard (e.g., Windows/macOS) because the clipboard APIs (`powershell.exe Set-Clipboard`, `clip.exe`, `pbcopy`) are unavailable inside the container/VM context.
*   **The Solution**: The persistent clipboard synchronization client (`client.js`) **must** be executed natively on the user's host OS, outside the agent sandbox. Meanwhile, the one-shot listener (`listen-once.js`) runs inside the agent's subshell to handle agent-to-agent prompt routing and reactive wakeups.

### B. Lifecycle Alignment & Orphaned Processes
*   **The Problem**: If the agent attempts to spawn the long-running `client.js` in a background subshell using its `run_command` tool, the process lifecycle becomes tied to the agent's active subshell.
*   **The Constraint**: If the agent session is terminated, closed, or restarted, the spawned client is either forcefully killed, or it becomes an orphaned process running in the background, locking ports and sockets, and preventing reconnects.
*   **The Solution**: Users start `client.js` in a persistent terminal window on the host, ensuring it remains active across agent restarts. The agent only triggers short-lived, turn-based background listeners (`listen-once.js`) which automatically clean up and exit upon receiving a message.

---

## 🤝 4. Zero-Trust Routing & Session Takeover Learnings (E2E Bridge Validation)

During live E2E coordination tests between `ubuntu-agent` (orchestrator on guest VM) and `surface95-agent` (worker on host Windows/PowerShell), we resolved critical routing issues relating to identity verification and session conflicts:

### A. Routing Targets with Host Specifiers (`agent_id@host`)
*   **The Issue**: Under the broker's zero-trust model, the sender's host context is overwritten with the verified connection hostname (e.g. `localhost` or `surface95`). When `surface95-agent` received a message, it registered the sender as `ubuntu-agent@localhost`. When it sent its reply back, it targeted `--recipient=ubuntu-agent@localhost`. The broker's router matched purely on the raw `agent_id`, failing to find the target.
*   **The Solution**: We updated the routing engine in the WebSocket broker to detect the `@` character in the recipient field. If present, it splits the target into `agent_id` and `host` and verifies that the candidate session matches both the registered `agent_id` and the zero-trust verified `verifiedHost`. If no `@` is present, it falls back to matching by `agent_id` only.

### B. Transient Sender Session Conflicts
*   **The Issue**: When short-lived scripts like `send-msg.ts` or `send-clip.ts` connect to dispatch a message, they handshake with the same `agent_id` as the active background listener. This triggered the broker's **Session Takeover** protection, evicting the persistent listener.
*   **The Solution**: We introduced a `transient` flag in the `AgentContext` interface. Transient senders pass `transient: true` during handshake, instructing the broker to bypass the session eviction/takeover process for that connection.



