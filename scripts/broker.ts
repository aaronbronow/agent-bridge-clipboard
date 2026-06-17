import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import { parseFrame, createFrame, ABCFrame, AgentContext, VERSION } from './abc-protocol.js';

const PORT = parseInt(process.env.ABC_PORT || '4224', 10);
const TAILSCALE_SOCKET = '/var/run/tailscale/tailscaled.sock';

interface ClientSession {
  socket: WebSocket;
  context: AgentContext;
  bridgeName: string;
  verifiedHost: string;
  verifiedUser: string;
}

// Map of bridgeName -> last clipboard value C
const bridgeClipboards = new Map<string, string>();

// Map of socket -> ClientSession
const activeSessions = new Map<WebSocket, ClientSession>();

/**
 * Queries the local Tailscale daemon Whois API for connection details.
 */
function getTailscaleWhois(remoteAddr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TAILSCALE_SOCKET)) {
      return reject(new Error('Tailscale socket not found'));
    }

    const options = {
      socketPath: TAILSCALE_SOCKET,
      path: `/localapi/v0/whois?addr=${encodeURIComponent(remoteAddr)}`,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`Tailscale Whois returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Resolves Tailscale identity with robust localhost fallback.
 */
async function resolveIdentity(remoteAddress: string, remotePort: number): Promise<{ host: string; user: string }> {
  // Normalize remote address
  let ip = remoteAddress;
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Local loopback fallback for dev/testing
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return {
      host: 'localhost',
      user: process.env.USER || 'aaron',
    };
  }

  try {
    const whois = await getTailscaleWhois(`${ip}:${remotePort}`);
    const host = whois?.Node?.Name ? whois.Node.Name.split('.')[0] : 'unknown-tailscale-node';
    const user = whois?.UserProfile?.LoginName || 'unknown-tailscale-user';
    return { host, user };
  } catch (error: any) {
    console.warn(`[Whois Failed] Falling back to self-reported credentials. Reason: ${error.message}`);
    return {
      host: 'unverified-node',
      user: 'unverified-user',
    };
  }
}

const wss = new WebSocketServer({ port: PORT });

console.log(`[ABC Broker] Listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', async (ws, req) => {
  const remoteAddress = req.socket.remoteAddress || '127.0.0.1';
  const remotePort = req.socket.remotePort || 0;

  console.log(`[Connection] New connection request from ${remoteAddress}:${remotePort}`);

  // Resolve client identity over Tailscale
  const identity = await resolveIdentity(remoteAddress, remotePort);
  console.log(`[Identity] Resolved node: "${identity.host}", user: "${identity.user}"`);

  ws.on('message', (message: string) => {
    try {
      const frame = parseFrame(message.toString());
      handleFrame(ws, frame, identity);
    } catch (err: any) {
      console.error(`[Error] Failed parsing or handling frame: ${err.message}`);
      sendSystemMessage(ws, 'error', `Protocol Error: ${err.message}`);
    }
  });

  ws.on('close', () => {
    const session = activeSessions.get(ws);
    if (session) {
      console.log(`[Disconnect] Agent "${session.context.agent_id}" disconnected from Bridge "${session.bridgeName}"`);
      activeSessions.delete(ws);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Socket Error] ${err.message}`);
  });
});

/**
 * Handle incoming protocol frames.
 */
function handleFrame(ws: WebSocket, frame: ABCFrame, verifiedIdentity: { host: string; user: string }) {
  const { event } = frame.B;

  if (event === 'handshake') {
    handleHandshake(ws, frame, verifiedIdentity);
    return;
  }

  // Ensure client is authenticated/registered before handling other frames
  const session = activeSessions.get(ws);
  if (!session) {
    throw new Error('Client must send a handshake frame first');
  }

  // Overwrite host and user in Context A with verified identity to ensure zero-trust security
  frame.A.host = session.verifiedHost;
  frame.A.user = session.verifiedUser;

  switch (event) {
    case 'clipboard_sync':
      handleClipboardSync(session, frame);
      break;

    case 'agent_message':
    case 'agent_control':
      handleAgentRouting(session, frame);
      break;

    case 'ping':
      ws.send(JSON.stringify(createFrame(
        { agent_id: 'broker', host: 'localhost', user: 'system', role: 'worker' },
        { event: 'pong' },
        bridgeClipboards.get(session.bridgeName) || ''
      )));
      break;
  }
}

/**
 * Handshake/Registration Logic.
 */
function handleHandshake(ws: WebSocket, frame: ABCFrame, verified: { host: string; user: string }) {
  if (activeSessions.has(ws)) {
    throw new Error('Handshake already completed for this connection');
  }

  const bridgeName = frame.B.content || 'default';
  const role = frame.A.role || 'worker';
  
  // Enforce zero-trust validation by checking/overwriting host & user
  const host = verified.host !== 'unverified-node' ? verified.host : frame.A.host;
  const user = verified.user !== 'unverified-user' ? verified.user : frame.A.user;

  // Software Version Mismatch Validation
  if (frame.A.version !== VERSION) {
    console.warn(`[Warning] Version mismatch for Agent "${frame.A.agent_id}": Agent is running v${frame.A.version}, but Broker is running v${VERSION}`);
    sendSystemMessage(
      ws,
      'warning',
      `Warning: Version mismatch. Your agent is running v${frame.A.version}, but the Broker is running v${VERSION}. Please align versions to prevent sync issues.`
    );
  }

  // Single Orchestrator Rule
  if (role === 'orchestrator') {
    const existingOrchestrator = Array.from(activeSessions.values()).find(
      s => s.bridgeName === bridgeName && s.context.role === 'orchestrator'
    );
    if (existingOrchestrator) {
      console.warn(`[Warning] Double orchestrator detected on bridge "${bridgeName}"! Existing: ${existingOrchestrator.context.agent_id}@${existingOrchestrator.verifiedHost}`);
      sendSystemMessage(
        ws,
        'warning',
        `Warning: An orchestrator is already active on this bridge (Host: ${existingOrchestrator.verifiedHost}, User: ${existingOrchestrator.verifiedUser}). Running multiple orchestrators can cause command conflicts.`
      );
    }
  }

  const session: ClientSession = {
    socket: ws,
    context: {
      ...frame.A,
      host,
      user,
      role
    },
    bridgeName,
    verifiedHost: host,
    verifiedUser: user
  };

  activeSessions.set(ws, session);
  console.log(`[Handshake] Registered Agent "${session.context.agent_id}" [Role: ${role}] to Bridge "${bridgeName}"`);

  // Send initial handshake acknowledgement containing last known clipboard state
  const lastClipboard = bridgeClipboards.get(bridgeName) || '';
  ws.send(JSON.stringify(createFrame(
    { agent_id: 'broker', host: 'localhost', user: 'system', role: 'worker' },
    { event: 'system_message', message_type: 'status', content: 'Handshake complete' },
    lastClipboard
  )));
}

/**
 * Handles Syncing of Clipboard updates.
 */
function handleClipboardSync(session: ClientSession, frame: ABCFrame) {
  const currentClipboard = frame.C;
  const lastClipboard = bridgeClipboards.get(session.bridgeName) || '';

  // Skip if clipboard values match (loop prevention)
  if (currentClipboard === lastClipboard) {
    return;
  }

  bridgeClipboards.set(session.bridgeName, currentClipboard);
  console.log(`[Clipboard Sync] Bridge "${session.bridgeName}" updated by "${session.context.agent_id}". Length: ${currentClipboard.length}`);

  // Broadcast to all other clients on the same bridge
  broadcastToBridge(session.bridgeName, frame, session.socket);
}

/**
 * Handles Routing of Agent Messages and Control Signals.
 */
function handleAgentRouting(session: ClientSession, frame: ABCFrame) {
  const recipient = frame.B.recipient;
  console.log(`[Routing] Event: ${frame.B.event} from "${session.context.agent_id}" to "${recipient || 'broadcast'}" on Bridge "${session.bridgeName}"`);

  if (recipient === '*') {
    // Broadcast to all connected clients on the bridge (including sender)
    broadcastToBridge(session.bridgeName, frame);
  } else if (!recipient) {
    // Default broadcast: Send to everyone except the sender
    broadcastToBridge(session.bridgeName, frame, session.socket);
  } else if (recipient === 'orchestrator') {
    // Route to orchestrator
    const orchestrator = Array.from(activeSessions.values()).find(
      s => s.bridgeName === session.bridgeName && s.context.role === 'orchestrator'
    );
    if (orchestrator) {
      orchestrator.socket.send(JSON.stringify(frame));
    } else {
      sendSystemMessage(session.socket, 'error', 'No active orchestrator on this bridge');
    }
  } else {
    // Route to specific agent ID
    const target = Array.from(activeSessions.values()).find(
      s => s.bridgeName === session.bridgeName && s.context.agent_id === recipient
    );
    if (target) {
      target.socket.send(JSON.stringify(frame));
    } else {
      sendSystemMessage(session.socket, 'error', `Target agent "${recipient}" not found on this bridge`);
    }
  }
}

/**
 * Sends a system message back to a specific client.
 */
function sendSystemMessage(ws: WebSocket, type: 'warning' | 'error' | 'status', message: string) {
  const frame = createFrame(
    { agent_id: 'broker', host: 'localhost', user: 'system', role: 'worker' },
    { event: 'system_message', message_type: type, content: message },
    ''
  );
  ws.send(JSON.stringify(frame));
}

/**
 * Broadcasts a frame to all clients on a specific bridge (with optional exclusion of sender).
 */
function broadcastToBridge(bridgeName: string, frame: ABCFrame, excludeSocket?: WebSocket) {
  const payload = JSON.stringify(frame);
  for (const [ws, session] of activeSessions.entries()) {
    if (session.bridgeName === bridgeName && ws !== excludeSocket) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
