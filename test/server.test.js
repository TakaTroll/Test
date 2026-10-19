// Integration tests: boots a real server on a temp data dir and drives it
// over REST + Socket.IO like the browser client does.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-test-'));
let server;
const sockets = [];

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT, XP_DATA_DIR: dataDir, ANTHROPIC_API_KEY: '' },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  for (const s of sockets) s.disconnect();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function post(p, body, token) {
  const res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function client(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  const events = [];
  s.onAny((ev, data) => events.push([ev, data]));
  const boot = await new Promise((resolve, reject) => { s.once('bootstrap', resolve); s.once('connect_error', reject); });
  const req = (name, payload = {}) => new Promise((resolve) => s.emit('req', name, payload, resolve));
  const call = async (name, payload) => {
    const r = await req(name, payload);
    if (r.error) throw new Error(r.error);
    return r.data;
  };
  const waitFor = (ev, pred = () => true, ms = 2000) => new Promise((resolve, reject) => {
    const hit = events.find(([e, d]) => e === ev && pred(d));
    if (hit) return resolve(hit[1]);
    const t = setTimeout(() => { s.off(ev, h); reject(new Error(`timeout waiting for ${ev}`)); }, ms);
    const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });
  return { s, boot, req, call, events, waitFor };
}

async function register(username) {
  const r = await post('/api/register', { username, password: 'password1', displayName: username });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, user: r.body.user, ...(await client(r.body.token)) };
}

let alice, bob, guest, prId;

test('accounts and guests', async () => {
  alice = await register('alice');
  bob = await register('bob');
  const dup = await post('/api/register', { username: 'alice', password: 'password1' });
  assert.equal(dup.status, 400);
  const bad = await post('/api/login', { username: 'alice', password: 'nope' });
  assert.equal(bad.status, 400);
  const ok = await post('/api/login', { username: 'alice', password: 'password1' });
  assert.equal(ok.status, 200);

  const g = await post('/api/guest', { displayName: 'Ghosty' });
  assert.equal(g.status, 200);
  assert.equal(g.body.user.isGuest, true);
  guest = { token: g.body.token, user: g.body.user, ...(await client(g.body.token)) };
  // Bots are present for everyone.
  assert.ok(alice.boot.users.some((u) => u.id === 'bot_dicey' && u.isBot));
});

test('guests cannot create playrooms but can claim their account', async () => {
  const r = await guest.req('playroom.create', { blueprint: { name: 'Nope' } });
  assert.match(r.error, /claim/i);
  const up = await post('/api/upgrade', { username: 'casper', password: 'password1' }, guest.token);
  assert.equal(up.status, 200);
  assert.equal(up.body.user.isGuest, false);
  assert.equal(up.body.user.username, 'casper');
});

test('AI assistant builds a blueprint and a playroom from it', async () => {
  const r = await post('/api/ai/playroom', { prompt: 'A cozy "Block Party" Minecraft server for builders' }, alice.token);
  assert.equal(r.status, 200);
  const bp = r.body.blueprint;
  assert.equal(bp.name, 'Block Party');
  assert.ok(bp.categories.length >= 3);
  assert.ok(bp.roles.some((x) => x.permissions.includes('ADMINISTRATOR')));
  assert.ok(bp.tags.includes('minecraft'));
  const { id } = await alice.call('playroom.create', { blueprint: bp });
  prId = id;
  const pr = await alice.waitFor('playroom', (p) => p.id === id);
  assert.equal(pr.ownerId, alice.user.id);
  assert.ok(pr.channels.length >= 5);
});

test('discovery lists public playrooms and members can join', async () => {
  const res = await fetch(`${BASE}/api/discover?q=block`, { headers: { Authorization: `Bearer ${bob.token}` } });
  const { playrooms } = await res.json();
  assert.ok(playrooms.some((p) => p.id === prId));
  await bob.call('playroom.join', { id: prId });
  const pr = await bob.waitFor('playroom', (p) => p.id === prId);
  assert.ok(pr.members[bob.user.id]);
});

test('messages, reactions, edits and bot commands', async () => {
  const pr = await alice.waitFor('playroom', (p) => p.id === prId && p.members[bob.user.id]);
  const general = pr.channels.find((c) => c.name === 'general');
  const msg = await bob.call('message.send', { channelId: general.id, content: 'hello **world**' });
  const seen = await alice.waitFor('message', (m) => m.id === msg.id);
  assert.equal(seen.content, 'hello **world**');
  await alice.call('message.react', { channelId: general.id, messageId: msg.id, emoji: '💗' });
  const upd = await bob.waitFor('message:update', (m) => m.id === msg.id && m.reactions['💗']);
  assert.deepEqual(upd.reactions['💗'], [alice.user.id]);
  const edit = await alice.req('message.edit', { channelId: general.id, messageId: msg.id, content: 'hacked' });
  assert.ok(edit.error, 'cannot edit someone else\'s message');

  await alice.call('playroom.bots', { prId, botId: 'bot_dicey', add: true });
  await bob.call('message.send', { channelId: general.id, content: '!roll 3d6' });
  const roll = await bob.waitFor('message', (m) => m.authorId === 'bot_dicey' && /rolled 3d6/.test(m.embed?.title || ''));
  assert.ok(roll.embed.description);
});

test('roles, permissions and hierarchy', async () => {
  let pr = await alice.waitFor('playroom', (p) => p.id === prId);
  const modRole = pr.roles.find((r) => r.name === 'Moderator');
  const adminRole = pr.roles.find((r) => r.name === 'Admin');
  // Bob has no MANAGE_ROLES.
  assert.ok((await bob.req('role.create', { prId, name: 'Sneaky' })).error);
  // Give Bob moderator; he can now kick lower members but not touch Admin.
  await alice.call('member.roles', { prId, userId: bob.user.id, roleId: modRole.id, add: true });
  const { id: caspId } = { id: guest.user.id };
  await guest.call('playroom.join', { id: prId });
  const kick = await bob.req('member.kick', { prId, userId: alice.user.id });
  assert.match(kick.error, /hierarchy|owner/i);
  // Moderator can timeout a plain member.
  await bob.call('member.timeout', { prId, userId: caspId, minutes: 5 });
  pr = await guest.waitFor('playroom', (p) => p.id === prId && p.members[caspId]?.timeoutUntil > Date.now());
  const general = pr.channels.find((c) => c.name === 'general');
  const blocked = await guest.req('message.send', { channelId: general.id, content: 'can I talk?' });
  assert.match(blocked.error, /timed out/i);
  // Bob can't grant himself a role above his own.
  const self = await bob.req('member.roles', { prId, userId: bob.user.id, roleId: adminRole.id, add: true });
  assert.ok(self.error);
  // Role moving respects hierarchy: owner can move Moderator above Admin.
  await alice.call('role.move', { prId, id: modRole.id, direction: 1 });
  pr = await alice.waitFor('playroom', (p) => p.id === prId && p.roles.find((r) => r.id === modRole.id).position > p.roles.find((r) => r.id === adminRole.id).position);
  assert.ok(pr);
});

test('automod blocks rule-breaking messages when enabled', async () => {
  await alice.call('automod.update', { prId, automod: { enabled: true, exemptAdmins: true, rules: { bannedWords: { enabled: true, words: ['pineapple*'] }, caps: { enabled: true } } } });
  const pr = await alice.waitFor('playroom', (p) => p.id === prId && p.automod.enabled && p.automod.rules?.bannedWords.words.includes('pineapple*'));
  const general = pr.channels.find((c) => c.name === 'general');
  // Bob is a moderator → exempt; demote him first.
  const modRole = pr.roles.find((r) => r.name === 'Moderator');
  await alice.call('member.roles', { prId, userId: bob.user.id, roleId: modRole.id, add: false });
  await bob.waitFor('playroom', (p) => p.id === prId && !p.members[bob.user.id].roles.includes(modRole.id));
  const r1 = await bob.req('message.send', { channelId: general.id, content: 'I love pineapples on pizza' });
  assert.match(r1.error, /Automod/);
  const r2 = await bob.req('message.send', { channelId: general.id, content: 'THIS IS VERY LOUD TEXT RIGHT HERE' });
  assert.match(r2.error, /Automod/);
  const r3 = await bob.req('message.send', { channelId: general.id, content: 'a perfectly fine message' });
  assert.ok(r3.ok);
  await alice.call('automod.update', { prId, automod: { enabled: false } });
  await alice.waitFor('playroom', (p) => p.id === prId && !p.automod.enabled);
  const r4 = await bob.req('message.send', { channelId: general.id, content: 'pineapple again' });
  assert.ok(r4.ok, 'automod off lets it through');
});

test('private channels are hidden from members without the role', async () => {
  const { id: roleId } = await alice.call('role.create', { prId, name: 'VIP' });
  const { id: chId } = await alice.call('channel.create', { prId, name: 'vip lounge' });
  await alice.call('channel.update', { prId, id: chId, patch: { viewRoles: [roleId] } });
  const pr = await bob.waitFor('playroom', (p) => p.id === prId && p.roles.some((r) => r.id === roleId) && !p.channels.some((c) => c.id === chId));
  assert.ok(pr);
  assert.ok((await bob.req('messages.fetch', { channelId: chId })).error);
  await alice.call('member.roles', { prId, userId: bob.user.id, roleId, add: true });
  await bob.waitFor('playroom', (p) => p.id === prId && p.channels.some((c) => c.id === chId && c.name === 'vip-lounge'));
});

test('friends, DMs and group chats', async () => {
  await alice.call('friends.request', { username: 'bob' });
  await bob.waitFor('me', (m) => m.incoming.includes(alice.user.id));
  await bob.call('friends.accept', { userId: alice.user.id });
  await alice.waitFor('me', (m) => m.friends.includes(bob.user.id));
  const dm = await alice.call('dm.open', { userId: bob.user.id });
  const m = await alice.call('message.send', { channelId: dm.id, content: 'psst' });
  await bob.waitFor('message', (x) => x.id === m.id);
  const outsider = await guest.req('messages.fetch', { channelId: dm.id });
  assert.ok(outsider.error, 'non-members cannot read a DM');

  const group = await alice.call('group.create', { name: 'Squad', memberIds: [bob.user.id] });
  await bob.waitFor('conversation', (c) => c.id === group.id);
  await alice.call('conv.bots', { id: group.id, botId: 'bot_quizzy', add: true });
  await bob.call('message.send', { channelId: group.id, content: '!trivia' });
  const q = await bob.waitFor('message', (x) => x.channelId === group.id && x.authorId === 'bot_quizzy');
  assert.match(q.embed.description, /1\./);
});

test('settings: layouts, backgrounds and profile customization persist', async () => {
  await alice.call('me.update', {
    profile: { bio: 'hi', banner: { type: 'gradient', value: 'galaxy' }, decoration: 'hearts', nameStyle: 'rainbow', themeColors: ['#ff0000', '#00ff00'], links: [{ label: 'site', url: 'https://example.com' }, { label: 'bad', url: 'javascript:alert(1)' }] },
    settings: { layouts: { dm: 'compact' }, background: { key: 'abc', value: { type: 'preset', value: 'hearts', dim: 0.3 } }, theme: 'light', accent: '#ff2e88' },
  });
  const me = await alice.waitFor('me', (x) => x.settings.layouts.dm === 'compact');
  assert.equal(me.settings.backgrounds.abc.value, 'hearts');
  assert.equal(me.settings.theme, 'light');
  assert.equal(me.profile.nameStyle, 'rainbow');
  assert.equal(me.profile.links.length, 1, 'non-http links are dropped');
});
