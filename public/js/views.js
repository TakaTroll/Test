// Friends, Discover, Bot Arcade, member lists and small dialogs.
import { html, raw, setHtml, $, $$, esc, bannerCss, ago, markdown, debounce, APP_NAME } from './util.js';
import * as api from './api.js';
import { S, user, memberName, memberRoles, roleColor, can, convName, upsertUsers } from './state.js';
import { avatar, nameTag, prIcon, convIcon, toast, menu, modal, registerActions, confirmDialog, promptDialog, statusLabel } from './ui.js';
import { navigate } from './app.js';
import { openProfile, profileCardHtml } from './profile.js';
import { openCreatePlayroom } from './create.js';
import { openSettings } from './settings.js';

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------
let friendsTab = 'online';

export function renderFriends(main) {
  main.className = 'main friends-main';
  const me = S.me;
  const friends = me.friends.map(user).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const online = friends.filter((u) => u.presence !== 'offline');
  const tabs = [['online', `Online · ${online.length}`], ['all', `All · ${friends.length}`], ['pending', `Pending${me.incoming.length ? ` · ${me.incoming.length}` : ''}`], ['blocked', 'Blocked'], ['add', '➕ Add friend']];
  let list = [];
  if (friendsTab === 'online') list = online;
  if (friendsTab === 'all') list = friends;
  const row = (u, extra) => html`<div class="friend-row" data-action="profile" data-id="${u.id}">
    ${avatar(u, 42, { status: true })}
    <div class="fr-text">${nameTag(u, { action: false })}<small>${u.profile.customStatus || statusLabel(u.presence)}</small></div>
    <div class="fr-actions">${extra}</div>
  </div>`;
  let content;
  if (friendsTab === 'add') {
    content = html`<div class="add-friend">
      <h2>Add a friend</h2><p class="muted">Send a request with their username. Usernames are lowercase, like <code>pixel.pal</code>.</p>
      ${me.isGuest ? html`<div class="notice">👻 Guests can't add friends yet. <a href="#" data-action="claim">Claim your account</a> — it's free and keeps everything.</div>` : ''}
      <form id="add-friend-form" class="row gap"><input class="input grow" name="username" placeholder="Enter a username" autocomplete="off" ${me.isGuest ? 'disabled' : ''}><button class="btn primary" ${me.isGuest ? 'disabled' : ''}>Send request</button></form>
      <div class="suggest-cards">
        <div class="suggest" data-action="go-discover"><span>🧭</span><b>Explore Playrooms</b><small>Find communities you'll love</small></div>
        <div class="suggest" data-action="go-arcade"><span>🕹️</span><b>Play with bots</b><small>Trivia, hangman, tic-tac-toe…</small></div>
        <div class="suggest" data-action="create-playroom"><span>✨</span><b>Build a Playroom</b><small>Let the AI assistant set it up</small></div>
      </div>
    </div>`;
  } else if (friendsTab === 'pending') {
    const inc = me.incoming.map(user);
    const out = me.outgoing.map(user);
    content = html`${inc.length ? html`<h4 class="list-h">Incoming — ${inc.length}</h4>${inc.map((u) => row(u, html`<button class="btn small primary" data-action="accept-friend" data-id="${u.id}">Accept</button><button class="btn small ghost" data-action="remove-friend" data-id="${u.id}">Ignore</button>`))}` : ''}
      ${out.length ? html`<h4 class="list-h">Outgoing — ${out.length}</h4>${out.map((u) => row(u, html`<button class="btn small ghost" data-action="remove-friend" data-id="${u.id}">Cancel</button>`))}` : ''}
      ${!inc.length && !out.length ? html`<div class="empty-state"><div class="big-emoji">📭</div><p class="muted">No pending requests.</p></div>` : ''}`;
  } else if (friendsTab === 'blocked') {
    const bl = me.blocked.map(user);
    content = bl.length ? html`${bl.map((u) => row(u, html`<button class="btn small ghost" data-action="unblock" data-id="${u.id}">Unblock</button>`))}` : html`<div class="empty-state"><div class="big-emoji">🕊️</div><p class="muted">You haven't blocked anyone.</p></div>`;
  } else {
    content = list.length ? html`${list.map((u) => row(u, html`<button class="icon-btn" data-action="dm-user" data-id="${u.id}" title="Message">💬</button><button class="icon-btn" data-action="friend-menu" data-id="${u.id}" title="More">⋯</button>`))}`
      : html`<div class="empty-state"><div class="big-emoji">${friendsTab === 'online' ? '🌙' : '🫂'}</div><h3>${friendsTab === 'online' ? 'No friends online right now' : 'No friends yet'}</h3><p class="muted">Add friends by username or meet people in public Playrooms.</p><button class="btn primary" data-action="friends-tab" data-tab="add">Add a friend</button></div>`;
  }
  const activity = friends.filter((u) => u.profile.nowPlaying && u.presence !== 'offline');
  setHtml(main, html`
    <header class="chat-head"><div class="chat-title"><span class="ch-icon big">👯</span><div class="chat-title-text"><h1>Friends</h1></div></div>
      <nav class="tabs">${tabs.map(([k, l]) => html`<button class="tab ${friendsTab === k ? 'active' : ''} ${k === 'add' ? 'accent' : ''}" data-action="friends-tab" data-tab="${k}">${l}</button>`)}</nav>
    </header>
    <div class="friends-layout">
      <div class="friends-list">${content}</div>
      <aside class="activity">
        <h3>Active now</h3>
        ${activity.length ? activity.map((u) => html`<div class="activity-card" data-action="profile" data-id="${u.id}">${avatar(u, 32, { status: true })}<div><b>${u.displayName}</b><small>🎮 ${u.profile.nowPlaying}</small></div></div>`) : html`<p class="muted small">It's quiet for now… When friends set a "Now playing" status, it shows up here.</p>`}
        ${S.me.isGuest ? html`<div class="notice">👻 Guest mode — <a href="#" data-action="claim">claim your account</a> to keep your stuff.</div>` : ''}
      </aside>
    </div>`);
  const form = $('#add-friend-form');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const username = new FormData(form).get('username').trim();
    if (!username) return;
    try { await api.req('friends.request', { username }); toast(`Friend request sent to ${username} 💌`); form.reset(); } catch (err) { toast(err.message, 'error'); }
  };
}

registerActions({
  'friends-tab': (el) => { friendsTab = el.dataset.tab; renderFriends($('.main')); },
  'accept-friend': (el) => api.req('friends.accept', { userId: el.dataset.id }),
  'remove-friend': (el) => api.req('friends.remove', { userId: el.dataset.id }),
  unblock: (el) => api.req('user.block', { userId: el.dataset.id, block: false }),
  'dm-user': async (el) => { const cv = await api.req('dm.open', { userId: el.dataset.id }); S.conversations[cv.id] = cv; navigate(`#/home/${cv.id}`); },
  'friend-menu': (el) => {
    const id = el.dataset.id;
    menu(el, [
      { icon: '👤', label: 'Profile', action: () => openProfile(id) },
      { icon: '💔', label: 'Remove friend', danger: true, action: async () => { if (await confirmDialog({ title: 'Remove friend?', message: `Remove ${user(id).displayName} from your friends?`, confirm: 'Remove', danger: true })) api.req('friends.remove', { userId: id }); } },
      { icon: '🚫', label: 'Block', danger: true, action: () => api.req('user.block', { userId: id, block: true }) },
    ]);
  },
  'go-discover': () => navigate('#/discover'),
  'go-arcade': () => navigate('#/arcade'),
  claim: () => openSettings('account'),
});

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------
const disc = { q: '', tag: '', sort: 'popular' };

export async function renderDiscover(main) {
  main.className = 'main discover-main';
  setHtml(main, html`
    <div class="discover">
      <section class="disc-hero">
        
        <h1>Find your Playroom 🧭</h1>
        <p>Thousands of vibes, zero paywalls. Search communities or make your own in seconds.</p>
        <div class="disc-search"><span>🔎</span><input id="disc-q" placeholder="Search by name, topic or tag…" value="${disc.q}"><button class="btn primary" data-action="create-playroom">✨ Create</button></div>
        <form class="disc-invite" id="disc-invite"><input class="input small" name="code" placeholder="Have an invite code? Paste it here"><button class="btn small ghost">Join</button></form>
      </section>
      <div class="disc-controls">
        <div class="tag-row" id="disc-tags"></div>
        <div class="seg small">${[['popular', '🔥 Popular'], ['active', '⚡ Active'], ['new', '🌱 New']].map(([k, l]) => html`<button class="${disc.sort === k ? 'active' : ''}" data-action="disc-sort" data-sort="${k}">${l}</button>`)}</div>
      </div>
      <div class="disc-grid" id="disc-grid"><div class="msg-loading"><span class="spinner"></span></div></div>
    </div>`);
  $('#disc-q').oninput = debounce((e) => { disc.q = e.target.value; loadDiscover(); }, 250);
  $('#disc-invite').onsubmit = async (e) => {
    e.preventDefault();
    let code = new FormData(e.target).get('code').trim();
    code = code.replace(/.*\/invite\//, '');
    if (!code) return;
    try { const { playroom } = await api.rest(`/api/invite/${encodeURIComponent(code)}`); openPreview(playroom.id, code); } catch (err) { toast(err.message, 'error'); }
  };
  loadDiscover();
}

async function loadDiscover() {
  const grid = $('#disc-grid');
  if (!grid) return;
  try {
    const params = new URLSearchParams(disc);
    const { playrooms, tags } = await api.rest(`/api/discover?${params}`);
    const tagEl = $('#disc-tags');
    if (tagEl) setHtml(tagEl, html`<button class="tag ${!disc.tag ? 'active' : ''}" data-action="disc-tag" data-tag="">All</button>${tags.map((t) => html`<button class="tag ${disc.tag === t ? 'active' : ''}" data-action="disc-tag" data-tag="${t}">#${t}</button>`)}`);
    if (!playrooms.length) {
      setHtml(grid, html`<div class="empty-state wide"><div class="big-emoji">🏝️</div><h3>${disc.q || disc.tag ? 'Nothing matches that yet' : 'No public Playrooms yet'}</h3><p class="muted">Be the first — create one and it'll show up here for everyone.</p><button class="btn primary" data-action="create-playroom">✨ Create a Playroom</button></div>`);
      return;
    }
    setHtml(grid, html`${playrooms.map((p) => html`<article class="disc-card" data-action="preview-pr" data-id="${p.id}" style="--pr-accent:${p.accentColor}">
      <div class="disc-banner" style="background:${raw(bannerCss(p.banner))}"></div>
      <div class="disc-icon">${prIcon(p, 56)}</div>
      <div class="disc-body">
        <h3>${p.name}</h3>
        <p>${p.description || 'A brand new Playroom.'}</p>
        <div class="disc-tags">${p.tags.slice(0, 4).map((t) => html`<span>#${t}</span>`)}</div>
        <div class="disc-meta"><span><i class="dot on"></i>${p.onlineCount} online</span><span><i class="dot"></i>${p.memberCount} member${p.memberCount === 1 ? '' : 's'}</span>${p.bots.length ? html`<span>🤖 ${p.bots.length}</span>` : ''}</div>
      </div>
      <button class="btn ${S.playrooms[p.id] ? 'ghost' : 'primary'} disc-join" data-action="${S.playrooms[p.id] ? 'open-pr' : 'join-pr'}" data-id="${p.id}">${S.playrooms[p.id] ? 'Open' : 'Join'}</button>
    </article>`)}`);
  } catch (err) { setHtml(grid, html`<p class="muted">${err.message}</p>`); }
}

export async function openPreview(id, code) {
  const p = await api.req('playroom.preview', { id }).catch(async () => (await api.rest(`/api/invite/${code}`)).playroom);
  modal({
    className: 'preview-modal',
    body: html`
      <div class="pv-banner" style="background:${raw(bannerCss(p.banner))}"></div>
      <div class="pv-head">${prIcon(p, 72)}<div><h2>${p.name}</h2><div class="disc-meta"><span><i class="dot on"></i>${p.onlineCount} online</span><span><i class="dot"></i>${p.memberCount} member${p.memberCount === 1 ? '' : 's'}</span></div></div></div>
      <p>${p.description}</p>
      ${p.tags?.length ? html`<div class="disc-tags">${p.tags.map((t) => html`<span>#${t}</span>`)}</div>` : ''}
      ${p.channels ? html`<h4>Channels</h4><div class="pv-channels">${p.channels.slice(0, 12).map((c) => html`<span>${c.type === 'announcement' ? '📢' : '#'} ${c.name}</span>`)}</div>` : ''}
      ${p.roles?.length ? html`<h4>Roles</h4><div class="pv-roles">${p.roles.map((r) => html`<span class="role-pill" style="--rc:${r.color || '#999'}"><i></i>${r.name}</span>`)}</div>` : ''}
      ${p.rules ? html`<h4>Rules</h4><div class="pv-rules">${raw(markdown(p.rules))}</div>` : ''}
      ${p.owner ? html`<p class="muted small">Created by ${p.owner.displayName} · ${ago(p.createdAt)}</p>` : ''}`,
    footer: (f, m) => {
      setHtml(f, html`<span class="grow"></span><button class="btn primary">${S.playrooms[p.id] ? 'Open Playroom' : '💗 Join Playroom'}</button>`);
      f.querySelector('button').onclick = async () => {
        if (!S.playrooms[p.id]) {
          S.pendingOpenPlayroom = p.id;
          await api.req('playroom.join', code ? { code } : { id: p.id });
          toast(`Welcome to ${p.name}! 💗`);
        }
        m.close();
        if (S.playrooms[p.id]) navigate(`#/p/${p.id}`);
      };
    },
  });
}

registerActions({
  'disc-tag': (el) => { disc.tag = el.dataset.tag; loadDiscover(); },
  'disc-sort': (el) => { disc.sort = el.dataset.sort; $$('[data-action=disc-sort]').forEach((b) => b.classList.toggle('active', b === el)); loadDiscover(); },
  'preview-pr': (el) => openPreview(el.dataset.id),
  'open-pr': (el) => navigate(`#/p/${el.dataset.id}`),
  'join-pr': async (el) => {
    S.pendingOpenPlayroom = el.dataset.id;
    await api.req('playroom.join', { id: el.dataset.id });
    if (S.playrooms[el.dataset.id]) navigate(`#/p/${el.dataset.id}`);
  },
});

// ---------------------------------------------------------------------------
// Bot Arcade
// ---------------------------------------------------------------------------
export async function renderArcade(main) {
  main.className = 'main arcade-main';
  setHtml(main, html`<div class="arcade"><section class="disc-hero arcade-hero"><h1>Bot Arcade 🕹️</h1><p>Free, public game bots for every Playroom and group chat. Add them in one click — or DM them to play solo.</p></section><div class="bot-grid" id="bot-grid"><div class="msg-loading"><span class="spinner"></span></div></div></div>`);
  const { bots } = await api.rest('/api/bots');
  upsertUsers(bots);
  setHtml($('#bot-grid'), html`${bots.map((b) => html`<article class="bot-card" style="--bot:${b.color}">
    <div class="bot-top">${avatar(b, 64)}<div><h3>${b.displayName} <span class="tag-bot">BOT</span></h3><p>${b.tagline}</p><small class="muted">In ${b.installs} Playroom${b.installs === 1 ? '' : 's'}</small></div></div>
    <ul class="bot-cmds">${b.commands.map(([c, d]) => html`<li><code>${c}</code><span>${d}</span></li>`)}</ul>
    <div class="row gap"><button class="btn primary grow" data-action="bot-add" data-id="${b.id}">＋ Add to…</button><button class="btn ghost" data-action="dm-user" data-id="${b.id}">💬 Play in DM</button></div>
  </article>`)}`);
}

registerActions({
  'bot-add': (el) => {
    const botId = el.dataset.id;
    const prs = Object.values(S.playrooms).filter((p) => can(p, 'MANAGE_BOTS'));
    const groups = Object.values(S.conversations).filter((c) => c.type === 'group');
    if (!prs.length && !groups.length) return toast('Create a Playroom or group chat first — then add bots to it!');
    menu(el, [
      prs.length ? { header: 'Your Playrooms' } : null,
      ...prs.map((p) => ({ icon: p.bots.includes(botId) ? '✅' : p.iconEmoji || '🏠', label: p.name, hint: p.bots.includes(botId) ? 'remove' : '', action: async () => { await api.req('playroom.bots', { prId: p.id, botId, add: !p.bots.includes(botId) }); toast(p.bots.includes(botId) ? 'Bot removed' : `Added to ${p.name} 🎉`); } })),
      groups.length ? { header: 'Group chats' } : null,
      ...groups.map((c) => ({ icon: (c.bots || []).includes(botId) ? '✅' : '💬', label: convName(c), hint: (c.bots || []).includes(botId) ? 'remove' : '', action: async () => { await api.req('conv.bots', { id: c.id, botId, add: !(c.bots || []).includes(botId) }); toast((c.bots || []).includes(botId) ? 'Bot removed' : 'Bot added 🎉'); } })),
    ]);
  },
});

// ---------------------------------------------------------------------------
// Right panels
// ---------------------------------------------------------------------------
export function renderMembers(rp, pr) {
  if (!pr) return;
  const ids = Object.keys(pr.members);
  const groups = new Map();
  const hoisted = pr.roles.filter((r) => r.hoist && r.id !== pr.id).sort((a, b) => b.position - a.position);
  const offline = [];
  for (const id of ids) {
    const u = user(id);
    if (u.presence === 'offline') { offline.push(id); continue; }
    const r = memberRoles(pr, id).find((x) => x.hoist);
    const key = r ? r.id : 'online';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  const sortIds = (arr) => arr.sort((a, b) => memberName(pr, a).localeCompare(memberName(pr, b)));
  const row = (id) => {
    const u = user(id);
    const m = pr.members[id];
    return html`<div class="member ${u.presence === 'offline' ? 'off' : ''}" data-action="profile" data-id="${id}" data-context="member-menu">
      ${avatar(u, 34, { status: true })}
      <div class="member-text"><div class="mt-line">${nameTag(u, { color: roleColor(pr, id), text: memberName(pr, id), action: false })}${pr.ownerId === id ? html`<span title="Owner" class="crown">👑</span>` : ''}${m.timeoutUntil > Date.now() ? html`<span title="Timed out">⏳</span>` : ''}</div>
      ${u.profile.customStatus ? html`<small>${u.profile.statusEmoji} ${u.profile.customStatus}</small>` : u.profile.nowPlaying ? html`<small>🎮 ${u.profile.nowPlaying}</small>` : ''}</div>
    </div>`;
  };
  const sections = [];
  for (const r of hoisted) if (groups.get(r.id)?.length) sections.push(html`<h4 class="list-h" style="color:${r.color}">${r.name} — ${groups.get(r.id).length}</h4>${sortIds(groups.get(r.id)).map(row)}`);
  if (groups.get('online')?.length) sections.push(html`<h4 class="list-h">Online — ${groups.get('online').length}</h4>${sortIds(groups.get('online')).map(row)}`);
  if (pr.bots.length) sections.push(html`<h4 class="list-h">Game bots — ${pr.bots.length}</h4>${pr.bots.map((b) => html`<div class="member" data-action="profile" data-id="${b}">${avatar(user(b), 34, { status: true })}<div class="member-text"><div class="mt-line">${nameTag(user(b), { action: false })}</div><small>${user(b).bot?.tagline || ''}</small></div></div>`)}`);
  if (offline.length) sections.push(html`<h4 class="list-h">Offline — ${offline.length}</h4>${sortIds(offline).map(row)}`);
  setHtml(rp, html`<div class="rp-scroll"><div class="rp-search"><input class="input small" placeholder="Search members" id="mem-q"></div>${sections}</div>`);
  $('#mem-q').oninput = (e) => { const q = e.target.value.toLowerCase(); $$('.member', rp).forEach((m) => { m.style.display = m.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
}

export function renderDmSide(rp, u) {
  setHtml(rp, html`<div class="rp-scroll dm-side">${profileCardHtml(u, { compact: true })}<button class="btn ghost block" data-action="profile" data-id="${u.id}">View full profile</button></div>`);
}

export function renderGroupSide(rp, cv) {
  setHtml(rp, html`<div class="rp-scroll">
    <div class="group-side-head">${convIcon(cv, 64)}<h3>${convName(cv)}</h3><button class="btn small ghost" data-action="group-settings">⚙️ Group settings</button></div>
    <h4 class="list-h">Members — ${cv.members.length}</h4>
    ${cv.members.map((id) => html`<div class="member" data-action="profile" data-id="${id}">${avatar(user(id), 34, { status: true })}<div class="member-text"><div class="mt-line">${nameTag(user(id), { action: false })}${cv.ownerId === id ? html`<span class="crown" title="Group owner">👑</span>` : ''}</div></div></div>`)}
    ${cv.bots?.length ? html`<h4 class="list-h">Game bots — ${cv.bots.length}</h4>${cv.bots.map((b) => html`<div class="member" data-action="profile" data-id="${b}">${avatar(user(b), 34, { status: true })}<div class="member-text"><div class="mt-line">${nameTag(user(b), { action: false })}</div></div></div>`)}` : ''}
  </div>`);
}

registerActions({
  'member-menu': (el, ev) => {
    const pr = S.playrooms[S.route.prId];
    const id = el.dataset.id;
    import('./prsettings.js').then(({ memberActions }) => menu(el, memberActions(pr, id), ev));
  },
});

// ---------------------------------------------------------------------------
// Channel editor
// ---------------------------------------------------------------------------
export function openChannelEditor(pr, channelId, categoryId) {
  const ch = channelId ? pr.channels.find((c) => c.id === channelId) : null;
  const roles = pr.roles.filter((r) => r.id !== pr.id).sort((a, b) => b.position - a.position);
  const v = ch ? { ...ch } : { name: '', type: 'text', topic: '', categoryId: categoryId || pr.categories[0]?.id || null, slowmode: 0, viewRoles: [], writeRoles: [] };
  modal({
    title: ch ? `Edit #${ch.name}` : 'Create channel',
    body: html`<form class="form" id="ch-form">
      <div class="seg">${[['text', '# Text'], ['announcement', '📢 Announcement']].map(([k, l]) => html`<label class="seg-opt"><input type="radio" name="type" value="${k}" ${v.type === k ? 'checked' : ''}><span>${l}</span></label>`)}</div>
      <label>Name<input class="input" name="name" value="${v.name}" placeholder="new-channel" required maxlength="32"></label>
      <label>Topic<input class="input" name="topic" value="${v.topic}" placeholder="What's this channel about?" maxlength="200"></label>
      <div class="row gap">
        <label class="grow">Category<select class="input" name="categoryId"><option value="">No category</option>${pr.categories.map((k) => html`<option value="${k.id}" ${v.categoryId === k.id ? 'selected' : ''}>${k.name}</option>`)}</select></label>
        <label class="grow">Slowmode<select class="input" name="slowmode">${[[0, 'Off'], [5, '5s'], [10, '10s'], [30, '30s'], [60, '1m'], [300, '5m'], [900, '15m'], [3600, '1h']].map(([s, l]) => html`<option value="${s}" ${Number(v.slowmode) === s ? 'selected' : ''}>${l}</option>`)}</select></label>
      </div>
      ${roles.length ? html`
      <fieldset><legend>🔒 Private — only these roles can see it <small class="muted">(none = everyone)</small></legend><div class="check-grid">${roles.map((r) => html`<label class="check"><input type="checkbox" name="viewRoles" value="${r.id}" ${v.viewRoles.includes(r.id) ? 'checked' : ''}><span class="role-dot" style="--rc:${r.color}"></span>${r.name}</label>`)}</div></fieldset>
      <fieldset><legend>✍️ Who can post <small class="muted">(none = everyone with Send Messages; announcement channels need a role or Manage Channels)</small></legend><div class="check-grid">${roles.map((r) => html`<label class="check"><input type="checkbox" name="writeRoles" value="${r.id}" ${v.writeRoles.includes(r.id) ? 'checked' : ''}><span class="role-dot" style="--rc:${r.color}"></span>${r.name}</label>`)}</div></fieldset>` : ''}
    </form>`,
    footer: (f, m) => {
      setHtml(f, html`${ch ? html`<button class="btn danger ghost" data-x="del">Delete channel</button>` : ''}<span class="grow"></span><button class="btn ghost" data-x="cancel">Cancel</button><button class="btn primary" data-x="save">${ch ? 'Save' : 'Create'}</button>`);
      f.querySelector('[data-x=cancel]').onclick = m.close;
      f.querySelector('[data-x=del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: `Delete #${ch.name}?`, message: 'All messages in it will be gone forever.', confirm: 'Delete', danger: true }))) return;
        await api.req('channel.delete', { prId: pr.id, id: ch.id });
        m.close();
      });
      f.querySelector('[data-x=save]').onclick = async () => {
        const form = m.el.querySelector('#ch-form');
        const fd = new FormData(form);
        const patch = { name: fd.get('name'), topic: fd.get('topic'), type: fd.get('type'), categoryId: fd.get('categoryId') || null, slowmode: Number(fd.get('slowmode')), viewRoles: fd.getAll('viewRoles'), writeRoles: fd.getAll('writeRoles') };
        if (!patch.name.trim()) return toast('Give the channel a name.', 'error');
        try {
          if (ch) await api.req('channel.update', { prId: pr.id, id: ch.id, patch });
          else {
            const { id } = await api.req('channel.create', { prId: pr.id, ...patch });
            await api.req('channel.update', { prId: pr.id, id, patch: { slowmode: patch.slowmode, viewRoles: patch.viewRoles, writeRoles: patch.writeRoles } });
            navigate(`#/p/${pr.id}/${id}`);
          }
          m.close();
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}

export async function changeNickname(pr) {
  const nick = await promptDialog(`Nickname in ${pr.name}`, { value: pr.members[S.me.id].nickname, placeholder: S.me.displayName, message: 'Leave empty to use your display name.' });
  if (nick === null) return;
  await api.req('member.nick', { prId: pr.id, userId: S.me.id, nickname: nick });
}

export async function leavePlayroom(pr) {
  if (!(await confirmDialog({ title: `Leave ${pr.name}?`, message: 'You can rejoin later if it\'s public or with an invite.', confirm: 'Leave', danger: true }))) return;
  await api.req('playroom.leave', { id: pr.id });
  navigate('#/home');
}

// ---------------------------------------------------------------------------
// Quick switcher (Ctrl/Cmd + K)
// ---------------------------------------------------------------------------
export function quickSwitcher() {
  const items = [];
  for (const pr of Object.values(S.playrooms)) {
    items.push({ label: pr.name, sub: 'Playroom', icon: pr.iconEmoji || '🏠', href: `#/p/${pr.id}` });
    for (const c of pr.channels) items.push({ label: `#${c.name}`, sub: pr.name, icon: '#', href: `#/p/${pr.id}/${c.id}` });
  }
  for (const cv of Object.values(S.conversations)) items.push({ label: convName(cv), sub: cv.type === 'dm' ? 'Direct message' : 'Group chat', icon: cv.type === 'dm' ? '💬' : '👥', href: `#/home/${cv.id}` });
  items.push({ label: 'Discover', sub: 'Find Playrooms', icon: '🧭', href: '#/discover' }, { label: 'Bot Arcade', sub: 'Game bots', icon: '🕹️', href: '#/arcade' }, { label: 'Friends', sub: 'Home', icon: '👯', href: '#/home' });
  const m = modal({
    className: 'switcher',
    body: (b) => {
      setHtml(b, html`<input class="input" placeholder="Where would you like to go?" id="qs-input"><div class="qs-list" id="qs-list"></div><p class="tiny muted">Tip: ↑ ↓ to move, Enter to open.</p>`);
      const inp = $('#qs-input', b);
      const list = $('#qs-list', b);
      let sel = 0;
      let shown = [];
      const draw = () => {
        const q = inp.value.toLowerCase();
        shown = items.filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(q)).slice(0, 12);
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        setHtml(list, html`${shown.map((i, n) => html`<a class="qs-item ${n === sel ? 'sel' : ''}" href="${i.href}"><span class="qs-icon">${i.icon}</span><b>${i.label}</b><small>${i.sub}</small></a>`)}`);
        $$('.qs-item', list).forEach((a) => a.onclick = () => m.close());
      };
      inp.oninput = () => { sel = 0; draw(); };
      inp.onkeydown = (e) => {
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
        if (e.key === 'Enter' && shown[sel]) { navigate(shown[sel].href); m.close(); }
      };
      draw();
      setTimeout(() => inp.focus(), 20);
    },
  });
}
