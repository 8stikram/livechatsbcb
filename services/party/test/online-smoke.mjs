// Checks a deployed service with real traffic. It creates one party and removes it afterwards.
// Usage: node test/online-smoke.mjs https://your-service.workers.dev
const base = process.argv[2];
if (!base) throw new Error('Pass the service URL');

const SUBPROTOCOL = 'livechatsbcb.v1';
const IDLE_MS = 25_000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
};

const post = async (path, body, token) => {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

class Member {
  messages = [];
  closingAt = null;
  closedAt = null;
  closeCode = null;

  constructor(session) {
    this.session = session;
    this.socket = new WebSocket(`${base.replace(/^http/, 'ws')}/v1/parties/${session.partyId}/ws`, [
      SUBPROTOCOL,
      `token.${session.token}`,
    ]);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      this.messages.push({ ...message, at: Date.now() });
      if (message.t === 'closing') this.closingAt = Date.now();
    });
    this.socket.addEventListener('close', (event) => {
      this.closedAt = Date.now();
      this.closeCode = event.code;
    });
    this.socket.addEventListener('error', () => {});
    this.keepAlive = setInterval(() => {
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send('{"t":"ping"}');
    }, 3_000);
  }

  latestOnline() {
    const latest = this.messages.findLast((message) => message.members);
    return latest ? latest.members.filter((member) => member.online).length : -1;
  }

  stop() {
    clearInterval(this.keepAlive);
    this.socket.close();
  }
}

const waitFor = async (predicate, timeoutMs = 10_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return Date.now() - started;
    await sleep(25);
  }
  return null;
};

// A new workers.dev name can take a few minutes to appear in DNS.
const deadline = Date.now() + 240_000;
for (;;) {
  try {
    if ((await fetch(`${base}/v1/health`)).ok) break;
  } catch {
    // Not reachable yet.
  }
  if (Date.now() > deadline) throw new Error('Service not reachable after 4 minutes');
  await sleep(3_000);
}
check('service reachable', true);

let started = Date.now();
const created = await post('/v1/parties', { name: 'Smoke host' });
check('party created', created.status === 201, `${Date.now() - started} ms`);
const host = created.body;

started = Date.now();
const joined = await post('/v1/join', { code: host.code.toLowerCase(), name: 'Smoke guest' });
check('party joined', joined.status === 200, `${Date.now() - started} ms`);
const guest = joined.body;

check('unknown code refused', (await post('/v1/join', { code: 'ZZZZZZ', name: 'X' })).status === 404);

const hostMember = new Member(host);
started = Date.now();
check('host welcomed', (await waitFor(() => hostMember.messages.some((m) => m.t === 'welcome'))) !== null, `${Date.now() - started} ms`);

const guestMember = new Member(guest);
const seenTwo = await waitFor(() => hostMember.latestOnline() === 2);
check('host sees guest online', seenTwo !== null, `${seenTwo} ms`);

// Round trip through the keep-alive answered by Cloudflare.
const pongsBefore = hostMember.messages.filter((m) => m.t === 'pong').length;
started = Date.now();
hostMember.socket.send('{"t":"ping"}');
const pong = await waitFor(() => hostMember.messages.filter((m) => m.t === 'pong').length > pongsBefore);
check('keep-alive answered', pong !== null, `${Date.now() - started} ms round trip`);

console.log(`     idling ${IDLE_MS / 1000} s so the party hibernates…`);
await sleep(IDLE_MS);

const rotated = await post(`/v1/parties/${host.partyId}/rotate-code`, {}, host.token);
check('code rotated after idle', rotated.status === 200);
const newCode = rotated.body.code;
const told = await waitFor(() => guestMember.messages.some((m) => m.t === 'code' && m.code === newCode));
check('guest told of the new code after idle', told !== null, `${told} ms`);
check('old code refused', (await post('/v1/join', { code: host.code, name: 'X' })).status === 404);

console.log(`     idling ${IDLE_MS / 1000} s again…`);
await sleep(IDLE_MS);

clearInterval(guestMember.keepAlive);
guestMember.socket.close();
const seenOne = await waitFor(() => hostMember.latestOnline() === 1);
check('host sees guest leave after idle', seenOne !== null, `${seenOne} ms`);

const reconnected = new Member(guest);
const seenTwoAgain = await waitFor(() => hostMember.latestOnline() === 2);
check('guest comes back with its saved token', seenTwoAgain !== null, `${seenTwoAgain} ms`);

const replacement = new Member(guest);
await waitFor(() => replacement.messages.some((m) => m.t === 'welcome'));
const closing = await waitFor(() => reconnected.closingAt !== null);
const closedEvent = await waitFor(() => reconnected.closedAt !== null, 5_000);
check('replaced connection receives the closing message', closing !== null, `${closing} ms`);
console.log(`     information: standard close event ${closedEvent === null ? 'not seen within 5 s' : `seen, code ${reconnected.closeCode}`}`);
replacement.stop();
reconnected.stop();

const intruder = new Member({ partyId: host.partyId, token: 'wrong' });
await waitFor(() => intruder.closedAt !== null);
check('bad token refused', intruder.closeCode === 4001, `code ${intruder.closeCode}`);
intruder.stop();

check('guest leaves', (await post(`/v1/parties/${guest.partyId}/leave`, {}, guest.token)).status === 204);
check('host leaves', (await post(`/v1/parties/${host.partyId}/leave`, {}, host.token)).status === 204);
hostMember.stop();
check('code freed with the last member', (await post('/v1/join', { code: newCode, name: 'X' })).status === 404);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
