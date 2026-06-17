import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const distDir = path.join(repoRoot, 'dist');

// Read version from gemini-extension.json
const extensionJsonPath = path.join(repoRoot, 'gemini-extension.json');
const extensionJson = JSON.parse(fs.readFileSync(extensionJsonPath, 'utf8'));
const version = extensionJson.version;

console.log(`Building release v${version}...`);

// Helper to copy files safely
function copyFile(src: string, dest: string) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 1. Build the main agent-bridge-clipboard
console.log('Preparing agent-bridge-clipboard...');
const mainDist = path.join(distDir, 'agent-bridge-clipboard');
copyFile(path.join(repoRoot, 'SKILL.md'), path.join(mainDist, 'SKILL.md'));
copyFile(path.join(repoRoot, 'package.json'), path.join(mainDist, 'package.json'));
copyFile(path.join(repoRoot, 'gemini-extension.json'), path.join(mainDist, 'gemini-extension.json'));
copyFile(path.join(repoRoot, 'LICENSE'), path.join(mainDist, 'LICENSE'));
copyFile(path.join(repoRoot, 'GEMINI.md'), path.join(mainDist, 'GEMINI.md'));

// Copy copy.sh
copyFile(path.join(repoRoot, 'scripts', 'copy.sh'), path.join(mainDist, 'scripts', 'copy.sh'));
try {
  fs.chmodSync(path.join(mainDist, 'scripts', 'copy.sh'), 0o755);
} catch {}

// Copy compiled scripts
const compiledScriptsDir = path.join(distDir, 'scripts');
if (fs.existsSync(compiledScriptsDir)) {
  const files = fs.readdirSync(compiledScriptsDir);
  for (const file of files) {
    if (file.endsWith('.js')) {
      copyFile(path.join(compiledScriptsDir, file), path.join(mainDist, 'scripts', file));
    }
  }
}

// Copy commands
const commandsDir = path.join(repoRoot, 'commands', 'abc');
if (fs.existsSync(commandsDir)) {
  const files = fs.readdirSync(commandsDir);
  for (const file of files) {
    copyFile(path.join(commandsDir, file), path.join(mainDist, 'commands', 'abc', file));
  }
}

// 2. Build other discrete bridges
const skills = ['gemini-clipboard-bridge', 'claude-clipboard-bridge', 'copilot-clipboard-bridge'];
for (const skill of skills) {
  console.log(`Preparing ${skill}...`);
  const skillDist = path.join(distDir, skill);
  
  const skillSkillMd = path.join(repoRoot, 'skills', skill, 'SKILL.md');
  if (fs.existsSync(skillSkillMd)) {
    copyFile(skillSkillMd, path.join(skillDist, 'SKILL.md'));
  }
  
  copyFile(path.join(repoRoot, 'scripts', 'copy.sh'), path.join(skillDist, 'scripts', 'copy.sh'));
  try {
    fs.chmodSync(path.join(skillDist, 'scripts', 'copy.sh'), 0o755);
  } catch {}

  copyFile(path.join(distDir, 'scripts', 'abc-protocol.js'), path.join(skillDist, 'scripts', 'abc-protocol.js'));
  copyFile(path.join(distDir, 'scripts', 'send-clip.js'), path.join(skillDist, 'scripts', 'send-clip.js'));
}

// 3. Build the Antigravity-specific plugin structure
console.log('Preparing antigravity-clipboard-bridge...');
const agDist = path.join(distDir, 'antigravity-clipboard-bridge');
copyFile(path.join(repoRoot, 'skills', 'antigravity-clipboard-bridge', 'copy', 'SKILL.md'), path.join(agDist, 'skills', 'copy', 'SKILL.md'));
copyFile(path.join(repoRoot, 'skills', 'antigravity-clipboard-bridge', 'INSTRUCTIONS.md'), path.join(agDist, 'INSTRUCTIONS.md'));
copyFile(path.join(repoRoot, 'skills', 'antigravity-clipboard-bridge', 'plugin.json'), path.join(agDist, 'plugin.json'));

copyFile(path.join(repoRoot, 'scripts', 'copy.sh'), path.join(agDist, 'skills', 'copy', 'copy.sh'));
try {
  fs.chmodSync(path.join(agDist, 'skills', 'copy', 'copy.sh'), 0o755);
} catch {}

copyFile(path.join(distDir, 'scripts', 'abc-protocol.js'), path.join(agDist, 'skills', 'copy', 'abc-protocol.js'));
copyFile(path.join(distDir, 'scripts', 'send-clip.js'), path.join(agDist, 'skills', 'copy', 'send-clip.js'));
copyFile(path.join(distDir, 'scripts', 'send-msg.js'), path.join(agDist, 'skills', 'copy', 'send-msg.js'));
copyFile(path.join(distDir, 'scripts', 'listen-once.js'), path.join(agDist, 'skills', 'copy', 'listen-once.js'));

console.log('Build completed successfully!');
