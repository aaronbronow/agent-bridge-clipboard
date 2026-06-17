import test from 'node:test';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { WebSocket } from 'ws';
import { parseFrame, createFrame, ABCFrame } from '../scripts/abc-protocol.js';

const TEST_PORT = 4226;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('Orchestrator and Worker E2E Routing and Control Suite', async (t) => {
  // 1. Spawn Broker on test port
  console.log('Spawning Broker for orchestrator-worker integration testing...');
  const brokerProcess = fork('./dist/scripts/broker.js', [], {
    env: { ...process.env, ABC_PORT: TEST_PORT.toString() }
  });

  // Wait for broker to start up
  await delay(1000);

  // Helper to connect clients
  const connectClient = (agentId: string, role: 'orchestrator' | 'worker', host = 'localhost', user = 'aaron'): Promise<{ ws: WebSocket, messages: ABCFrame[] }> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      const messages: ABCFrame[] = [];

      ws.on('open', () => {
        // Send handshake
        const handshake = createFrame(
          { agent_id: agentId, host, user, role },
          { event: 'handshake', content: 'orch-worker-bridge' },
          ''
        );
        ws.send(JSON.stringify(handshake));
      });

      ws.on('message', (data) => {
        const frame = parseFrame(data.toString());
        messages.push(frame);
      });

      ws.on('error', reject);

      // Wait to ensure handshake completes
      setTimeout(() => {
        resolve({ ws, messages });
      }, 300);
    });
  };

  // 1. Handshake and Registration Test
  await t.test('Register Orchestrator and PowerShell Worker', async () => {
    const orchestrator = await connectClient('orchestrator-1', 'orchestrator');
    // Simulate PowerShell worker on Windows
    const worker = await connectClient('worker-powershell', 'worker', 'windows-surface', 'win-user');

    assert.equal(orchestrator.messages.length, 1);
    assert.equal(orchestrator.messages[0].B.event, 'system_message');
    assert.equal(orchestrator.messages[0].B.content, 'Handshake complete');

    assert.equal(worker.messages.length, 1);
    assert.equal(worker.messages[0].B.event, 'system_message');
    assert.equal(worker.messages[0].B.content, 'Handshake complete');

    orchestrator.ws.close();
    worker.ws.close();
  });

  // 2. Orchestrator to Worker Targeted Messaging
  await t.test('Orchestrator to Worker Targeted Messaging', async () => {
    const orchestrator = await connectClient('orchestrator-1', 'orchestrator');
    const worker = await connectClient('worker-powershell', 'worker', 'windows-surface', 'win-user');

    orchestrator.messages.length = 0;
    worker.messages.length = 0;

    // Orchestrator sends command to PowerShell worker
    const commandText = 'Get-Process | Select-Object -First 5';
    const commandFrame = createFrame(
      { agent_id: 'orchestrator-1', host: 'localhost', user: 'aaron', role: 'orchestrator' },
      { event: 'agent_message', recipient: 'worker-powershell', message_type: 'prompt', content: commandText },
      ''
    );
    orchestrator.ws.send(JSON.stringify(commandFrame));

    await delay(300);

    // Worker should receive the message
    const workerMsgs = worker.messages.filter(m => m.B.event === 'agent_message');
    assert.equal(workerMsgs.length, 1, 'Worker should receive the message');
    assert.equal(workerMsgs[0].B.content, commandText);
    assert.equal(workerMsgs[0].A.agent_id, 'orchestrator-1');

    // Orchestrator should NOT receive it (targeted message, not broadcast)
    const orchMsgs = orchestrator.messages.filter(m => m.B.event === 'agent_message');
    assert.equal(orchMsgs.length, 0, 'Orchestrator should not receive its own targeted message');

    orchestrator.ws.close();
    worker.ws.close();
  });

  // 3. Worker to Orchestrator Role-Based Routing
  await t.test('Worker to Orchestrator Routing', async () => {
    const orchestrator = await connectClient('orchestrator-1', 'orchestrator');
    const worker = await connectClient('worker-powershell', 'worker', 'windows-surface', 'win-user');

    orchestrator.messages.length = 0;
    worker.messages.length = 0;

    // PowerShell Worker sends response back to the orchestrator role
    const resultText = 'Process list data...';
    const responseFrame = createFrame(
      { agent_id: 'worker-powershell', host: 'windows-surface', user: 'win-user', role: 'worker' },
      { event: 'agent_message', recipient: 'orchestrator', message_type: 'result', content: resultText },
      ''
    );
    worker.ws.send(JSON.stringify(responseFrame));

    await delay(300);

    // Orchestrator should receive the response
    const orchMsgs = orchestrator.messages.filter(m => m.B.event === 'agent_message');
    assert.equal(orchMsgs.length, 1, 'Orchestrator should receive response routed by role');
    assert.equal(orchMsgs[0].B.content, resultText);
    assert.equal(orchMsgs[0].A.agent_id, 'worker-powershell');

    // Worker should NOT receive it
    const workerMsgs = worker.messages.filter(m => m.B.event === 'agent_message');
    assert.equal(workerMsgs.length, 0, 'Worker should not receive its own message');

    orchestrator.ws.close();
    worker.ws.close();
  });

  // 4. Control Signals Routing (e.g., Abort)
  await t.test('Orchestrator to Worker Control Abort Signal', async () => {
    const orchestrator = await connectClient('orchestrator-1', 'orchestrator');
    const worker = await connectClient('worker-powershell', 'worker', 'windows-surface', 'win-user');

    orchestrator.messages.length = 0;
    worker.messages.length = 0;

    // Send Abort control signal to powershell worker
    const abortFrame = createFrame(
      { agent_id: 'orchestrator-1', host: 'localhost', user: 'aaron', role: 'orchestrator' },
      { event: 'agent_control', recipient: 'worker-powershell', message_type: 'abort' },
      ''
    );
    orchestrator.ws.send(JSON.stringify(abortFrame));

    await delay(300);

    // Worker should receive abort control signal
    const workerControls = worker.messages.filter(m => m.B.event === 'agent_control');
    assert.equal(workerControls.length, 1, 'Worker should receive abort signal');
    assert.equal(workerControls[0].B.message_type, 'abort');

    orchestrator.ws.close();
    worker.ws.close();
  });

  // 5. Routing Errors - No Orchestrator
  await t.test('Error when routing to non-existent orchestrator', async () => {
    const worker = await connectClient('worker-powershell', 'worker', 'windows-surface', 'win-user');

    worker.messages.length = 0;

    // Worker attempts to message orchestrator role, but none connected
    const msgFrame = createFrame(
      { agent_id: 'worker-powershell', host: 'windows-surface', user: 'win-user', role: 'worker' },
      { event: 'agent_message', recipient: 'orchestrator', message_type: 'result', content: 'hello' },
      ''
    );
    worker.ws.send(JSON.stringify(msgFrame));

    await delay(300);

    // Worker should receive error system message
    const errorMsgs = worker.messages.filter(m => m.B.event === 'system_message' && m.B.message_type === 'error');
    assert.equal(errorMsgs.length, 1, 'Should receive routing error');
    assert.match(errorMsgs[0].B.content || '', /No active orchestrator/);

    worker.ws.close();
  });

  // 6. Routing Errors - Target Agent Not Found
  await t.test('Error when routing to non-existent specific agent', async () => {
    const orchestrator = await connectClient('orchestrator-1', 'orchestrator');

    orchestrator.messages.length = 0;

    // Orchestrator messages non-existent agent
    const msgFrame = createFrame(
      { agent_id: 'orchestrator-1', host: 'localhost', user: 'aaron', role: 'orchestrator' },
      { event: 'agent_message', recipient: 'non-existent-worker', message_type: 'prompt', content: 'hello' },
      ''
    );
    orchestrator.ws.send(JSON.stringify(msgFrame));

    await delay(300);

    // Orchestrator should receive error system message
    const errorMsgs = orchestrator.messages.filter(m => m.B.event === 'system_message' && m.B.message_type === 'error');
    assert.equal(errorMsgs.length, 1, 'Should receive target not found error');
    assert.match(errorMsgs[0].B.content || '', /Target agent "non-existent-worker" not found/);

    orchestrator.ws.close();
  });

  // Clean up broker
  brokerProcess.kill();
  await delay(500);
});
