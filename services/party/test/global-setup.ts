import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FAKE_DISCORD } from './fake-discord';

const TEST_PORT = 8799;
// A second copy where everything happens within seconds, so that what normally takes a day can be tested.
const SHORT_RETENTION_PORT = 8798;

// Runs the real Worker in the local Cloudflare runtime, with fresh state in a throwaway folder.
export default async function setup() {
  const stateDir = resolve('.wrangler', `test-state-${Date.now()}`);
  const wrangler = resolve('..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

  mkdirSync(stateDir, { recursive: true });
  const seeds: Record<string, string> = {
    'latest.yml': 'version: 9.9.9\npath: LiveChatSBCB-Setup-9.9.9.exe\nsha512: fake\n',
    'LiveChatSBCB-Setup-9.9.9.exe': 'fake installer',
    'private.txt': 'must not be served',
  };
  for (const [key, content] of Object.entries(seeds)) {
    const seedFile = join(stateDir, `seed-${key}`);
    writeFileSync(seedFile, content);
    spawnSync(
      process.execPath,
      [wrangler, 'r2', 'object', 'put', `livechatsbcb-updates/${key}`, '--file', seedFile, '--local', '--persist-to', stateDir],
      { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } },
    );
  }

  const start = async (port: number, inspectorPort: number, persistTo: string, extraArgs: string[] = []) => {
    const child = spawn(
      process.execPath,
      [
        wrangler,
        'dev',
        '--port',
        String(port),
        '--inspector-port',
        String(inspectorPort),
        '--ip',
        '127.0.0.1',
        '--persist-to',
        persistTo,
        ...extraArgs,
      ],
      { stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } },
    );

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    const deadline = Date.now() + 90_000;
    for (;;) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
        if (response.ok) return child;
      } catch {
        // Not listening yet.
      }
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`wrangler dev did not start:\n${output}`);
      }
      await new Promise((done) => setTimeout(done, 300));
    }
  };

  // The tests start the stand-in for Discord themselves, as they need to change what it says.
  const discord = [
    '--var',
    `DISCORD_API_URL:${FAKE_DISCORD.url}`,
    '--var',
    `DISCORD_CLIENT_ID:${FAKE_DISCORD.clientId}`,
    '--var',
    `DISCORD_CLIENT_SECRET:${FAKE_DISCORD.clientSecret}`,
  ];
  const children = [
    await start(TEST_PORT, 9239, stateDir, discord),
    // Also notices within a second what Discord says, instead of within 5 minutes.
    await start(SHORT_RETENTION_PORT, 9238, `${stateDir}-short`, [
      ...discord,
      '--var',
      'MEDIA_RETENTION_MS:1500',
      '--var',
      'DISCORD_REFRESH_MS:1000',
    ]),
  ];

  return () => {
    for (const child of children) {
      // wrangler starts the runtime as a child process, so on Windows the whole tree has to go.
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill();
    }
  };
}
