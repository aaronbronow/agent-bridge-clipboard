import { WebSocket } from 'ws';
import { parseFrame, createFrame, ABCFrame } from '../scripts/abc-protocol.js';

// Parse arguments
const brokerUrl = process.argv.find(a => a.startsWith('--broker='))?.split('=')[1] || process.env.ABC_BROKER || 'ws://localhost:4224';
const targetAgentId = process.argv.find(a => a.startsWith('--target-agent='))?.split('=')[1] || 'surface95-agent';
const bridgeName = process.argv.find(a => a.startsWith('--bridge='))?.split('=')[1] || 'agent-bridge-clipboard-aaron';

console.log('\n--- ABC Live Agent E2E Tester ---');
console.log(`Broker URL   : ${brokerUrl}`);
console.log(`Bridge Name  : ${bridgeName}`);
console.log(`Target Agent : ${targetAgentId}`);
console.log('---------------------------------\n');

const ws = new WebSocket(brokerUrl);
let testPassed = true;
let handshakeCompleted = false;

ws.on('open', () => {
  console.log('[Connection] Connected to broker. Sending handshake...');
  const handshake = createFrame(
    { agent_id: 'orchestrator-live-test', host: 'localhost', user: 'tester', role: 'orchestrator' },
    { event: 'handshake', content: bridgeName },
    ''
  );
  ws.send(JSON.stringify(handshake));
});

ws.on('message', async (data) => {
  try {
    const frame = parseFrame(data.toString());
    const { event, message_type, content } = frame.B;

    if (event === 'system_message') {
      if (message_type === 'status' && content === 'Handshake complete') {
        handshakeCompleted = true;
        console.log('✔ Handshake completed successfully!');
        
        // Execute the E2E verification steps
        await runLiveVerification();
      } else if (message_type === 'error') {
        console.error(`✖ System Error from Broker: ${content}`);
        testPassed = false;
        cleanupAndExit();
      } else if (message_type === 'warning') {
        console.warn(`⚠ System Warning from Broker: ${content}`);
      }
    }
  } catch (err: any) {
    console.error(`[Error] Failed to parse message: ${err.message}`);
  }
});

ws.on('error', (err) => {
  console.error(`✖ Connection Error: ${err.message}`);
  testPassed = false;
  process.exit(1);
});

ws.on('close', () => {
  console.log('[Connection] Closed.');
});

async function runLiveVerification() {
  console.log(`\nVerifying live client connection to "${targetAgentId}"...`);
  
  // Step 1: Send a targeted test message (agent_message)
  const testMessage = `Hello ${targetAgentId}! This is a live E2E test message sent from the Orchestrator on VM.`;
  console.log(`[Step 1] Sending targeted message to "${targetAgentId}"...`);
  const msgFrame = createFrame(
    { agent_id: 'orchestrator-live-test', host: 'localhost', user: 'tester', role: 'orchestrator' },
    { event: 'agent_message', recipient: targetAgentId, message_type: 'prompt', content: testMessage },
    ''
  );
  ws.send(JSON.stringify(msgFrame));

  // Step 2: Send a control abort signal (agent_control)
  console.log(`[Step 2] Sending control abort signal to "${targetAgentId}"...`);
  const abortFrame = createFrame(
    { agent_id: 'orchestrator-live-test', host: 'localhost', user: 'tester', role: 'orchestrator' },
    { event: 'agent_control', recipient: targetAgentId, message_type: 'abort' },
    ''
  );
  ws.send(JSON.stringify(abortFrame));

  // Step 3: Broadcast a clipboard sync update
  const testClipboardText = `ABC-LIVE-E2E-TEST-SYNC-${Math.floor(Math.random() * 10000)}`;
  console.log(`[Step 3] Broadcasting clipboard sync with text: "${testClipboardText}"`);
  const syncFrame = createFrame(
    { agent_id: 'orchestrator-live-test', host: 'localhost', user: 'tester', role: 'orchestrator' },
    { event: 'clipboard_sync' },
    testClipboardText
  );
  ws.send(JSON.stringify(syncFrame));

  // Wait 2 seconds to make sure no error system messages come back from broker
  console.log('\nWaiting for broker routing confirmation...');
  setTimeout(() => {
    if (testPassed) {
      console.log('\n🎉 E2E Live Test Passed Successfully!');
      console.log('------------------------------------');
      console.log(`Verify the following logs in your "${targetAgentId}" terminal window:`);
      console.log(`1. A message from orchestrator-live-test containing: "${testMessage}"`);
      console.log('2. An abort warning: "[ABORT SIGNAL RECEIVED] Stopping active tasks..."');
      console.log(`3. A clipboard update alert for: "${testClipboardText}"`);
      console.log('------------------------------------\n');
    }
    cleanupAndExit();
  }, 2000);
}

function cleanupAndExit() {
  ws.close();
  process.exit(testPassed ? 0 : 1);
}
