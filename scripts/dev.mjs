import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function spawnProcess(name, colorCode, cwd, command, args) {
  const proc = spawn(command, args, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const prefix = `\x1b[${colorCode}m[${name}]\x1b[0m `;

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((line, idx) => {
      if (line || idx < lines.length - 1) {
        process.stdout.write(`${prefix}${line}\n`);
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((line, idx) => {
      if (line || idx < lines.length - 1) {
        process.stderr.write(`${prefix}${line}\n`);
      }
    });
  });

  return proc;
}

console.log('\x1b[35m✨ Starting Faisaa Full-Stack Application (Server + Client)...\x1b[0m');

const serverProc = spawnProcess(
  'SERVER',
  '36',
  path.join(rootDir, 'server'),
  'npm',
  ['run', 'dev']
);

const clientProc = spawnProcess(
  'CLIENT',
  '35',
  path.join(rootDir, 'client'),
  'npm',
  ['run', 'dev']
);

function shutdown() {
  serverProc.kill();
  clientProc.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
