// Xperiences client entry: auth, socket wiring, routing and the app shell.
import { html, raw, setHtml, $, $$, esc, bannerCss, debounce, APP_NAME } from './util.js';
import * as api from './api.js';
import { S, user, upsertUsers, convName, isUnread, playroomUnread, playroomMentions, can, currentChannelId, dmPartner } from './state.js';
import { avatar, nameTag, prIcon, convIcon, toast, menu, registerActions, actions, statusLabel, ping, modal } from './ui.js';
import * as chat from './chat.js';
import * as views from './views.js';
import { openProfile } from './profile.js';
import { openSettings } from './settings.js';
import { openPlayroomSettings, openInvite } from './prsettings.js';
import { openCreatePlayroom, openCreateGroup, openGroupSettings, openNewDm } from './create.js';

export { APP_NAME };
const root = $('#app');

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const mq = matchMedia('(prefers-color-scheme: light)');
export function applyTheme() {
  const s = S.me?.settings || { theme: localStorageGet('xp_theme') || 'dark', accent: '#ff4fa3', fontScale: 1 };
  const theme = s.theme === 'system' ? (mq.matches ? 'light' : 'dark') : s.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent', s.accent || '#ff4fa3');
  document.documentElement.style.setProperty('--font-scale', s.fontScale || 1);
  document.documentElement.classList.toggle('reduce-motion', !!s.reduceMotion);
  localStorageSet('xp_theme', s.theme);
}
mq.addEventListener('change', applyTheme);

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

// ---------------------------------------------------------------------------
// Auth screen
// ---------------------------------------------------------------------------
function renderAuth(mode = 'login') {
  document.title = APP_NAME;
  setHtml(root, html`
  <div class="auth">
    <section class="auth-hero">
      <div class="brand big"><span class="logo">✦</span> ${APP_NAME}</div>
      <h1>Your people.<br>Your Playrooms.<br><span class="grad-text">Free forever.</span></h1>
      <p>Chat with friends, build communities with deep customization, play games with bots and make every corner of your profile yours. No paywalls — ever.</p>
      <ul class="hero-points">
        <li>🎨 Banners, name effects, avatar decorations & card themes</li>
        <li>🏰 Playrooms with roles, hierarchy & a toggleable Automod</li>
        <li>🤖 AI assistant that builds your Playroom for you</li>
        <li>🎲 Free game bots: trivia, hangman, tic-tac-toe & more</li>
      </ul>
      <div class="hero-bubbles"><span>💗</span><span>🎮</span><span>✨</span><span>🌸</span><span>🎧</span></div>
    </section>
    <section class="auth-card">
      <div class="seg">
        <button class="${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">Log in</button>
        <button class="${mode === 'register' ? 'active' : ''}" data-action="auth-mode" data-mode="register">Create account</button>
      </div>
      <form id="auth-form" class="form">
        ${mode === 'register' ? html`<label>Display name<input class="input" name="displayName" maxlength="32" placeholder="How people see you" required></label>` : ''}
        <label>Username<input class="input" name="username" autocomplete="username" placeholder="your_name" required maxlength="24"></label>
        <label>Password<input class="input" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="••••••" required minlength="6"></label>
        <div class="form-error" id="auth-error"></div>
        <button class="btn primary block" type="submit">${mode === 'login' ? 'Log in' : 'Create my free account'}</button>
      </form>
      <div class="or"><span>or</span></div>
      <form id="guest-form" class="guest-row">
        <input class="input" name="displayName" placeholder="Pick a guest name (optional)" maxlength="24">
        <button class="btn ghost" type="submit">Continue as guest</button>
      </form>
      <p class="tiny muted">Guests can chat, join Playrooms and play with bots. Claim your guest account any time to keep it forever — it's free.</p>
    </section>
  </div>`);
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const res = await api.rest(mode === 'login' ? '/api/login' : '/api/register', data);
      api.setToken(res.token);
      start();
    } catch (err) { $('#auth-error').textContent = err.message; }
  };
  $('#guest-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.rest('/api/guest', Object.fromEntries(new FormData(e.target)));
      api.setToken(res.token);
      start();
    } catch (err) { toast(err.message, 'error'); }
  };
}

registerActions({ 'auth-mode': (el) => renderAuth(el.dataset.mode) });

// ---------------------------------------------------------------------------
// Boot & socket
// ---------------------------------------------------------------------------
let pendingInvite = null;
{
  const m = location.pathname.match(/^\/invite\/([\w-]+)/) || location.hash.match(/^#\/invite\/([\w-]+)/);
  if (m) { pendingInvite = m[1]; history.replaceState(null, '', '/#/home'); }
}

export function start() {
  applyTheme();
  if (!api.getToken()) return renderAuth();
  setHtml(root, html`<div class="loading-screen"><div class="logo spin">✦</div><p>Loading ${APP_NAME}…</p></div>`);
  api.disconnect();
  api.connect({
    bootstrap: onBootstrap,
    me: (me) => { S.me = me; applyTheme(); refresh(); },
    user: (u) => { S.users[u.id] = u; if (u.id === S.me?.id) Object.assign(S.me, u); lightRefresh(); },
    users: (list) => { upsertUsers(list); lightRefresh(); },
    playroom: onPlayroom,
    'playroom:remove': ({ id }) => {
      const pr = S.playrooms[id];
      delete S.playrooms[id];
      if (S.route.view === 'playroom' && S.route.prId === id) { if (pr) toast(`You're no longer in ${pr.name}.`); navigate('#/home'); }
      refresh();
    },
    conversation: (cv) => { S.conversations[cv.id] = cv; refresh(); if (S.route.convId === cv.id) chat.refreshHeader(); },
    'conversation:remove': ({ id }) => {
      delete S.conversations[id];
      if (S.route.convId === id) navigate('#/home');
      refresh();
    },
    message: onMessage,
    'message:update': (m) => { chat.updateMessage(m); },
    'message:delete': ({ channelId, messageId }) => chat.removeMessage(channelId, messageId),
    typing: ({ channelId, userId }) => {
      S.typing[channelId] = S.typing[channelId] || {};
      S.typing[channelId][userId] = Date.now() + 4500;
      if (channelId === currentChannelId()) chat.renderTyping();
    },
    notify: ({ title, body }) => { toast(`${title}${body ? ` — ${body}` : ''}`); ping(); },
    connect: () => { S.connected = true; document.body.classList.remove('offline'); },
    disconnect: () => { S.connected = false; document.body.classList.add('offline'); },
    connect_error: (err) => {
      if (err.message === 'unauthorized') { api.setToken(null); api.disconnect(); renderAuth(); }
    },
  });
}

function onBootstrap(data) {
  const firstLoad = !S.me;
  S.me = data.me;
  S.users = {};
  upsertUsers(data.users);
  S.playrooms = Object.fromEntries(data.playrooms.map((p) => [p.id, p]));
  S.conversations = Object.fromEntries(data.conversations.map((c) => [c.id, c]));
  S.permissions = data.permissions;
  S.aiPoweredBy = data.aiPoweredBy;
  S.messages = {};
  applyTheme();
  renderShell();
  route();
  if (firstLoad && pendingInvite) { const c = pendingInvite; pendingInvite = null; showInvite(c); }
  if (firstLoad && S.me.isGuest && !sessionStorageGet('xp_guest_hint')) {
    sessionStorageSet('xp_guest_hint', '1');
    toast('👻 You\'re browsing as a guest. Claim your account in Settings to keep it — free!', 'info', 6000);
  }
}
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

function onPlayroom(pr) {
  const isNew = !S.playrooms[pr.id];
  S.playrooms[pr.id] = pr;
  if (S.route.view === 'playroom' && S.route.prId === pr.id) {
    if (S.route.channelId && !pr.channels.some((c) => c.id === S.route.channelId)) {
      navigate(`#/p/${pr.id}`);
      return;
    }
    chat.refreshHeader();
  }
  refresh();
  document.dispatchEvent(new CustomEvent('xp:playroom', { detail: pr.id }));
  if (isNew && S.pendingOpenPlayroom === pr.id) { S.pendingOpenPlayroom = null; navigate(`#/p/${pr.id}`); }
}

function onMessage(m) {
  const info = chat.ingestMessage(m);
  const isMine = m.authorId === S.me.id;
  const current = m.channelId === currentChannelId();
  // Track last activity for unread state.
  if (info?.kind === 'playroom') info.channel.lastMessageAt = m.createdAt;
  else if (info?.conv) info.conv.lastMessageAt = m.createdAt;
  if (isMine || (current && document.hasFocus())) {
    chat.markRead(m.channelId);
  } else {
    const mentioned = new RegExp(`(^|\\W)@(${S.me.username.replace('.', '\\.')}|everyone|here)\\b`, 'i').test(m.content || '');
    const isDm = info && info.kind !== 'playroom';
    if (mentioned || (info?.kind === 'dm' && m.authorId)) {
      S.mentions[m.channelId] = (S.mentions[m.channelId] || 0) + 1;
      if (S.me.settings.status !== 'dnd') {
        ping();
        if (!current) {
          const author = user(m.authorId);
          const where = info.kind === 'playroom' ? ` in #${info.channel.name} · ${info.pr.name}` : info.kind === 'group' ? ` in ${convName(info.conv)}` : '';
          toast(`${author.displayName}${where}: ${(m.content || '📎 attachment').slice(0, 80)}`);
        }
      }
    } else if (isDm && m.authorId && S.me.settings.status !== 'dnd' && !current) {
      ping();
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden && (mentioned || isDm) && m.authorId && S.me.settings.status !== 'dnd') {
      try { new Notification(user(m.authorId).displayName, { body: (m.content || 'Sent an attachment').slice(0, 120) }); } catch { /* ignore */ }
    }
  }
  if (S.typing[m.channelId]) delete S.typing[m.channelId][m.authorId];
  lightRefresh();
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
window.addEventListener('hashchange', () => route());

function route() {
  if (!S.me) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [view, a, b] = parts;
  S.replyTo = null;
  S.editing = null;
  document.body.classList.remove('show-sidebar');
  if (view === 'invite' && a) { showInvite(a); return navigate('#/home'); }
  if (view === 'p' && S.playrooms[a]) {
    const pr = S.playrooms[a];
    let channelId = b;
    if (!pr.channels.some((c) => c.id === channelId)) {
      channelId = localStorageGet(`xp_last_${pr.id}`);
      if (!pr.channels.some((c) => c.id === channelId)) channelId = (pr.channels.find((c) => c.type === 'text') || pr.channels[0])?.id;
      if (channelId) return navigate(`#/p/${pr.id}/${channelId}`);
    }
    localStorageSet(`xp_last_${pr.id}`, channelId);
    S.route = { view: 'playroom', prId: pr.id, channelId };
  } else if (view === 'discover') S.route = { view: 'discover' };
  else if (view === 'arcade') S.route = { view: 'arcade' };
  else if (view === 'home' && a && S.conversations[a]) S.route = { view: 'home', convId: a };
  else S.route = { view: 'home', sub: a === 'groups' ? 'groups' : 'friends' };
  renderShell(true);
}

async function showInvite(code) {
  try {
    const { playroom } = await api.rest(`/api/invite/${encodeURIComponent(code)}`);
    if (S.playrooms[playroom.id]) return navigate(`#/p/${playroom.id}`);
    views.openPreview(playroom.id, code);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
let shellBuilt = false;
let mainKey = null;

function renderShell(routeChanged = false) {
  if (!shellBuilt || !$('.shell')) {
    setHtml(root, html`
      <div class="shell">
        <header class="topbar"></header>
        <div class="body">
          <aside class="sidebar"></aside>
          <main class="main"></main>
          <aside class="rightpanel"></aside>
        </div>
        <div class="offline-banner">Reconnecting…</div>
      </div>
      <div class="sidebar-scrim" data-action="close-sidebar"></div>`);
    shellBuilt = true;
    mainKey = null;
  }
  if (routeChanged) mainKey = null;
  refresh();
}

export function refresh() {
  if (!S.me || !$('.shell')) return;
  renderTopbar();
  renderSidebar();
  renderMain();
  renderRight();
  updateTitle();
}

// Cheap refresh for presence/profile changes.
const lightRefresh = debounce(() => {
  if (!S.me || !$('.shell')) return;
  renderTopbar();
  renderSidebar();
  renderRight();
  updateTitle();
  if (mainKey && mainKey.startsWith('chat:')) chat.refreshMessagesSoft();
  else if (mainKey === 'friends') views.renderFriends($('.main'));
}, 60);
export { lightRefresh };

function updateTitle() {
  const unread = Object.values(S.mentions).reduce((a, b) => a + b, 0);
  let where = '';
  const r = S.route;
  if (r.view === 'playroom') { const pr = S.playrooms[r.prId]; const ch = pr?.channels.find((c) => c.id === r.channelId); where = ch ? `#${ch.name} · ${pr.name}` : pr?.name; }
  else if (r.convId) where = convName(S.conversations[r.convId]);
  else where = { discover: 'Discover', arcade: 'Bot Arcade' }[r.view] || 'Home';
  document.title = `${unread ? `(${unread}) ` : ''}${where} · ${APP_NAME}`;
}

function homeBadge() {
  let n = S.me.incoming.length;
  for (const cv of Object.values(S.conversations)) n += S.mentions[cv.id] || 0;
  return n;
}
function homeUnread() {
  return Object.values(S.conversations).some((cv) => isUnread(cv.id, cv.lastMessageAt));
}

function renderTopbar() {
  const r = S.route;
  const me = S.me;
  const prs = Object.values(S.playrooms).sort((a, b) => (S.me.settings.prOrder?.indexOf(a.id) ?? 0) - (S.me.settings.prOrder?.indexOf(b.id) ?? 0) || a.createdAt - b.createdAt);
  const hb = homeBadge();
  setHtml($('.topbar'), html`
    <button class="icon-btn only-mobile" data-action="toggle-sidebar" aria-label="Menu">☰</button>
    <a class="brand" href="#/home"><span class="logo">✦</span><span class="brand-name">${APP_NAME}</span></a>
    <nav class="nav-pills">
      <a href="#/home" class="pill ${r.view === 'home' ? 'active' : ''}">🏠<span>Home</span>${hb ? html`<b class="badge">${hb}</b>` : homeUnread() ? html`<i class="dot"></i>` : ''}</a>
      <a href="#/discover" class="pill ${r.view === 'discover' ? 'active' : ''}">🧭<span>Discover</span></a>
      <a href="#/arcade" class="pill ${r.view === 'arcade' ? 'active' : ''}">🕹️<span>Arcade</span></a>
    </nav>
    <div class="pr-strip" role="list" aria-label="Your Playrooms">
      ${prs.map((pr) => {
        const mentions = playroomMentions(pr);
        return html`<a role="listitem" class="pr-chip ${r.prId === pr.id ? 'active' : ''} ${playroomUnread(pr) ? 'unread' : ''}" href="#/p/${pr.id}" title="${pr.name}" data-context="pr-menu" data-id="${pr.id}" style="--pr-accent:${pr.accentColor}">
          ${prIcon(pr, 30)}<span class="pr-chip-name">${pr.name}</span>${mentions ? html`<b class="badge">${mentions}</b>` : ''}
        </a>`;
      })}
      <button class="pr-chip add" data-action="create-playroom" title="Create or join a Playroom">＋<span class="pr-chip-name">New</span></button>
    </div>
    <div class="topbar-right">
      <button class="icon-btn" data-action="toggle-theme" title="Toggle light / dark">${document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'}</button>
      <button class="me-btn" data-action="me-menu">
        ${avatar(me, 32, { status: true })}
        <span class="me-text"><b>${me.displayName}</b><small>${me.profile.customStatus || statusLabel(me.settings.status === 'invisible' ? 'invisible' : me.presence)}</small></span>
      </button>
    </div>`);
}

function renderSidebar() {
  const r = S.route;
  const sb = $('.sidebar');
  document.body.dataset.view = r.view;
  if (r.view === 'discover' || r.view === 'arcade') { sb.innerHTML = ''; return; }
  if (r.view === 'playroom') return renderPlayroomSidebar(sb, S.playrooms[r.prId]);
  const convs = Object.values(S.conversations).sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));
  const dms = convs.filter((c) => c.type === 'dm' && (c.lastMessageAt || c.id === r.convId));
  const groups = convs.filter((c) => c.type === 'group');
  const item = (cv) => {
    const unread = isUnread(cv.id, cv.lastMessageAt) && cv.id !== r.convId;
    const m = S.mentions[cv.id];
    const sub = cv.type === 'dm' ? (dmPartner(cv).profile.customStatus || (dmPartner(cv).isBot ? 'Game bot' : statusLabel(dmPartner(cv).presence))) : `${cv.members.length} members`;
    return html`<a class="conv-item ${cv.id === r.convId ? 'active' : ''} ${unread ? 'unread' : ''}" href="#/home/${cv.id}" data-context="conv-menu" data-id="${cv.id}">
      ${convIcon(cv, 36)}<span class="conv-text"><b>${convName(cv)}</b><small>${sub}</small></span>${m ? html`<b class="badge">${m}</b>` : unread ? html`<i class="dot"></i>` : ''}
    </a>`;
  };
  setHtml(sb, html`
    <div class="sb-search"><input class="input small" placeholder="Find a conversation…" id="conv-filter"></div>
    <div class="sb-scroll">
      <a class="sb-link ${!r.convId ? 'active' : ''}" href="#/home">👯 <span>Friends</span>${S.me.incoming.length ? html`<b class="badge">${S.me.incoming.length}</b>` : ''}</a>
      <div class="sb-section"><span>Direct messages</span><button class="icon-btn tiny" data-action="new-dm" title="New DM">＋</button></div>
      <div class="conv-list" data-kind="dm">${dms.length ? dms.map(item) : html`<p class="empty-hint">No DMs yet. Say hi to a friend!</p>`}</div>
      <div class="sb-section"><span>Group chats</span><button class="icon-btn tiny" data-action="new-group" title="New group chat">＋</button></div>
      <div class="conv-list" data-kind="group">${groups.length ? groups.map(item) : html`<p class="empty-hint">Make a group chat with your friends.</p>`}</div>
    </div>`);
  const f = $('#conv-filter');
  f.oninput = () => {
    const q = f.value.toLowerCase();
    $$('.conv-item', sb).forEach((el) => { el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  };
}

const collapsed = new Set(JSON.parse(localStorageGet('xp_collapsed') || '[]'));

function renderPlayroomSidebar(sb, pr) {
  if (!pr) return;
  const r = S.route;
  const manage = can(pr, 'MANAGE_CHANNELS');
  const chItem = (c) => {
    const unread = isUnread(c.id, c.lastMessageAt) && c.id !== r.channelId;
    const m = S.mentions[c.id];
    return html`<a class="ch-item ${c.id === r.channelId ? 'active' : ''} ${unread ? 'unread' : ''}" href="#/p/${pr.id}/${c.id}" data-context="${manage ? 'ch-menu' : ''}" data-id="${c.id}">
      <span class="ch-icon">${c.type === 'announcement' ? '📢' : c.viewRoles?.length ? '🔒' : '#'}</span><span class="ch-name">${c.name}</span>
      ${m ? html`<b class="badge">${m}</b>` : ''}
      ${manage ? html`<button class="icon-btn tiny ch-gear" data-action="edit-channel" data-id="${c.id}" title="Edit channel">⚙</button>` : ''}
    </a>`;
  };
  const loose = pr.channels.filter((c) => !c.categoryId || !pr.categories.some((k) => k.id === c.categoryId));
  setHtml(sb, html`
    <div class="pr-head" style="background:${raw(bannerCss(pr.banner))};--pr-accent:${pr.accentColor}">
      <button class="pr-head-btn" data-action="pr-menu" data-id="${pr.id}">
        <span class="pr-head-name">${pr.iconEmoji && !pr.icon ? `${pr.iconEmoji} ` : ''}${pr.name}</span><span>▾</span>
      </button>
      <div class="pr-head-meta">${Object.keys(pr.members).length} members ${pr.automod.enabled ? html`· <span title="Automod is on">🛡️ Automod</span>` : ''}</div>
    </div>
    <div class="sb-scroll">
      ${can(pr, 'CREATE_INVITE') ? html`<button class="invite-cta" data-action="invite" data-id="${pr.id}">💌 Invite friends</button>` : ''}
      ${loose.map(chItem)}
      ${pr.categories.map((k) => {
        const chans = pr.channels.filter((c) => c.categoryId === k.id);
        const isCol = collapsed.has(k.id);
        return html`<div class="sb-section cat ${isCol ? 'collapsed' : ''}">
          <button class="cat-toggle" data-action="toggle-cat" data-id="${k.id}"><span class="caret">▾</span>${k.name}</button>
          ${manage ? html`<button class="icon-btn tiny" data-action="add-channel" data-cat="${k.id}" title="Create channel">＋</button>` : ''}
        </div>
        ${isCol ? chans.filter((c) => c.id === r.channelId || isUnread(c.id, c.lastMessageAt)).map(chItem) : chans.map(chItem)}`;
      })}
      ${manage ? html`<button class="sb-add" data-action="add-channel">＋ Add channel</button>` : ''}
    </div>`);
}

function renderMain() {
  const main = $('.main');
  const r = S.route;
  let key;
  if (r.view === 'playroom') key = `chat:${r.channelId || 'none'}`;
  else if (r.view === 'home' && r.convId) key = `chat:${r.convId}`;
  else key = r.view === 'home' ? 'friends' : r.view;
  if (key === mainKey) {
    if (key.startsWith('chat:')) chat.refreshHeader();
    else if (key === 'friends') views.renderFriends(main);
    return;
  }
  mainKey = key;
  main.className = 'main';
  if (key.startsWith('chat:')) {
    const id = key.slice(5);
    if (id === 'none') { setHtml(main, html`<div class="empty-state"><div class="big-emoji">🫧</div><h2>No channels you can see yet</h2></div>`); return; }
    chat.mount(main, id);
  } else if (key === 'friends') views.renderFriends(main);
  else if (key === 'discover') views.renderDiscover(main);
  else if (key === 'arcade') views.renderArcade(main);
}

function renderRight() {
  const rp = $('.rightpanel');
  const r = S.route;
  const show = S.rightPanel && (r.view === 'playroom' || (r.view === 'home' && r.convId));
  document.body.classList.toggle('has-right', !!show);
  if (!show) { rp.innerHTML = ''; return; }
  if (r.view === 'playroom') return views.renderMembers(rp, S.playrooms[r.prId]);
  const cv = S.conversations[r.convId];
  if (!cv) return;
  if (cv.type === 'dm') views.renderDmSide(rp, dmPartner(cv));
  else views.renderGroupSide(rp, cv);
}

// ---------------------------------------------------------------------------
// Global actions
// ---------------------------------------------------------------------------
registerActions({
  'toggle-sidebar': () => document.body.classList.toggle('show-sidebar'),
  'close-sidebar': () => document.body.classList.remove('show-sidebar'),
  'toggle-right': () => { S.rightPanel = !S.rightPanel; renderRight(); },
  'toggle-theme': async () => {
    const cur = document.documentElement.dataset.theme;
    S.me.settings.theme = cur === 'light' ? 'dark' : 'light';
    applyTheme();
    renderTopbar();
    await api.req('me.update', { settings: { theme: S.me.settings.theme } });
  },
  profile: (el) => openProfile(el.dataset.id),
  'me-menu': (el) => {
    const set = (status) => api.req('me.status', { status });
    menu(el, [
      { header: `@${S.me.username}` },
      { icon: '👤', label: 'View my profile', action: () => openProfile(S.me.id) },
      { icon: '🎨', label: 'Edit profile', action: () => openSettings('profile') },
      { icon: '⚙️', label: 'Settings', action: () => openSettings('appearance') },
      { divider: true },
      { icon: '🟢', label: 'Online', active: S.me.settings.status === 'online', action: () => set('online') },
      { icon: '🌙', label: 'Away', active: S.me.settings.status === 'idle', action: () => set('idle') },
      { icon: '⛔', label: 'Do not disturb', hint: 'mutes alerts', active: S.me.settings.status === 'dnd', action: () => set('dnd') },
      { icon: '👻', label: 'Invisible', active: S.me.settings.status === 'invisible', action: () => set('invisible') },
      { divider: true },
      S.me.isGuest ? { icon: '🔑', label: 'Claim guest account', action: () => openSettings('account') } : null,
      { icon: '🚪', label: 'Log out', danger: true, action: logout },
    ]);
  },
  'create-playroom': () => openCreatePlayroom(),
  'new-group': () => openCreateGroup(),
  'new-dm': () => openNewDm(),
  invite: (el) => openInvite(S.playrooms[el.dataset.id]),
  'toggle-cat': (el) => {
    const id = el.dataset.id;
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    localStorageSet('xp_collapsed', JSON.stringify([...collapsed]));
    renderSidebar();
  },
  'add-channel': async (el) => {
    const pr = S.playrooms[S.route.prId];
    views.openChannelEditor(pr, null, el.dataset.cat);
  },
  'edit-channel': (el) => views.openChannelEditor(S.playrooms[S.route.prId], el.dataset.id),
  'ch-menu': (el, ev) => {
    const pr = S.playrooms[S.route.prId];
    const ch = pr.channels.find((c) => c.id === el.dataset.id);
    menu(el, [
      { icon: '⚙️', label: 'Edit channel', action: () => views.openChannelEditor(pr, ch.id) },
      { icon: '✅', label: 'Mark as read', action: () => chat.markRead(ch.id, true) },
      { icon: '⬆️', label: 'Move up', action: () => api.req('channel.update', { prId: pr.id, id: ch.id, move: -1 }) },
      { icon: '⬇️', label: 'Move down', action: () => api.req('channel.update', { prId: pr.id, id: ch.id, move: 1 }) },
    ], ev);
  },
  'pr-menu': (el, ev) => {
    const pr = S.playrooms[el.dataset.id];
    if (!pr) return;
    menu(el, [
      { header: pr.name },
      can(pr, 'CREATE_INVITE') ? { icon: '💌', label: 'Invite people', action: () => openInvite(pr) } : null,
      { icon: '⚙️', label: 'Playroom settings', action: () => openPlayroomSettings(pr.id) },
      { icon: '🏷️', label: 'Change my nickname', action: () => views.changeNickname(pr) },
      { icon: '✅', label: 'Mark all as read', action: () => pr.channels.forEach((c) => chat.markRead(c.id, true)) },
      { icon: '🔗', label: 'Copy Playroom ID', action: () => navigator.clipboard?.writeText(pr.id) },
      { divider: true },
      pr.ownerId !== S.me.id ? { icon: '🚪', label: 'Leave Playroom', danger: true, action: () => views.leavePlayroom(pr) } : null,
    ], ev);
  },
  'conv-menu': (el, ev) => {
    const cv = S.conversations[el.dataset.id];
    menu(el, [
      { icon: '✅', label: 'Mark as read', action: () => chat.markRead(cv.id, true) },
      cv.type === 'dm' ? { icon: '👤', label: 'View profile', action: () => openProfile(dmPartner(cv).id) } : { icon: '⚙️', label: 'Group settings', action: () => openGroupSettings(cv) },
      cv.type === 'group' ? { icon: '🚪', label: 'Leave group', danger: true, action: () => api.req('group.leave', { id: cv.id }) } : null,
    ], ev);
  },
  spoiler: (el) => el.classList.add('revealed'),
});

export async function logout() {
  try { await api.rest('/api/logout', {}); } catch { /* ignore */ }
  api.setToken(null);
  api.disconnect();
  Object.assign(S, { me: null, users: {}, playrooms: {}, conversations: {}, messages: {}, mentions: {} });
  shellBuilt = false;
  location.hash = '';
  renderAuth();
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!S.me) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    views.quickSwitcher();
  }
});

window.addEventListener('focus', () => { const id = currentChannelId(); if (id) chat.markRead(id); });

start();

// Expose a couple of helpers for modules that need them without import cycles.
export const app = { refresh, navigate, renderSidebar: () => renderSidebar(), renderRight: () => renderRight() };
window.__xp = { S, actions };
