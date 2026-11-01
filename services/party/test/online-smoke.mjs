// Checks a deployed service with real traffic. Joining anything takes a real Discord login, so this checks the doors.
// Usage: node test/online-smoke.mjs https://your-service.workers.dev
const base = process.argv[2];
if (!base) throw new Error('Pass the service URL');


let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
};

const post = async (path, body) => {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const health = await fetch(`${base}/v1/health`);
check('service reachable', health.ok);

check('no party without an account', (await post('/v1/parties', {})).status === 401);
check('no joining without an account', (await post('/v1/join', { code: 'ZZZZZZ' })).status === 401);
check('no server party without an account', (await post('/v1/guilds/100000000000000000/join', {})).status === 401);
check('no servers without an account', (await fetch(`${base}/v1/me`)).status === 401);

const started = await post('/v1/auth/start', { challenge: 'a'.repeat(43), port: 49152 });
check('login can start', started.status === 200, `status ${started.status}`);
if (started.status === 200) {
  const url = new URL(started.body.url);
  check('login goes to Discord', url.origin + url.pathname === 'https://discord.com/oauth2/authorize');
  check('login asks only who you are and your servers', url.searchParams.get('scope') === 'identify guilds');
  check('login names the app', /^\d{17,20}$/.test(url.searchParams.get('client_id') ?? ''));
  check('login comes back here', url.searchParams.get('redirect_uri') === `${base}/v1/auth/callback`);
}
check('login refuses a bad request', (await post('/v1/auth/start', { challenge: 'x', port: 1 })).status === 400);

const download = await fetch(`${base}/download`, { redirect: 'manual' });
check('download link answers', download.status < 400, `status ${download.status}`);
await download.body?.cancel();
check('privacy page answers', (await fetch(`${base}/privacy`)).ok);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
