import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const TEST_PORT = 8799;

// Runs the real Worker in the local Cloudflare runtime, with fresh state in a throwaway folder.
export default async function setup() {
  const stateDir = resolve('.wrangler', `test-state-${Date.now()}`);
  const wrangler = resolve('..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const child = spawn(
    process.execPath,
    [wrangler, 'dev', '--port', String(TEST_PORT), '--ip', '127.0.0.1', '--persist-to', stateDir],
    { stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } },
  );

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/v1/health`);
      if (response.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`wrangler dev did not start:\n${output}`);
    }
    await new Promise((done) => setTimeout(done, 300));
  }

  return () => {
    // wrangler starts the runtime as a child process, so on Windows the whole tree has to go.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill();
  };
}
