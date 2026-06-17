import test from 'node:test';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { WebSocket } from 'ws';
import { parseFrame, createFrame, calculateHash, ABCFrame } from '../scripts/abc-protocol.js';

const TEST_PORT = 4225;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('ABC Protocol Helpers', () => {
  const context = {
    agent_id: 'agent-1',
    host: 'test-host',
    user: 'test-user',
    role: 'worker' as const
  };

  const payload = {
    event: 'clipboard_sync' as const
  };

  const text = 'Multi-line\nClipboard\nContent';
  const frame = createFrame(context, payload, text);

  assert.equal(frame.A.agent_id, 'agent-1');
  assert.equal(frame.A.role, 'worker');
  assert.equal(frame.B.event, 'clipboard_sync');
  assert.equal(frame.C, text);
  assert.equal(frame.B.hash, calculateHash(text));

  const parsed = parseFrame(JSON.stringify(frame));
  assert.equal(parsed.A.agent_id, 'agent-1');
  assert.equal(parsed.C, text);
});

test('E2E Broker and Client Sync Syncing', async (t) => {
  // 1. Spawn Broker on test port
  console.log('Spawning Broker for integration testing...');
  const brokerProcess = fork('./dist/broker.js', [], {
    env: { ...process.env, ABC_PORT: TEST_PORT.toString() }
  });

  // Wait for broker to start up
  await delay(1000);

  // Define client helper
  const connectClient = (agentId: string, role: 'orchestrator' | 'worker'): Promise<{ ws: WebSocket, messages: ABCFrame[] }> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      const messages: ABCFrame[] = [];

      ws.on('open', () => {
        // Send handshake
        const handshake = createFrame(
          { agent_id: agentId, host: 'localhost', user: 'aaron', role },
          { event: 'handshake', content: 'test-bridge' },
          ''
        );
        ws.send(JSON.stringify(handshake));
      });

      ws.on('message', (data) => {
        const frame = parseFrame(data.toString());
        messages.push(frame);
      });

      ws.on('error', reject);

      // Wait a bit to ensure handshake resolves
      setTimeout(() => {
        resolve({ ws, messages });
      }, 300);
    });
  };

  await t.test('Client Handshake and Initial Sync state', async () => {
    const { ws, messages } = await connectClient('worker-1', 'worker');

    assert.ok(messages.length >= 1, 'Should receive at least handshake response');
    const handshakeAck = messages[0];
    assert.equal(handshakeAck.B.event, 'system_message');
    assert.equal(handshakeAck.B.message_type, 'status');
    assert.equal(handshakeAck.B.content, 'Handshake complete');

    ws.close();
  });

  await t.test('Multi-client Clipboard Propagation and Loop Prevention', async () => {
    const client1 = await connectClient('worker-1', 'worker');
    const client2 = await connectClient('worker-2', 'worker');

    // Reset messages
    client1.messages.length = 0;
    client2.messages.length = 0;

    // Send clipboard sync from Client 1
    const testPayload = 'Sync Message 123';
    const syncFrame = createFrame(
      { agent_id: 'worker-1', host: 'localhost', user: 'aaron', role: 'worker' },
      { event: 'clipboard_sync' },
      testPayload
    );
    client1.ws.send(JSON.stringify(syncFrame));

    // Wait for propagation
    await delay(300);

    // Client 1 should NOT receive its own message back (loop prevention)
    const client1Syncs = client1.messages.filter(m => m.B.event === 'clipboard_sync');
    assert.equal(client1Syncs.length, 0, 'Client 1 should not receive its own copy event');

    // Client 2 should receive the clipboard sync
    const client2Syncs = client2.messages.filter(m => m.B.event === 'clipboard_sync');
    assert.equal(client2Syncs.length, 1, 'Client 2 should receive the copied clipboard value');
    assert.equal(client2Syncs[0].C, testPayload);

    client1.ws.close();
    client2.ws.close();
  });

  await t.test('Duplicate Orchestrator Warning Trigger', async () => {
    const orch1 = await connectClient('orchestrator-1', 'orchestrator');
    const orch2 = await connectClient('orchestrator-2', 'orchestrator');

    await delay(200);

    // Orchestrator 2 should receive a duplicate warning
    const warnings = orch2.messages.filter(m => m.B.event === 'system_message' && m.B.message_type === 'warning');
    assert.equal(warnings.length, 1, 'Orchestrator 2 should receive a warning');
    assert.match(warnings[0].B.content || '', /orchestrator is already active/);

    orch1.ws.close();
    orch2.ws.close();
  });

  // Clean up broker
  brokerProcess.kill();
  await delay(500);
});
