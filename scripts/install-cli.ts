import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const isLink = args.includes('--link') || args.includes('-l');

const homeDir = os.homedir();
const pluginsDir = path.join(homeDir, '.gemini', 'config', 'plugins');
const targetDir = path.join(pluginsDir, 'abc');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(repoRoot, 'dist', 'antigravity-clipboard-bridge');

console.log('\n--- Agent Bridge Clipboard (ABC) Installer ---');

// 1. Ensure project is built
if (!fs.existsSync(sourceDir) || isLink) {
  console.log('Building project release files...');
  try {
    execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
  } catch (err: any) {
    console.error(`Failed to build project: ${err.message}`);
    process.exit(1);
  }
}

// 2. Ensure plugins directory exists
if (!fs.existsSync(pluginsDir)) {
  fs.mkdirSync(pluginsDir, { recursive: true });
}

// 3. Remove existing installation
try {
  // If it's a symlink (even broken), unlinkSync will remove it
  fs.unlinkSync(targetDir);
  console.log(`Removed existing link at ${targetDir}`);
} catch (e) {
  try {
    // If it's a directory, rmSync will remove it
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(`Removed existing directory at ${targetDir}`);
  } catch (err) {}
}

// 4. Perform installation (copy or link)
try {
  if (isLink) {
    console.log(`Linking ${sourceDir} -> ${targetDir}...`);
    fs.symlinkSync(sourceDir, targetDir, 'dir');
    console.log('Symlink created successfully!');
  } else {
    console.log(`Copying ${sourceDir} -> ${targetDir}...`);
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    console.log('Files copied successfully!');
  }
} catch (err: any) {
  console.error(`Installation failed: ${err.message}`);
  process.exit(1);
}

console.log('\n🎉 ABC Plugin successfully installed/linked!');
console.log(`Plugin location: ${targetDir}`);
console.log('\nTo get started:');
console.log('1. Restart your active agy session.');
console.log('2. The agent will now have the "/abc:copy" skill available.');
console.log('3. Ensure the broker is running (e.g., via Docker):');
console.log('   docker start abc-broker');
console.log('4. Ensure your background sync client is running in a shell:');
console.log('   node ~/.gemini/config/plugins/abc/skills/copy/client.js --role=worker --agent-id=my-agent');
console.log('--------------------------------------------\n');
