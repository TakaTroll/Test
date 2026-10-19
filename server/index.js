// Xperiences server: REST for auth/uploads/discovery + Socket.IO for realtime.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const store = require('./db');
const perms = require('./permissions');
const automod = require('./automod');
const bots = require('./bots');
const ai = require('./ai');

const db = store.data;
const PORT = process.env.PORT || 3000;
const GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };
const now = () => Date.now();

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const AVATAR_COLORS = ['#ff4fa3', '#a66bff', '#4dabf7', '#20c997', '#ffb02e', '#ff6b6b', '#cc5de8', '#51cf66'];

function defaultProfile(displayName) {
  return {
    avatar: null,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatarEmoji: '',
    decoration: 'none',
    banner: { type: 'gradient', value: 'sunset' },
    themeColors: ['#ff4fa3', '#7b2ff7'],
    nameStyle: 'plain',
    nameColor: '',
    nameFont: 'default',
    bio: '',
    pronouns: '',
    customStatus: '',
    statusEmoji: '',
    mood: '',
    location: '',
    birthday: '',
    interests: [],
    favoriteGames: [],
    links: [],
    nowPlaying: '',
    showcase: [],
    cardEffect: 'none',
    displayName,
  };
}

function defaultSettings() {
  return {
    theme: 'dark',
    accent: '#ff4fa3',
    fontScale: 1,
    reduceMotion: false,
    layouts: { dm: 'bubbles', group: 'bubbles', playroom: 'classic' },
    backgrounds: {},
    privacy: { dmsFrom: 'everyone', friendRequests: 'everyone' },
    sounds: true,
    status: 'online',
    reads: {},
  };
}

function validUsername(u) {
  return typeof u === 'string' && /^[a-z0-9_.]{3,24}$/.test(u);
}

function findByUsername(username) {
  username = String(username || '').toLowerCase().replace(/^@/, '');
  return Object.values(db.users).find((u) => u.username === username && !u.deleted);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(user, password) {
  if (!user.passHash) return false;
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passHash, 'hex'));
}

function createUser({ username, displayName, password, isGuest = false, isBot = false, idOverride }) {
  const user = {
    id: idOverride || store.id('u_'),
    username,
    displayName: (displayName || username).slice(0, 32),
    isGuest,
    isBot,
    createdAt: now(),
    lastSeen: now(),
    profile: defaultProfile(displayName || username),
    settings: defaultSettings(),
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
  };
  if (password) {
    const { salt, hash } = hashPassword(password);
    user.salt = salt;
    user.passHash = hash;
  }
  db.users[user.id] = user;
  store.save();
  return user;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isGuest: !!u.isGuest,
    isBot: !!u.isBot,
    deleted: !!u.deleted,
    createdAt: u.createdAt,
    profile: u.profile,
    presence: presenceOf(u),
    bot: u.isBot ? botInfo(u.id) : undefined,
  };
}

function privateUser(u) {
  return { ...publicUser(u), settings: u.settings, friends: u.friends, incoming: u.incoming, outgoing: u.outgoing, blocked: u.blocked };
}

function botInfo(id) {
  const b = bots.BOTS.find((x) => x.id === id);
  return b ? { tagline: b.tagline, commands: b.commands, emoji: b.emoji } : undefined;
}

// Register all game bots as real users.
for (const b of bots.BOTS) {
  let u = db.users[b.id];
  if (!u) u = createUser({ username: b.username, displayName: b.displayName, isBot: true, idOverride: b.id });
  u.displayName = b.displayName;
  u.profile.avatarEmoji = b.emoji;
  u.profile.avatarColor = b.color;
  u.profile.bio = `${b.tagline}\n\nType **!help** in any chat I'm in.`;
  u.profile.themeColors = [b.color, '#1b1622'];
  u.profile.banner = { type: 'color', value: b.color };
}


// ---------------------------------------------------------------------------
// Presence & sockets
// ---------------------------------------------------------------------------
const online = new Map(); // userId -> Set(socketId)
function presenceOf(u) {
  if (u.isBot) return 'online';
  if (!online.has(u.id)) return 'offline';
  const s = u.settings?.status || 'online';
  return s === 'invisible' ? 'offline' : s;
}

let io;
const toUser = (userId, ev, data) => io.to(`user:${userId}`).emit(ev, data);
const broadcastUser = (u) => io.emit('user', publicUser(u));
const sendMe = (u) => toUser(u.id, 'me', privateUser(u));

// ---------------------------------------------------------------------------
// Playrooms
// ---------------------------------------------------------------------------
const BANNERS = ['sunset', 'bubblegum', 'aurora', 'midnight', 'peach', 'lagoon', 'galaxy', 'candy'];

function newPlayroom(owner, bp = {}) {
  const prId = store.id('p_');
  const pr = {
    id: prId,
    name: (bp.name || `${owner.displayName}'s Playroom`).slice(0, 48),
    description: (bp.description || '').slice(0, 500),
    iconEmoji: bp.iconEmoji || '✨',
    icon: null,
    banner: { type: 'gradient', value: bp.banner || BANNERS[Math.floor(Math.random() * BANNERS.length)] },
    accentColor: bp.accentColor || '#ff4fa3',
    tags: (bp.tags || []).slice(0, 8),
    isPublic: bp.isPublic !== false,
    ownerId: owner.id,
    createdAt: now(),
    welcomeMessage: bp.welcomeMessage || 'Welcome {user}! 💗',
    welcomeChannelId: null,
    rules: '',
    categories: [],
    channels: [],
    roles: [{ id: prId, name: '@everyone', color: '', position: 0, hoist: false, permissions: [...perms.DEFAULT_EVERYONE] }],
    members: {},
    bans: {},
    invites: [],
    automod: automod.defaultAutomod(),
    bots: [],
    modLog: [],
    createdBy: bp.source ? `ai:${bp.source}` : 'manual',
  };
  const cats = bp.categories && bp.categories.length ? bp.categories : [
    { name: 'Text Channels', channels: [{ name: 'welcome', type: 'announcement', topic: 'Say hi!' }, { name: 'general', type: 'text', topic: 'Chat about anything' }] },
  ];
  for (const c of cats) {
    const cat = { id: store.id('k_'), name: c.name.slice(0, 40) };
    pr.categories.push(cat);
    for (const ch of c.channels) {
      pr.channels.push({ id: store.id('c_'), name: slug(ch.name), type: ch.type === 'announcement' ? 'announcement' : 'text', topic: (ch.topic || '').slice(0, 200), categoryId: cat.id, slowmode: 0, viewRoles: [], writeRoles: [] });
    }
  }
  // Roles: blueprint lists highest first.
  const roleDefs = bp.roles || [];
  roleDefs.forEach((r, i) => {
    pr.roles.push({ id: store.id('r_'), name: r.name.slice(0, 32), color: r.color || '#99a1b3', position: roleDefs.length - i, hoist: !!r.hoist, mentionable: true, permissions: r.permissions || [] });
  });
  pr.welcomeChannelId = (pr.channels.find((c) => /welcome|general/.test(c.name)) || pr.channels[0])?.id || null;
  if (bp.bots) pr.bots = bp.bots.filter((b) => db.users[b]);
  if (bp.automod?.enabled) {
    pr.automod.enabled = true;
    if (bp.automod.strict) {
      pr.automod.rules.links.enabled = true;
      pr.automod.rules.caps.enabled = true;
    }
  }
  pr.members[owner.id] = { roles: [], nickname: '', joinedAt: now(), timeoutUntil: 0 };
  const adminRole = pr.roles.find((r) => r.permissions.includes('ADMINISTRATOR') && r.id !== pr.id);
  if (adminRole) pr.members[owner.id].roles.push(adminRole.id);
  db.playrooms[pr.id] = pr;
  rebuildChannelIndex();
  store.save();
  return pr;
}

function slug(s) {
  return String(s || 'channel').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'channel';
}

function serializePlayroom(pr, userId) {
  const canMod = perms.has(pr, userId, 'VIEW_MOD_LOG');
  const canManage = perms.has(pr, userId, 'MANAGE_PLAYROOM');
  return {
    id: pr.id,
    name: pr.name,
    description: pr.description,
    iconEmoji: pr.iconEmoji,
    icon: pr.icon,
    banner: pr.banner,
    accentColor: pr.accentColor,
    tags: pr.tags,
    isPublic: pr.isPublic,
    ownerId: pr.ownerId,
    createdAt: pr.createdAt,
    welcomeMessage: pr.welcomeMessage,
    welcomeChannelId: pr.welcomeChannelId,
    rules: pr.rules,
    categories: pr.categories,
    channels: pr.channels.filter((c) => perms.canViewChannel(pr, userId, c)).map((c) => ({ ...c, lastMessageAt: lastMessageAt(c.id) })),
    roles: pr.roles,
    members: pr.members,
    bots: pr.bots,
    automod: perms.has(pr, userId, 'MANAGE_AUTOMOD') ? pr.automod : { enabled: pr.automod.enabled },
    invites: perms.has(pr, userId, 'CREATE_INVITE') ? pr.invites : [],
    bans: perms.has(pr, userId, 'BAN_MEMBERS') ? pr.bans : {},
    modLog: canMod ? pr.modLog.slice(-200) : [],
    myPermissions: perms.memberPermissions(pr, userId),
    myTop: perms.topPosition(pr, userId) === Infinity ? 1e9 : perms.topPosition(pr, userId),
    canManage,
  };
}

function emitPlayroom(pr) {
  for (const uid of Object.keys(pr.members)) toUser(uid, 'playroom', serializePlayroom(pr, uid));
}

function modLog(pr, type, actorId, targetId, detail = '') {
  pr.modLog.push({ id: store.id('l_'), at: now(), type, actorId, targetId, detail });
  if (pr.modLog.length > 500) pr.modLog.splice(0, pr.modLog.length - 500);
}

function requirePr(prId, userId) {
  const pr = db.playrooms[prId];
  if (!pr || !pr.members[userId]) fail('Playroom not found.');
  return pr;
}
function requirePerm(pr, userId, perm) {
  if (!perms.has(pr, userId, perm)) fail('You don\'t have permission to do that.');
}

function summaryOf(pr) {
  return {
    id: pr.id,
    name: pr.name,
    description: pr.description,
    iconEmoji: pr.iconEmoji,
    icon: pr.icon,
    banner: pr.banner,
    accentColor: pr.accentColor,
    tags: pr.tags,
    memberCount: Object.keys(pr.members).length,
    onlineCount: Object.keys(pr.members).filter((id) => online.has(id)).length,
    bots: pr.bots,
    createdAt: pr.createdAt,
    activity: lastActivity(pr),
  };
}

function lastActivity(pr) {
  return Math.max(pr.createdAt, ...pr.channels.map((c) => lastMessageAt(c.id)));
}

function lastMessageAt(channelId) {
  const list = db.messages[channelId];
  return list && list.length ? list[list.length - 1].createdAt : 0;
}

function joinPlayroom(pr, user, via) {
  if (pr.bans[user.id]) fail('You are banned from this Playroom.');
  if (pr.members[user.id]) return pr;
  pr.members[user.id] = { roles: [], nickname: '', joinedAt: now(), timeoutUntil: 0 };
  modLog(pr, 'join', user.id, user.id, via || '');
  store.save();
  for (const s of socketsOf(user.id)) s.join(`pr:${pr.id}`);
  // Make sure everyone knows about everyone.
  io.to(`pr:${pr.id}`).emit('users', [publicUser(user)]);
  toUser(user.id, 'users', Object.keys(pr.members).map((id) => publicUser(db.users[id])).concat(pr.bots.map((b) => publicUser(db.users[b]))));
  emitPlayroom(pr);
  if (pr.welcomeChannelId && pr.welcomeMessage && pr.channels.find((c) => c.id === pr.welcomeChannelId)) {
    postSystem(pr.welcomeChannelId, pr.welcomeMessage.replaceAll('{user}', `@${user.username}`), { kind: 'join', userId: user.id });
  }
  return pr;
}

function removeMember(pr, userId) {
  delete pr.members[userId];
  for (const s of socketsOf(userId)) s.leave(`pr:${pr.id}`);
  toUser(userId, 'playroom:remove', { id: pr.id });
  emitPlayroom(pr);
  store.save();
}

// channelId -> { prId } | { convId }
let channelIndex = new Map();
function rebuildChannelIndex() {
  channelIndex = new Map();
  for (const pr of Object.values(db.playrooms)) for (const c of pr.channels) channelIndex.set(c.id, { prId: pr.id });
  for (const cv of Object.values(db.conversations)) channelIndex.set(cv.id, { convId: cv.id });
}
rebuildChannelIndex();

function resolveChannel(channelId, userId) {
  const ref = channelIndex.get(channelId);
  if (!ref) fail('Channel not found.');
  if (ref.prId) {
    const pr = db.playrooms[ref.prId];
    const channel = pr?.channels.find((c) => c.id === channelId);
    if (!pr || !channel || !perms.canViewChannel(pr, userId, channel)) fail('Channel not found.');
    return { kind: 'playroom', pr, channel };
  }
  const conv = db.conversations[ref.convId];
  if (!conv || !conv.members.includes(userId)) fail('Conversation not found.');
  return { kind: conv.type, conv };
}

function channelAudience(channelId) {
  const ref = channelIndex.get(channelId);
  if (!ref) return [];
  if (ref.prId) {
    const pr = db.playrooms[ref.prId];
    const channel = pr.channels.find((c) => c.id === channelId);
    return Object.keys(pr.members).filter((uid) => perms.canViewChannel(pr, uid, channel));
  }
  return db.conversations[ref.convId]?.members || [];
}

function emitChannel(channelId, ev, data) {
  for (const uid of channelAudience(channelId)) toUser(uid, ev, data);
}

// ---------------------------------------------------------------------------
// Conversations (DMs + group chats)
// ---------------------------------------------------------------------------
function serializeConv(cv) {
  return { ...cv, lastMessageAt: lastMessageAt(cv.id) };
}
function emitConv(cv) {
  for (const uid of cv.members) toUser(uid, 'conversation', serializeConv(cv));
}

function openDm(a, b) {
  let cv = Object.values(db.conversations).find((c) => c.type === 'dm' && c.members.includes(a.id) && c.members.includes(b.id));
  if (cv) return cv;
  cv = { id: store.id('d_'), type: 'dm', members: [a.id, b.id], createdAt: now(), bots: [] };
  db.conversations[cv.id] = cv;
  channelIndex.set(cv.id, { convId: cv.id });
  store.save();
  return cv;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
const slowmodeTracker = new Map();

function serializeMessage(m) {
  return m;
}

function postSystem(channelId, content, meta = {}) {
  const msg = { id: store.id('m_'), channelId, authorId: null, system: true, content, meta, createdAt: now(), reactions: {}, attachments: [] };
  store.pushMessage(msg);
  emitChannel(channelId, 'message', msg);
  return msg;
}

function postBot(channelId, botId, { content = '', embed = null }) {
  const msg = { id: store.id('m_'), channelId, authorId: botId, content, embed, createdAt: now(), reactions: {}, attachments: [] };
  store.pushMessage(msg);
  emitChannel(channelId, 'message', msg);
  return msg;
}

function sendMessage(user, { channelId, content, replyTo, attachments }) {
  content = String(content || '').slice(0, 4000);
  attachments = Array.isArray(attachments) ? attachments.slice(0, 6).filter((a) => typeof a?.url === 'string' && a.url.startsWith('/uploads/')) : [];
  if (!content.trim() && !attachments.length) fail('Message is empty.');
  const ctx = resolveChannel(channelId, user.id);
  let botsHere = [];

  if (ctx.kind === 'playroom') {
    const { pr, channel } = ctx;
    if (!perms.canSendInChannel(pr, user.id, channel)) {
      const m = pr.members[user.id];
      if (m.timeoutUntil > now()) fail(`You're timed out for ${Math.ceil((m.timeoutUntil - now()) / 60000)} more minute(s).`);
      fail('You can\'t send messages in this channel.');
    }
    if (attachments.length && !perms.has(pr, user.id, 'ATTACH_FILES')) fail('You can\'t upload files here.');
    if (/@everyone|@here/.test(content) && !perms.has(pr, user.id, 'MENTION_EVERYONE')) content = content.replace(/@(everyone|here)/g, '@​$1');
    if (channel.slowmode && !perms.has(pr, user.id, 'MANAGE_MESSAGES')) {
      const key = `${channel.id}:${user.id}`;
      const last = slowmodeTracker.get(key) || 0;
      const wait = channel.slowmode * 1000 - (now() - last);
      if (wait > 0) fail(`Slowmode is on — wait ${Math.ceil(wait / 1000)}s.`);
      slowmodeTracker.set(key, now());
    }
    const verdict = automod.check(pr, user.id, content);
    if (verdict) {
      modLog(pr, 'automod', null, user.id, `${verdict.rule}: ${content.slice(0, 120)}`);
      if (pr.automod.action === 'block_timeout') {
        pr.members[user.id].timeoutUntil = now() + pr.automod.timeoutMinutes * 60000;
        modLog(pr, 'timeout', null, user.id, `Automod: ${pr.automod.timeoutMinutes} min`);
        emitPlayroom(pr);
      }
      store.save();
      fail(`🛡️ Automod: ${verdict.reason}`);
    }
    botsHere = pr.bots;
  } else {
    const cv = ctx.conv;
    if (cv.type === 'dm') {
      const other = db.users[cv.members.find((id) => id !== user.id)];
      if (!other || other.deleted) fail('This user is no longer available.');
      if (other.blocked.includes(user.id)) fail('You can\'t message this user.');
      if (user.blocked.includes(other.id)) fail('You blocked this user. Unblock them to send messages.');
    }
    botsHere = cv.bots || [];
  }

  let reply = null;
  if (replyTo) {
    const orig = store.findMessage(channelId, replyTo);
    if (orig) reply = { id: orig.id, authorId: orig.authorId, content: (orig.content || '').slice(0, 140) };
  }
  const msg = { id: store.id('m_'), channelId, authorId: user.id, content, replyTo: reply, attachments, createdAt: now(), editedAt: null, reactions: {}, pinned: false };
  store.pushMessage(msg);
  emitChannel(channelId, 'message', msg);

  if (ctx.kind !== 'playroom') {
    // Reopen hidden DMs / groups for everyone in them.
    emitConv(ctx.conv);
  }

  if (botsHere.length && content.trim()) {
    setTimeout(() => {
      try {
        bots.handle({
          channelId,
          bots: botsHere,
          author: user,
          content,
          reply: (botId, payload) => postBot(channelId, botId, payload),
          findUser: (name) => {
            const u = findByUsername(name);
            if (!u) return null;
            const audience = channelAudience(channelId);
            return audience.includes(u.id) ? u : null;
          },
        });
      } catch (err) {
        console.error('[bots]', err);
      }
    }, 350);
  }
  return msg;
}

function canModerateMessage(user, ctx) {
  if (ctx.kind === 'playroom') return perms.has(ctx.pr, user.id, 'MANAGE_MESSAGES');
  if (ctx.kind === 'group') return ctx.conv.ownerId === user.id;
  return false;
}

// ---------------------------------------------------------------------------
// Deletion helpers
// ---------------------------------------------------------------------------
function deletePlayroom(pr) {
  for (const c of pr.channels) delete db.messages[c.id];
  const members = Object.keys(pr.members);
  delete db.playrooms[pr.id];
  rebuildChannelIndex();
  for (const uid of members) toUser(uid, 'playroom:remove', { id: pr.id });
  store.save();
}

function deleteUserData(u, hard) {
  for (const pr of Object.values(db.playrooms)) {
    if (pr.ownerId === u.id) {
      if (io) deletePlayroom(pr);
      else { for (const c of pr.channels) delete db.messages[c.id]; delete db.playrooms[pr.id]; }
    } else if (pr.members[u.id]) {
      delete pr.members[u.id];
    }
  }
  for (const cv of Object.values(db.conversations)) {
    if (cv.type === 'group' && cv.members.includes(u.id)) {
      cv.members = cv.members.filter((id) => id !== u.id);
      if (cv.ownerId === u.id) cv.ownerId = cv.members[0];
      if (!cv.members.length) { delete db.messages[cv.id]; delete db.conversations[cv.id]; }
    }
  }
  for (const other of Object.values(db.users)) {
    for (const key of ['friends', 'incoming', 'outgoing']) {
      if (other[key]?.includes(u.id)) other[key] = other[key].filter((id) => id !== u.id);
    }
  }
  for (const [tok, uid] of Object.entries(db.sessions)) if (uid === u.id) delete db.sessions[tok];
  if (hard && u.isGuest) {
    // Guests leave no trace; their DM history goes with them.
    for (const cv of Object.values(db.conversations)) {
      if (cv.type === 'dm' && cv.members.includes(u.id)) { delete db.messages[cv.id]; delete db.conversations[cv.id]; }
    }
    delete db.users[u.id];
  } else {
    u.deleted = true;
    u.displayName = 'Deleted User';
    u.username = `deleted_${u.id.slice(-6).toLowerCase()}`;
    u.profile = defaultProfile('Deleted User');
    delete u.passHash;
    delete u.salt;
  }
  rebuildChannelIndex();
  store.save();
}

// ---------------------------------------------------------------------------
// Express (REST)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '7d' }));

const attempts = new Map();
function throttle(req, res, next) {
  const key = req.ip;
  const rec = attempts.get(key) || { n: 0, t: now() };
  if (now() - rec.t > 60000) { rec.n = 0; rec.t = now(); }
  rec.n++;
  attempts.set(key, rec);
  if (rec.n > 30) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  next();
}

function newSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = user.id;
  store.save();
  return token;
}

function authUser(token) {
  const uid = db.sessions[token];
  const u = uid && db.users[uid];
  return u && !u.deleted ? u : null;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const u = authUser(token);
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  req.user = u;
  next();
}

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

app.post('/api/register', throttle, wrap((req) => {
  const username = String(req.body.username || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!validUsername(username)) fail('Usernames are 3-24 characters: letters, numbers, _ and .');
  if (password.length < 6) fail('Password must be at least 6 characters.');
  if (findByUsername(username)) fail('That username is taken.');
  const user = createUser({ username, password, displayName: String(req.body.displayName || username).trim() });
  return { token: newSession(user), user: privateUser(user) };
}));

app.post('/api/login', throttle, wrap((req) => {
  const user = findByUsername(req.body.username);
  if (!user || user.isBot || !checkPassword(user, String(req.body.password || ''))) fail('Wrong username or password.');
  return { token: newSession(user), user: privateUser(user) };
}));

app.post('/api/guest', throttle, wrap((req) => {
  let base = String(req.body.displayName || '').trim().slice(0, 24) || `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  let username;
  do username = `guest_${crypto.randomBytes(3).toString('hex')}`; while (findByUsername(username));
  const user = createUser({ username, displayName: base, isGuest: true });
  return { token: newSession(user), user: privateUser(user) };
}));

app.post('/api/upgrade', auth, throttle, wrap((req) => {
  const user = req.user;
  if (!user.isGuest) fail('You already have an account.');
  const username = String(req.body.username || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!validUsername(username)) fail('Usernames are 3-24 characters: letters, numbers, _ and .');
  if (password.length < 6) fail('Password must be at least 6 characters.');
  if (findByUsername(username)) fail('That username is taken.');
  const { salt, hash } = hashPassword(password);
  Object.assign(user, { username, salt, passHash: hash, isGuest: false });
  store.save();
  broadcastUser(user);
  sendMe(user);
  return { user: privateUser(user) };
}));

app.post('/api/logout', auth, wrap((req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  delete db.sessions[token];
  store.save();
  return { ok: true };
}));

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': null, 'application/pdf': 'pdf', 'text/plain': 'txt', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4' };
app.post('/api/upload', auth, wrap((req) => {
  const m = String(req.body.dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) fail('Invalid file.');
  const ext = MIME_EXT[m[1]];
  if (!ext) fail('That file type isn\'t supported.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) fail('Files can be up to 8 MB.');
  const name = `${store.id()}.${ext}`;
  fs.writeFileSync(path.join(store.UPLOAD_DIR, name), buf);
  return { url: `/uploads/${name}`, name: String(req.body.name || name).slice(0, 80), type: m[1], size: buf.length };
}));

app.get('/api/discover', auth, wrap((req) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const tag = String(req.query.tag || '').toLowerCase().trim();
  const sort = req.query.sort || 'popular';
  let list = Object.values(db.playrooms).filter((p) => p.isPublic);
  if (q) list = list.filter((p) => `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q));
  if (tag) list = list.filter((p) => p.tags.includes(tag));
  const out = list.map(summaryOf);
  if (sort === 'new') out.sort((a, b) => b.createdAt - a.createdAt);
  else if (sort === 'active') out.sort((a, b) => b.activity - a.activity);
  else out.sort((a, b) => b.memberCount - a.memberCount || b.onlineCount - a.onlineCount);
  const tagCounts = {};
  for (const p of Object.values(db.playrooms)) if (p.isPublic) for (const t of p.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  return { playrooms: out.slice(0, 120), tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([t]) => t) };
}));

app.get('/api/bots', auth, wrap(() => ({
  bots: bots.BOTS.map((b) => ({ ...publicUser(db.users[b.id]), tagline: b.tagline, commands: b.commands, emoji: b.emoji, color: b.color,
    installs: Object.values(db.playrooms).filter((p) => p.bots.includes(b.id)).length })),
})));

app.get('/api/invite/:code', auth, wrap((req) => {
  const code = req.params.code;
  const pr = Object.values(db.playrooms).find((p) => p.invites.some((i) => i.code === code));
  if (!pr) fail('This invite is invalid or has expired.');
  return { playroom: summaryOf(pr), code };
}));

app.post('/api/ai/playroom', auth, throttle, wrap(async (req) => {
  const prompt = String(req.body.prompt || '').trim();
  if (prompt.length < 3) fail('Tell the assistant a little about your Playroom first.');
  return { blueprint: await ai.generatePlayroom(prompt), poweredBy: process.env.ANTHROPIC_API_KEY ? 'claude' : 'built-in' };
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// SPA fallback (invite links etc.)
app.get(/^\/(invite|app)(\/.*)?$/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
const server = http.createServer(app);
io = new Server(server, { maxHttpBufferSize: 1e6 });

function socketsOf(userId) {
  const ids = online.get(userId);
  if (!ids) return [];
  return [...ids].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
}

io.use((socket, next) => {
  const u = authUser(socket.handshake.auth?.token);
  if (!u) return next(new Error('unauthorized'));
  socket.data.userId = u.id;
  next();
});

function bootstrapFor(user) {
  const playrooms = Object.values(db.playrooms).filter((p) => p.members[user.id]);
  const convs = Object.values(db.conversations).filter((c) => c.members.includes(user.id));
  const known = new Set([user.id, ...user.friends, ...user.incoming, ...user.outgoing, ...user.blocked, ...bots.BOTS.map((b) => b.id)]);
  for (const p of playrooms) Object.keys(p.members).forEach((id) => known.add(id));
  for (const c of convs) c.members.forEach((id) => known.add(id));
  return {
    me: privateUser(user),
    users: [...known].map((id) => publicUser(db.users[id])).filter(Boolean),
    playrooms: playrooms.map((p) => serializePlayroom(p, user.id)),
    conversations: convs.map(serializeConv),
    permissions: perms.PERMISSIONS,
    aiPoweredBy: process.env.ANTHROPIC_API_KEY ? 'claude' : 'built-in',
  };
}

const handlers = {};
const on = (name, fn) => { handlers[name] = fn; };

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  const user = db.users[userId];
  if (!online.has(userId)) online.set(userId, new Set());
  const wasOffline = online.get(userId).size === 0;
  online.get(userId).add(socket.id);
  socket.join(`user:${userId}`);
  for (const p of Object.values(db.playrooms)) if (p.members[userId]) socket.join(`pr:${p.id}`);
  user.lastSeen = now();
  socket.emit('bootstrap', bootstrapFor(user));
  if (wasOffline) broadcastUser(user);

  socket.on('req', async (name, payload, ack) => {
    if (typeof ack !== 'function') return;
    const fn = handlers[name];
    if (!fn) return ack({ error: 'Unknown action.' });
    const me = db.users[userId];
    if (!me || me.deleted) return ack({ error: 'Not signed in.' });
    try {
      const result = await fn(me, payload || {}, socket);
      ack({ ok: true, data: result === undefined ? null : result });
    } catch (err) {
      if (err instanceof UserError) return ack({ error: err.message });
      console.error(`[${name}]`, err);
      ack({ error: 'Something went wrong.' });
    }
  });

  socket.on('typing', (channelId) => {
    try {
      resolveChannel(channelId, userId);
      for (const uid of channelAudience(channelId)) if (uid !== userId) toUser(uid, 'typing', { channelId, userId });
    } catch { /* ignore */ }
  });

  socket.on('disconnect', () => {
    const set = online.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(userId);
        const u = db.users[userId];
        if (u) { u.lastSeen = now(); store.save(); broadcastUser(u); }
      }
    }
  });
});

// --- Me / profile / settings ------------------------------------------------
const HEX = /^#[0-9a-f]{6}$/i;
const PROFILE_FIELDS = {
  avatar: 'url', avatarColor: 'color', avatarEmoji: 8, decoration: 24, themeColors: 'colors', nameStyle: 16, nameColor: 'color', nameFont: 16,
  bio: 800, pronouns: 32, customStatus: 80, statusEmoji: 8, mood: 40, location: 48, birthday: 16, nowPlaying: 80, cardEffect: 16,
  interests: 'tags', favoriteGames: 'tags', links: 'links', banner: 'banner', showcase: 'tags',
};

function cleanProfilePatch(patch) {
  const out = {};
  for (const [k, rule] of Object.entries(PROFILE_FIELDS)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof rule === 'number') out[k] = String(v ?? '').slice(0, rule);
    else if (rule === 'url') out[k] = v && typeof v === 'string' && v.startsWith('/uploads/') ? v : null;
    else if (rule === 'color') out[k] = /^#[0-9a-f]{6}$/i.test(v || '') ? v : '';
    else if (rule === 'colors') out[k] = (Array.isArray(v) ? v : []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 2);
    else if (rule === 'tags') out[k] = (Array.isArray(v) ? v : []).map((t) => String(t).slice(0, 40)).filter(Boolean).slice(0, 12);
    else if (rule === 'links') out[k] = (Array.isArray(v) ? v : []).filter((l) => l && /^https?:\/\//.test(l.url || '')).map((l) => ({ label: String(l.label || l.url).slice(0, 40), url: String(l.url).slice(0, 300) })).slice(0, 6);
    else if (rule === 'banner') {
      const type = ['gradient', 'color', 'image'].includes(v?.type) ? v.type : 'gradient';
      const value = String(v?.value || '').slice(0, 200);
      const valid = type === 'image' ? /^\/uploads\/[\w-]+\.\w+$/.test(value) : type === 'color' ? HEX.test(value) : /^[a-z]+$/.test(value);
      out[k] = valid ? { type, value, position: Math.min(100, Math.max(0, Number(v?.position) || 50)) } : { type: 'gradient', value: 'sunset', position: 50 };
    }
  }
  if (out.themeColors && out.themeColors.length < 2) delete out.themeColors;
  return out;
}

on('me.update', (me, { displayName, profile, settings }) => {
  if (displayName !== undefined) {
    const dn = String(displayName).trim().slice(0, 32);
    if (!dn) fail('Display name can\'t be empty.');
    me.displayName = dn;
    me.profile.displayName = dn;
  }
  if (profile) Object.assign(me.profile, cleanProfilePatch(profile));
  if (settings) {
    const s = me.settings;
    if (['dark', 'light', 'system'].includes(settings.theme)) s.theme = settings.theme;
    if (/^#[0-9a-f]{6}$/i.test(settings.accent || '')) s.accent = settings.accent;
    if (typeof settings.fontScale === 'number') s.fontScale = Math.min(1.3, Math.max(0.85, settings.fontScale));
    if (typeof settings.reduceMotion === 'boolean') s.reduceMotion = settings.reduceMotion;
    if (typeof settings.sounds === 'boolean') s.sounds = settings.sounds;
    if (settings.layouts) for (const k of ['dm', 'group', 'playroom']) if (['bubbles', 'classic', 'compact', 'cozy'].includes(settings.layouts[k])) s.layouts[k] = settings.layouts[k];
    if (settings.privacy) {
      if (['everyone', 'friends', 'none'].includes(settings.privacy.dmsFrom)) s.privacy.dmsFrom = settings.privacy.dmsFrom;
      if (['everyone', 'none'].includes(settings.privacy.friendRequests)) s.privacy.friendRequests = settings.privacy.friendRequests;
    }
    if (settings.background) {
      const { key, value } = settings.background;
      if (typeof key === 'string' && key.length < 64) {
        if (!value) delete s.backgrounds[key];
        else {
          const type = ['preset', 'color', 'image', 'gradient'].includes(value.type) ? value.type : 'preset';
          const v = String(value.value || '').slice(0, 300);
          const ok = type === 'image' ? /^\/uploads\/[\w-]+\.\w+$/.test(v) : type === 'color' ? HEX.test(v) : /^[a-z]+$/.test(v);
          if (!ok) fail('Invalid background.');
          if (Object.keys(s.backgrounds).length >= 300 && !s.backgrounds[key]) fail('Too many custom backgrounds.');
          s.backgrounds[key] = {
          type,
          value: v,
          dim: Math.min(0.9, Math.max(0, Number(value.dim) || 0)),
          blur: Math.min(20, Math.max(0, Number(value.blur) || 0)),
          };
        }
      }
    }
  }
  store.save();
  sendMe(me);
  broadcastUser(me);
});

on('me.status', (me, { status }) => {
  if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) fail('Invalid status.');
  me.settings.status = status;
  store.save();
  sendMe(me);
  broadcastUser(me);
});

on('me.read', (me, { channelId, at }) => {
  resolveChannel(channelId, me.id);
  me.settings.reads[channelId] = Math.min(now(), Number(at) || now());
  store.save();
});

on('account.password', (me, { current, next }) => {
  if (me.isGuest) fail('Guests don\'t have a password. Claim your account first.');
  if (!checkPassword(me, String(current || ''))) fail('Current password is wrong.');
  if (String(next || '').length < 6) fail('New password must be at least 6 characters.');
  const { salt, hash } = hashPassword(String(next));
  me.salt = salt; me.passHash = hash;
  store.save();
});

on('account.username', (me, { username }) => {
  username = String(username || '').toLowerCase().trim();
  if (me.isGuest) fail('Claim your account first.');
  if (!validUsername(username)) fail('Usernames are 3-24 characters: letters, numbers, _ and .');
  if (findByUsername(username) && username !== me.username) fail('That username is taken.');
  me.username = username;
  store.save();
  sendMe(me);
  broadcastUser(me);
});

on('account.delete', (me, { password }) => {
  if (!me.isGuest && !checkPassword(me, String(password || ''))) fail('Password is wrong.');
  const sockets = socketsOf(me.id);
  deleteUserData(me, me.isGuest);
  broadcastUser(me);
  for (const s of sockets) s.disconnect(true);
});

// --- Users / friends --------------------------------------------------------
on('user.get', (me, { userId, username }) => {
  const u = userId ? db.users[userId] : findByUsername(username);
  if (!u) fail('User not found.');
  const mutualPlayrooms = Object.values(db.playrooms).filter((p) => p.members[me.id] && p.members[u.id]).map((p) => ({ id: p.id, name: p.name, iconEmoji: p.iconEmoji, icon: p.icon }));
  const mutualFriends = me.friends.filter((f) => u.friends?.includes(f));
  return { user: publicUser(u), mutualPlayrooms, mutualFriends };
});

on('users.get', (me, { ids }) => (Array.isArray(ids) ? ids.slice(0, 200) : []).map((id) => publicUser(db.users[id])).filter(Boolean));

function syncFriends(...users) {
  for (const u of users) sendMe(u);
  for (const u of users) for (const o of users) if (u !== o) toUser(u.id, 'users', [publicUser(o)]);
}

on('friends.request', (me, { username }) => {
  if (me.isGuest) fail('Guests can\'t add friends — claim your account (free!) to unlock friends.');
  const u = findByUsername(username);
  if (!u || u.isBot) fail('No user with that username.');
  if (u.id === me.id) fail('That\'s you! 💗');
  if (me.friends.includes(u.id)) fail('You\'re already friends.');
  if (u.blocked.includes(me.id) || u.settings.privacy.friendRequests === 'none') fail('This user isn\'t accepting friend requests.');
  if (me.incoming.includes(u.id)) return handlers['friends.accept'](me, { userId: u.id });
  if (!me.outgoing.includes(u.id)) me.outgoing.push(u.id);
  if (!u.incoming.includes(me.id)) u.incoming.push(me.id);
  store.save();
  syncFriends(me, u);
  toUser(u.id, 'notify', { title: 'New friend request', body: `${me.displayName} wants to be friends.` });
});

on('friends.accept', (me, { userId }) => {
  const u = db.users[userId];
  if (!u || !me.incoming.includes(userId)) fail('No pending request.');
  me.incoming = me.incoming.filter((id) => id !== userId);
  u.outgoing = u.outgoing.filter((id) => id !== me.id);
  if (!me.friends.includes(u.id)) me.friends.push(u.id);
  if (!u.friends.includes(me.id)) u.friends.push(me.id);
  store.save();
  syncFriends(me, u);
});

on('friends.remove', (me, { userId }) => {
  const u = db.users[userId];
  if (!u) fail('User not found.');
  for (const [a, b] of [[me, u], [u, me]]) {
    a.friends = a.friends.filter((id) => id !== b.id);
    a.incoming = a.incoming.filter((id) => id !== b.id);
    a.outgoing = a.outgoing.filter((id) => id !== b.id);
  }
  store.save();
  syncFriends(me, u);
});

on('user.block', (me, { userId, block }) => {
  const u = db.users[userId];
  if (!u || u.id === me.id) fail('User not found.');
  if (block) {
    if (!me.blocked.includes(userId)) me.blocked.push(userId);
    handlers['friends.remove'](me, { userId });
  } else me.blocked = me.blocked.filter((id) => id !== userId);
  store.save();
  sendMe(me);
});

// --- DMs & group chats ------------------------------------------------------
on('dm.open', (me, { userId }) => {
  const u = db.users[userId];
  if (!u || u.deleted || u.id === me.id) fail('User not found.');
  if (u.isBot) {
    const cv = openDm(me, u);
    if (!cv.bots.includes(u.id)) cv.bots.push(u.id);
    emitConv(cv);
    return serializeConv(cv);
  }
  const existing = Object.values(db.conversations).find((c) => c.type === 'dm' && c.members.includes(me.id) && c.members.includes(u.id));
  if (!existing) {
    if (u.blocked.includes(me.id)) fail('You can\'t message this user.');
    const pref = u.settings.privacy.dmsFrom;
    if (pref === 'none') fail('This user isn\'t accepting DMs.');
    if (pref === 'friends' && !u.friends.includes(me.id)) fail('This user only accepts DMs from friends.');
  }
  const cv = openDm(me, u);
  toUser(me.id, 'users', [publicUser(u)]);
  toUser(u.id, 'users', [publicUser(me)]);
  emitConv(cv);
  return serializeConv(cv);
});

on('group.create', (me, { name, memberIds }) => {
  const ids = [...new Set((memberIds || []).filter((id) => db.users[id] && !db.users[id].isBot && id !== me.id))];
  if (ids.length < 1) fail('Pick at least one friend for the group.');
  if (ids.length > 49) fail('Group chats can have up to 50 people.');
  for (const id of ids) if (!me.friends.includes(id)) fail('You can only add friends to a group chat.');
  const cv = { id: store.id('g_'), type: 'group', name: String(name || '').slice(0, 48), icon: null, iconEmoji: '💬', members: [me.id, ...ids], ownerId: me.id, createdAt: now(), bots: [], banner: null, theme: '' };
  db.conversations[cv.id] = cv;
  channelIndex.set(cv.id, { convId: cv.id });
  store.save();
  for (const uid of cv.members) toUser(uid, 'users', cv.members.map((id) => publicUser(db.users[id])));
  emitConv(cv);
  postSystem(cv.id, `${me.displayName} created the group.`);
  return serializeConv(cv);
});

function requireGroup(me, id) {
  const cv = db.conversations[id];
  if (!cv || cv.type !== 'group' || !cv.members.includes(me.id)) fail('Group not found.');
  return cv;
}

on('group.update', (me, { id, name, icon, iconEmoji }) => {
  const cv = requireGroup(me, id);
  if (name !== undefined) cv.name = String(name).slice(0, 48);
  if (icon !== undefined) cv.icon = typeof icon === 'string' && icon.startsWith('/uploads/') ? icon : null;
  if (iconEmoji !== undefined) cv.iconEmoji = String(iconEmoji).slice(0, 8);
  store.save();
  emitConv(cv);
  postSystem(cv.id, `${me.displayName} updated the group.`);
});

on('group.add', (me, { id, userIds }) => {
  const cv = requireGroup(me, id);
  const add = (userIds || []).filter((uid) => me.friends.includes(uid) && !cv.members.includes(uid));
  if (!add.length) fail('Pick friends who aren\'t in the group yet.');
  if (cv.members.length + add.length > 50) fail('Group chats can have up to 50 people.');
  cv.members.push(...add);
  store.save();
  for (const uid of cv.members) toUser(uid, 'users', cv.members.map((x) => publicUser(db.users[x])));
  emitConv(cv);
  postSystem(cv.id, `${me.displayName} added ${add.map((x) => db.users[x].displayName).join(', ')}.`);
});

on('group.kick', (me, { id, userId }) => {
  const cv = requireGroup(me, id);
  if (cv.ownerId !== me.id) fail('Only the group owner can remove people.');
  if (!cv.members.includes(userId) || userId === me.id) fail('Not in this group.');
  cv.members = cv.members.filter((x) => x !== userId);
  store.save();
  toUser(userId, 'conversation:remove', { id: cv.id });
  emitConv(cv);
  postSystem(cv.id, `${me.displayName} removed ${db.users[userId]?.displayName}.`);
});

on('group.leave', (me, { id }) => {
  const cv = requireGroup(me, id);
  cv.members = cv.members.filter((x) => x !== me.id);
  toUser(me.id, 'conversation:remove', { id: cv.id });
  if (!cv.members.length) {
    delete db.conversations[cv.id];
    delete db.messages[cv.id];
    channelIndex.delete(cv.id);
  } else {
    if (cv.ownerId === me.id) cv.ownerId = cv.members[0];
    emitConv(cv);
    postSystem(cv.id, `${me.displayName} left the group.`);
  }
  store.save();
});

on('conv.bots', (me, { id, botId, add }) => {
  const cv = db.conversations[id];
  if (!cv || !cv.members.includes(me.id) || cv.type !== 'group') fail('Bots can be added to group chats and Playrooms.');
  if (me.isGuest) fail('Claim your account to add bots.');
  if (!bots.BOTS.some((b) => b.id === botId)) fail('Unknown bot.');
  cv.bots = cv.bots || [];
  if (add && !cv.bots.includes(botId)) cv.bots.push(botId);
  if (!add) cv.bots = cv.bots.filter((b) => b !== botId);
  store.save();
  emitConv(cv);
  postSystem(cv.id, `${me.displayName} ${add ? 'added' : 'removed'} ${db.users[botId].displayName}.`);
});

// --- Messages ---------------------------------------------------------------
on('messages.fetch', (me, { channelId, before }) => {
  resolveChannel(channelId, me.id);
  let list = store.messagesFor(channelId);
  if (before) {
    const idx = list.findIndex((m) => m.id === before);
    list = idx >= 0 ? list.slice(0, idx) : list;
  }
  const page = list.slice(-60);
  const authorIds = [...new Set(page.map((m) => m.authorId).filter(Boolean))];
  return { messages: page.map(serializeMessage), users: authorIds.map((id) => publicUser(db.users[id])).filter(Boolean), hasMore: list.length > page.length };
});

on('messages.pinned', (me, { channelId }) => {
  resolveChannel(channelId, me.id);
  return store.messagesFor(channelId).filter((m) => m.pinned);
});

on('message.send', (me, payload) => sendMessage(me, payload));

on('message.edit', (me, { channelId, messageId, content }) => {
  resolveChannel(channelId, me.id);
  const m = store.findMessage(channelId, messageId);
  if (!m || m.authorId !== me.id) fail('You can only edit your own messages.');
  content = String(content || '').slice(0, 4000);
  if (!content.trim() && !m.attachments?.length) fail('Message is empty.');
  m.content = content;
  m.editedAt = now();
  store.save();
  emitChannel(channelId, 'message:update', m);
});

on('message.delete', (me, { channelId, messageId }) => {
  const ctx = resolveChannel(channelId, me.id);
  const list = store.messagesFor(channelId);
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx < 0) fail('Message not found.');
  const m = list[idx];
  if (m.authorId !== me.id && !canModerateMessage(me, ctx)) fail('You can\'t delete this message.');
  list.splice(idx, 1);
  if (ctx.kind === 'playroom' && m.authorId !== me.id) modLog(ctx.pr, 'message_delete', me.id, m.authorId, (m.content || '').slice(0, 120));
  store.save();
  emitChannel(channelId, 'message:delete', { channelId, messageId });
});

on('message.react', (me, { channelId, messageId, emoji }) => {
  const ctx = resolveChannel(channelId, me.id);
  if (ctx.kind === 'playroom' && !perms.has(ctx.pr, me.id, 'ADD_REACTIONS')) fail('You can\'t react here.');
  emoji = String(emoji || '').slice(0, 16);
  if (!emoji) fail('Pick an emoji.');
  const m = store.findMessage(channelId, messageId);
  if (!m) fail('Message not found.');
  m.reactions = m.reactions || {};
  const list = m.reactions[emoji] || [];
  if (list.includes(me.id)) m.reactions[emoji] = list.filter((id) => id !== me.id);
  else {
    if (Object.keys(m.reactions).length >= 20 && !m.reactions[emoji]) fail('Too many different reactions.');
    m.reactions[emoji] = [...list, me.id];
  }
  if (!m.reactions[emoji].length) delete m.reactions[emoji];
  store.save();
  emitChannel(channelId, 'message:update', m);
});

on('message.pin', (me, { channelId, messageId, pinned }) => {
  const ctx = resolveChannel(channelId, me.id);
  if (ctx.kind === 'playroom' && !perms.has(ctx.pr, me.id, 'MANAGE_MESSAGES')) fail('You can\'t pin messages here.');
  const m = store.findMessage(channelId, messageId);
  if (!m) fail('Message not found.');
  m.pinned = !!pinned;
  store.save();
  emitChannel(channelId, 'message:update', m);
});

// --- Playrooms --------------------------------------------------------------
on('playroom.create', (me, { blueprint }) => {
  if (me.isGuest) fail('Guests can join Playrooms but not create them — claim your free account first!');
  const owned = Object.values(db.playrooms).filter((p) => p.ownerId === me.id).length;
  if (owned >= 50) fail('You can own up to 50 Playrooms.');
  const bp = blueprint || {};
  if (!String(bp.name || '').trim()) fail('Give your Playroom a name.');
  const pr = newPlayroom(me, bp);
  for (const s of socketsOf(me.id)) s.join(`pr:${pr.id}`);
  toUser(me.id, 'users', pr.bots.map((b) => publicUser(db.users[b])));
  emitPlayroom(pr);
  return { id: pr.id };
});

on('playroom.update', (me, { id, patch }) => {
  const pr = requirePr(id, me.id);
  requirePerm(pr, me.id, 'MANAGE_PLAYROOM');
  const p = patch || {};
  if (p.name !== undefined) { const n = String(p.name).trim().slice(0, 48); if (!n) fail('Name can\'t be empty.'); pr.name = n; }
  if (p.description !== undefined) pr.description = String(p.description).slice(0, 500);
  if (p.rules !== undefined) pr.rules = String(p.rules).slice(0, 2000);
  if (p.iconEmoji !== undefined) pr.iconEmoji = String(p.iconEmoji).slice(0, 8);
  if (p.icon !== undefined) pr.icon = typeof p.icon === 'string' && p.icon.startsWith('/uploads/') ? p.icon : null;
  if (p.banner !== undefined) pr.banner = cleanProfilePatch({ banner: p.banner }).banner;
  if (p.accentColor !== undefined && /^#[0-9a-f]{6}$/i.test(p.accentColor)) pr.accentColor = p.accentColor;
  if (p.tags !== undefined) pr.tags = (Array.isArray(p.tags) ? p.tags : []).map((t) => slug(t).slice(0, 24)).filter(Boolean).slice(0, 8);
  if (p.isPublic !== undefined) pr.isPublic = !!p.isPublic;
  if (p.welcomeMessage !== undefined) pr.welcomeMessage = String(p.welcomeMessage).slice(0, 300);
  if (p.welcomeChannelId !== undefined) pr.welcomeChannelId = pr.channels.some((c) => c.id === p.welcomeChannelId) ? p.welcomeChannelId : null;
  modLog(pr, 'playroom_update', me.id, null, Object.keys(p).join(', '));
  store.save();
  emitPlayroom(pr);
});

on('playroom.delete', (me, { id, confirmName }) => {
  const pr = requirePr(id, me.id);
  if (pr.ownerId !== me.id) fail('Only the owner can delete a Playroom.');
  if (confirmName !== pr.name) fail('Type the Playroom name exactly to confirm.');
  deletePlayroom(pr);
});

on('playroom.transfer', (me, { id, userId }) => {
  const pr = requirePr(id, me.id);
  if (pr.ownerId !== me.id) fail('Only the owner can transfer ownership.');
  if (!pr.members[userId] || db.users[userId]?.isBot) fail('Pick a member.');
  pr.ownerId = userId;
  modLog(pr, 'transfer', me.id, userId);
  store.save();
  emitPlayroom(pr);
});

on('playroom.leave', (me, { id }) => {
  const pr = requirePr(id, me.id);
  if (pr.ownerId === me.id) fail('Transfer ownership or delete the Playroom before leaving.');
  modLog(pr, 'leave', me.id, me.id);
  removeMember(pr, me.id);
});

on('playroom.join', (me, { id, code }) => {
  let pr;
  if (code) {
    pr = Object.values(db.playrooms).find((p) => p.invites.some((i) => i.code === code));
    if (!pr) fail('This invite is invalid or has expired.');
    const inv = pr.invites.find((i) => i.code === code);
    if (inv.expiresAt && inv.expiresAt < now()) fail('This invite has expired.');
    if (inv.maxUses && inv.uses >= inv.maxUses) fail('This invite has reached its limit.');
    if (!pr.members[me.id]) inv.uses++;
  } else {
    pr = db.playrooms[id];
    if (!pr || (!pr.isPublic && !pr.members[me.id])) fail('This Playroom is private — you need an invite.');
  }
  joinPlayroom(pr, me, code ? `invite ${code}` : 'discovery');
  return { id: pr.id };
});

on('playroom.preview', (me, { id }) => {
  const pr = db.playrooms[id];
  if (!pr || (!pr.isPublic && !pr.members[me.id])) fail('Playroom not found.');
  return {
    ...summaryOf(pr),
    rules: pr.rules,
    channels: pr.channels.filter((c) => !c.viewRoles?.length).map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic })),
    roles: pr.roles.filter((r) => r.id !== pr.id).map((r) => ({ name: r.name, color: r.color })),
    owner: publicUser(db.users[pr.ownerId]),
  };
});

// Channels & categories
on('category.create', (me, { prId, name }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  if (pr.categories.length >= 30) fail('Too many categories.');
  pr.categories.push({ id: store.id('k_'), name: String(name || 'New Category').slice(0, 40) });
  store.save();
  emitPlayroom(pr);
});

on('category.update', (me, { prId, id, name, move }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  const idx = pr.categories.findIndex((c) => c.id === id);
  if (idx < 0) fail('Category not found.');
  if (name !== undefined) pr.categories[idx].name = String(name).slice(0, 40) || 'Category';
  if (move) {
    const to = idx + (move < 0 ? -1 : 1);
    if (to >= 0 && to < pr.categories.length) [pr.categories[idx], pr.categories[to]] = [pr.categories[to], pr.categories[idx]];
  }
  store.save();
  emitPlayroom(pr);
});

on('category.delete', (me, { prId, id }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  pr.categories = pr.categories.filter((c) => c.id !== id);
  for (const c of pr.channels) if (c.categoryId === id) c.categoryId = null;
  store.save();
  emitPlayroom(pr);
});

on('channel.create', (me, { prId, name, type, categoryId, topic }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  if (pr.channels.length >= 200) fail('Too many channels.');
  const ch = { id: store.id('c_'), name: slug(name), type: type === 'announcement' ? 'announcement' : 'text', topic: String(topic || '').slice(0, 200), categoryId: pr.categories.some((c) => c.id === categoryId) ? categoryId : null, slowmode: 0, viewRoles: [], writeRoles: [] };
  pr.channels.push(ch);
  channelIndex.set(ch.id, { prId: pr.id });
  modLog(pr, 'channel_create', me.id, null, `#${ch.name}`);
  store.save();
  emitPlayroom(pr);
  return { id: ch.id };
});

on('channel.update', (me, { prId, id, patch, move }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  const idx = pr.channels.findIndex((c) => c.id === id);
  if (idx < 0) fail('Channel not found.');
  const ch = pr.channels[idx];
  const p = patch || {};
  const roleIds = (arr) => (Array.isArray(arr) ? arr.filter((r) => pr.roles.some((x) => x.id === r && x.id !== pr.id)) : []);
  if (p.name !== undefined) ch.name = slug(p.name);
  if (p.topic !== undefined) ch.topic = String(p.topic).slice(0, 200);
  if (p.type !== undefined) ch.type = p.type === 'announcement' ? 'announcement' : 'text';
  if (p.slowmode !== undefined) ch.slowmode = Math.min(3600, Math.max(0, parseInt(p.slowmode, 10) || 0));
  if (p.categoryId !== undefined) ch.categoryId = pr.categories.some((c) => c.id === p.categoryId) ? p.categoryId : null;
  if (p.viewRoles !== undefined) ch.viewRoles = roleIds(p.viewRoles);
  if (p.writeRoles !== undefined) ch.writeRoles = roleIds(p.writeRoles);
  if (move) {
    // Move within the same category.
    const siblings = pr.channels.filter((c) => c.categoryId === ch.categoryId);
    const si = siblings.indexOf(ch);
    const target = siblings[si + (move < 0 ? -1 : 1)];
    if (target) {
      const ti = pr.channels.indexOf(target);
      [pr.channels[idx], pr.channels[ti]] = [pr.channels[ti], pr.channels[idx]];
    }
  }
  store.save();
  emitPlayroom(pr);
});

on('channel.delete', (me, { prId, id }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_CHANNELS');
  const ch = pr.channels.find((c) => c.id === id);
  if (!ch) fail('Channel not found.');
  if (pr.channels.length <= 1) fail('A Playroom needs at least one channel.');
  pr.channels = pr.channels.filter((c) => c.id !== id);
  delete db.messages[id];
  channelIndex.delete(id);
  if (pr.welcomeChannelId === id) pr.welcomeChannelId = pr.channels[0]?.id || null;
  modLog(pr, 'channel_delete', me.id, null, `#${ch.name}`);
  store.save();
  emitPlayroom(pr);
});

// Roles
on('role.create', (me, { prId, name, color }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_ROLES');
  if (pr.roles.length >= 100) fail('Too many roles.');
  // New roles go directly above @everyone; shift others up.
  for (const r of pr.roles) if (r.id !== pr.id) r.position++;
  const role = { id: store.id('r_'), name: String(name || 'new role').slice(0, 32), color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#99a1b3', position: 1, hoist: false, mentionable: true, permissions: [] };
  pr.roles.push(role);
  modLog(pr, 'role_create', me.id, null, role.name);
  store.save();
  emitPlayroom(pr);
  return { id: role.id };
});

on('role.update', (me, { prId, id, patch }) => {
  const pr = requirePr(prId, me.id);
  const role = perms.getRole(pr, id);
  if (!role) fail('Role not found.');
  if (!perms.canManageRole(pr, me.id, role) && !(role.id === pr.id && perms.has(pr, me.id, 'MANAGE_ROLES'))) fail('You can only edit roles below your highest role.');
  const p = patch || {};
  if (p.name !== undefined && role.id !== pr.id) role.name = String(p.name).slice(0, 32) || 'role';
  if (p.color !== undefined) role.color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '';
  if (p.hoist !== undefined) role.hoist = !!p.hoist;
  if (p.mentionable !== undefined) role.mentionable = !!p.mentionable;
  if (p.icon !== undefined) role.icon = String(p.icon).slice(0, 8);
  if (p.permissions !== undefined) {
    const mine = perms.memberPermissions(pr, me.id);
    const next = (Array.isArray(p.permissions) ? p.permissions : []).filter((x) => perms.PERMISSIONS[x]);
    // You can't grant permissions you don't have yourself.
    for (const x of next) if (!role.permissions.includes(x) && !mine.includes(x)) fail(`You can't grant ${x} because you don't have it.`);
    role.permissions = next;
  }
  modLog(pr, 'role_update', me.id, null, role.name);
  store.save();
  emitPlayroom(pr);
});

on('role.move', (me, { prId, id, direction }) => {
  const pr = requirePr(prId, me.id);
  const role = perms.getRole(pr, id);
  if (!role || role.id === pr.id) fail('Role not found.');
  if (!perms.canManageRole(pr, me.id, role)) fail('You can only move roles below your highest role.');
  const targetPos = role.position + (direction > 0 ? 1 : -1);
  if (targetPos < 1) fail('Roles can\'t go below @everyone.');
  const other = pr.roles.find((r) => r.position === targetPos);
  if (!other) fail('Already at the top.');
  if (!perms.canManageRole(pr, me.id, other)) fail('You can\'t move a role above your own highest role.');
  other.position = role.position;
  role.position = targetPos;
  store.save();
  emitPlayroom(pr);
});

on('role.delete', (me, { prId, id }) => {
  const pr = requirePr(prId, me.id);
  const role = perms.getRole(pr, id);
  if (!role || role.id === pr.id) fail('Role not found.');
  if (!perms.canManageRole(pr, me.id, role)) fail('You can only delete roles below your highest role.');
  pr.roles = pr.roles.filter((r) => r.id !== id);
  for (const r of pr.roles) if (r.position > role.position) r.position--;
  for (const m of Object.values(pr.members)) m.roles = m.roles.filter((r) => r !== id);
  for (const c of pr.channels) { c.viewRoles = c.viewRoles.filter((r) => r !== id); c.writeRoles = c.writeRoles.filter((r) => r !== id); }
  pr.automod.exemptRoles = pr.automod.exemptRoles.filter((r) => r !== id);
  modLog(pr, 'role_delete', me.id, null, role.name);
  store.save();
  emitPlayroom(pr);
});

// Members
on('member.roles', (me, { prId, userId, roleId, add }) => {
  const pr = requirePr(prId, me.id);
  const member = pr.members[userId];
  const role = perms.getRole(pr, roleId);
  if (!member || !role || role.id === pr.id) fail('Not found.');
  if (!perms.canManageRole(pr, me.id, role)) fail('You can only assign roles below your highest role.');
  if (userId !== me.id && !perms.outranks(pr, me.id, userId) && pr.ownerId !== me.id) fail('That member is above you in the hierarchy.');
  if (add && !member.roles.includes(roleId)) member.roles.push(roleId);
  if (!add) member.roles = member.roles.filter((r) => r !== roleId);
  modLog(pr, add ? 'role_add' : 'role_remove', me.id, userId, role.name);
  store.save();
  emitPlayroom(pr);
});

on('member.nick', (me, { prId, userId, nickname }) => {
  const pr = requirePr(prId, me.id);
  const member = pr.members[userId];
  if (!member) fail('Not found.');
  if (userId === me.id) requirePerm(pr, me.id, 'CHANGE_NICKNAME');
  else if (!perms.has(pr, me.id, 'MANAGE_PLAYROOM') || !perms.outranks(pr, me.id, userId)) fail('You can\'t change that nickname.');
  member.nickname = String(nickname || '').slice(0, 32);
  store.save();
  emitPlayroom(pr);
});

function moderate(me, prId, userId, perm) {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, perm);
  if (!pr.members[userId] && perm !== 'BAN_MEMBERS') fail('Not a member.');
  if (pr.members[userId] && !perms.outranks(pr, me.id, userId)) fail('That member is at or above your position in the hierarchy.');
  return pr;
}

on('member.kick', (me, { prId, userId, reason }) => {
  const pr = moderate(me, prId, userId, 'KICK_MEMBERS');
  modLog(pr, 'kick', me.id, userId, String(reason || '').slice(0, 200));
  removeMember(pr, userId);
  toUser(userId, 'notify', { title: `Removed from ${pr.name}`, body: reason ? `Reason: ${reason}` : 'You were kicked.' });
});

on('member.ban', (me, { prId, userId, reason }) => {
  const pr = moderate(me, prId, userId, 'BAN_MEMBERS');
  if (userId === pr.ownerId) fail('You can\'t ban the owner.');
  pr.bans[userId] = { reason: String(reason || '').slice(0, 200), by: me.id, at: now() };
  modLog(pr, 'ban', me.id, userId, pr.bans[userId].reason);
  if (pr.members[userId]) removeMember(pr, userId);
  else { store.save(); emitPlayroom(pr); }
  toUser(userId, 'notify', { title: `Banned from ${pr.name}`, body: reason ? `Reason: ${reason}` : '' });
});

on('member.unban', (me, { prId, userId }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'BAN_MEMBERS');
  delete pr.bans[userId];
  modLog(pr, 'unban', me.id, userId);
  store.save();
  emitPlayroom(pr);
});

on('member.timeout', (me, { prId, userId, minutes }) => {
  const pr = moderate(me, prId, userId, 'TIMEOUT_MEMBERS');
  const mins = Math.min(40320, Math.max(0, parseInt(minutes, 10) || 0));
  pr.members[userId].timeoutUntil = mins ? now() + mins * 60000 : 0;
  modLog(pr, mins ? 'timeout' : 'timeout_clear', me.id, userId, mins ? `${mins} min` : '');
  store.save();
  emitPlayroom(pr);
});

// Invites
on('invite.create', (me, { prId, maxUses, expiresHours }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'CREATE_INVITE');
  const inv = { code: crypto.randomBytes(5).toString('base64url'), by: me.id, uses: 0, maxUses: Math.max(0, parseInt(maxUses, 10) || 0), expiresAt: expiresHours ? now() + expiresHours * 3600000 : 0, createdAt: now() };
  pr.invites.push(inv);
  if (pr.invites.length > 50) pr.invites.shift();
  store.save();
  emitPlayroom(pr);
  return inv;
});

on('invite.revoke', (me, { prId, code }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'CREATE_INVITE');
  const inv = pr.invites.find((i) => i.code === code);
  if (!inv) fail('Invite not found.');
  if (inv.by !== me.id && !perms.has(pr, me.id, 'MANAGE_PLAYROOM')) fail('You can only revoke your own invites.');
  pr.invites = pr.invites.filter((i) => i.code !== code);
  store.save();
  emitPlayroom(pr);
});

// Automod
on('automod.update', (me, { prId, automod: next }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_AUTOMOD');
  const a = pr.automod;
  const n = next || {};
  if (n.enabled !== undefined) a.enabled = !!n.enabled;
  if (['block', 'block_timeout'].includes(n.action)) a.action = n.action;
  if (n.timeoutMinutes !== undefined) a.timeoutMinutes = Math.min(1440, Math.max(1, parseInt(n.timeoutMinutes, 10) || 5));
  if (n.exemptAdmins !== undefined) a.exemptAdmins = !!n.exemptAdmins;
  if (Array.isArray(n.exemptRoles)) a.exemptRoles = n.exemptRoles.filter((r) => pr.roles.some((x) => x.id === r));
  if (n.rules) {
    for (const [k, v] of Object.entries(n.rules)) {
      if (!a.rules[k] || typeof v !== 'object') continue;
      const r = a.rules[k];
      if (v.enabled !== undefined) r.enabled = !!v.enabled;
      if (k === 'bannedWords' && Array.isArray(v.words)) r.words = v.words.map((w) => String(w).trim().slice(0, 60)).filter(Boolean).slice(0, 500);
      if (k === 'links' && Array.isArray(v.allow)) r.allow = v.allow.map((w) => String(w).trim().slice(0, 80)).filter(Boolean).slice(0, 100);
      for (const num of ['max', 'seconds', 'percent', 'minLength']) if (v[num] !== undefined && num in r) r[num] = Math.min(1000, Math.max(1, parseInt(v[num], 10) || r[num]));
    }
  }
  modLog(pr, 'automod_update', me.id, null, a.enabled ? 'enabled' : 'disabled');
  store.save();
  emitPlayroom(pr);
});

// Bots in Playrooms
on('playroom.bots', (me, { prId, botId, add }) => {
  const pr = requirePr(prId, me.id);
  requirePerm(pr, me.id, 'MANAGE_BOTS');
  if (!bots.BOTS.some((b) => b.id === botId)) fail('Unknown bot.');
  if (add && !pr.bots.includes(botId)) pr.bots.push(botId);
  if (!add) pr.bots = pr.bots.filter((b) => b !== botId);
  modLog(pr, add ? 'bot_add' : 'bot_remove', me.id, botId);
  store.save();
  io.to(`pr:${pr.id}`).emit('users', [publicUser(db.users[botId])]);
  emitPlayroom(pr);
});

// ---------------------------------------------------------------------------
// Purge abandoned guest accounts.
for (const u of Object.values(db.users)) {
  if (u.isGuest && now() - (u.lastSeen || 0) > GUEST_TTL_MS) deleteUserData(u, true);
}
store.save();

server.listen(PORT, () => {
  console.log(`💗 Xperiences is running at http://localhost:${PORT}`);
  console.log(`   AI Playroom assistant: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'built-in template engine (set ANTHROPIC_API_KEY to use Claude)'}`);
});

process.on('SIGINT', () => { store.flush(); process.exit(0); });
process.on('SIGTERM', () => { store.flush(); process.exit(0); });

module.exports = { app, server };
