// Create Playroom (with the AI assistant), group chats and new DMs.
import { html, raw, setHtml, $, $$, esc, GRADIENTS, bannerCss } from './util.js';
import * as api from './api.js';
import { S, user, convName } from './state.js';
import { avatar, modal, toast, emojiPicker, confirmDialog, convIcon } from './ui.js';
import { navigate } from './app.js';

const PERMISSION_LABELS = { ADMINISTRATOR: 'Admin', MANAGE_MESSAGES: 'Manage msgs', KICK_MEMBERS: 'Kick', BAN_MEMBERS: 'Ban', TIMEOUT_MEMBERS: 'Timeout', MANAGE_AUTOMOD: 'Automod', VIEW_MOD_LOG: 'Mod log', MENTION_EVERYONE: '@everyone', MANAGE_CHANNELS: 'Channels', MANAGE_ROLES: 'Roles', MANAGE_PLAYROOM: 'Settings', MANAGE_BOTS: 'Bots' };
const BOT_NAMES = { bot_dicey: '🎲 Dicey', bot_quizzy: '🧠 Quizzy', bot_hangry: '🪢 Hangry', bot_tictac: '⭕ TicTac', bot_rps: '✂️ Rock Paper Bot', bot_scramble: '🔤 Scramble' };
const IDEAS = ['A cozy Minecraft SMP for builders and redstone nerds', 'Study group for university exams, focused and chill', 'Anime & manga club with fan art and weekly watch parties', 'Small private hangout for my close friends, with games', 'Indie music producers sharing beats and feedback', 'D&D campaign "The Lost Lanterns" with in-character channels'];

export function openCreatePlayroom() {
  let mode = 'ai';
  let blueprint = null;
  modal({
    title: '',
    wide: true,
    className: 'create-modal',
    body: (b, m) => {
      const draw = () => {
        setHtml(b, html`
          <div class="create-head">
            <h2>✨ New Playroom</h2>
            <div class="seg">${[['ai', '🤖 AI assistant'], ['manual', '🛠️ From scratch'], ['join', '💌 Join with invite']].map(([k, l]) => html`<button class="${mode === k ? 'active' : ''}" data-mode="${k}">${l}</button>`)}</div>
          </div>
          <div id="create-body"></div>`);
        $$('[data-mode]', b).forEach((x) => x.onclick = () => { mode = x.dataset.mode; draw(); });
        const body = $('#create-body', b);
        if (S.me.isGuest && mode !== 'join') {
          setHtml(body, html`<div class="notice">👻 Guests can join Playrooms but not create them. <a href="#" data-action="claim">Claim your free account</a> to build your own!</div>`);
          return;
        }
        if (mode === 'join') return joinView(body, m);
        if (mode === 'manual') return manualView(body, m);
        aiView(body, m);
      };
      const aiView = (body, m) => {
        setHtml(body, html`
          <div class="ai-box">
            <div class="ai-avatar">🤖</div>
            <div class="ai-bubble">Hi! Describe the Playroom you dream of — the vibe, topic, who it's for, public or private — and I'll set up the channels, roles, bots and Automod for you. ${S.aiPoweredBy === 'claude' ? html`<small class="muted">(powered by Claude)</small>` : ''}</div>
          </div>
          <form id="ai-form" class="ai-form"><textarea class="input" name="prompt" rows="3" placeholder="e.g. A cozy Minecraft community for builders, with events and trading" maxlength="1000" required></textarea><button class="btn primary">✨ Generate</button></form>
          <div class="ideas">${IDEAS.map((i) => html`<button class="tag" data-idea="${i}">${i}</button>`)}</div>
          <div id="bp"></div>`);
        const form = $('#ai-form', body);
        $$('[data-idea]', body).forEach((x) => x.onclick = () => { form.prompt.value = x.dataset.idea; form.requestSubmit(); });
        form.onsubmit = async (e) => {
          e.preventDefault();
          const btn = form.querySelector('button');
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner small"></span> Designing…';
          try {
            const res = await api.rest('/api/ai/playroom', { prompt: form.prompt.value });
            blueprint = res.blueprint;
            renderBlueprint($('#bp', body), m);
          } catch (err) { toast(err.message, 'error'); }
          btn.disabled = false;
          btn.textContent = '✨ Regenerate';
        };
        if (blueprint) renderBlueprint($('#bp', body), m);
      };
      const renderBlueprint = (el, m) => {
        const bp = blueprint;
        setHtml(el, html`
          <div class="blueprint">
            <div class="bp-banner" style="background:${raw(GRADIENTS[bp.banner] || `linear-gradient(135deg, ${bp.accentColor}, #7b2ff7)`)}"></div>
            <div class="bp-head">
              <button class="bp-emoji" id="bp-emoji" type="button">${bp.iconEmoji}</button>
              <div class="grow"><input class="input bp-name" id="bp-name" value="${bp.name}" maxlength="48"><textarea class="input" id="bp-desc" rows="2" maxlength="300">${bp.description}</textarea></div>
            </div>
            <div class="bp-tags">${bp.tags.map((t) => html`<span class="tag">#${t}</span>`)}</div>
            <div class="bp-grid">
              <div><h4>Channels</h4>${bp.categories.map((c, ci) => html`<div class="bp-cat"><b>${c.name}</b>${c.channels.map((ch, chi) => html`<label class="bp-ch"><input type="checkbox" data-ci="${ci}" data-chi="${chi}" checked> ${ch.type === 'announcement' ? '📢' : '#'} ${ch.name}</label>`)}</div>`)}</div>
              <div>
                <h4>Roles <small class="muted">(top = highest)</small></h4>
                ${bp.roles.map((r, i) => html`<label class="bp-role"><input type="checkbox" data-role="${i}" checked><span class="role-dot" style="--rc:${r.color}"></span><b>${r.name}</b><small>${r.permissions.map((p) => PERMISSION_LABELS[p] || p).join(', ')}</small></label>`)}
                <h4>Game bots</h4>
                ${bp.bots.length ? bp.bots.map((id) => html`<label class="bp-role"><input type="checkbox" data-bot="${id}" checked> ${BOT_NAMES[id] || id}</label>`) : html`<p class="muted small">No bots suggested.</p>`}
                <h4>Settings</h4>
                <label class="switch-row small"><span>🛡️ Automod${bp.automod.strict ? ' (strict)' : ''}</span><input type="checkbox" class="switch" id="bp-automod" ${bp.automod.enabled ? 'checked' : ''}></label>
                <label class="switch-row small"><span>🧭 Show in Discover</span><input type="checkbox" class="switch" id="bp-public" ${bp.isPublic ? 'checked' : ''}></label>
              </div>
            </div>
            <div class="row gap end"><button class="btn primary" id="bp-create">🚀 Create Playroom</button></div>
          </div>`);
        $('#bp-emoji', el).onclick = (e) => emojiPicker(e.currentTarget, (em) => { bp.iconEmoji = em; $('#bp-emoji', el).textContent = em; });
        $('#bp-create', el).onclick = async () => {
          const final = structuredClone(bp);
          final.name = $('#bp-name', el).value.trim();
          final.description = $('#bp-desc', el).value;
          final.categories = final.categories.map((c, ci) => ({ ...c, channels: c.channels.filter((_, chi) => $(`[data-ci="${ci}"][data-chi="${chi}"]`, el).checked) })).filter((c) => c.channels.length);
          final.roles = final.roles.filter((_, i) => $(`[data-role="${i}"]`, el).checked);
          final.bots = final.bots.filter((id) => $(`[data-bot="${id}"]`, el).checked);
          final.automod.enabled = $('#bp-automod', el).checked;
          final.isPublic = $('#bp-public', el).checked;
          if (!final.categories.length) return toast('Keep at least one channel.', 'error');
          await create(final, m);
        };
      };
      draw();
    },
  });
}

async function create(blueprint, m) {
  try {
    const { id } = await api.req('playroom.create', { blueprint });
    m.close();
    toast(`${blueprint.name} is ready! 🎉`);
    if (S.playrooms[id]) navigate(`#/p/${id}`); else S.pendingOpenPlayroom = id;
  } catch (err) { toast(err.message, 'error'); }
}

function manualView(body, m) {
  const st = { emoji: '✨', banner: 'sunset', accent: '#ff4fa3' };
  setHtml(body, html`
    <form class="form" id="manual-form">
      <div class="row gap"><button type="button" class="bp-emoji" id="m-emoji">${st.emoji}</button><label class="grow">Playroom name<input class="input" name="name" required maxlength="48" placeholder="${S.me.displayName}'s Playroom"></label></div>
      <label>Description<textarea class="input" name="description" rows="2" maxlength="300" placeholder="What's it about?"></textarea></label>
      <label>Banner<div class="swatch-grid small">${Object.entries(GRADIENTS).map(([k, g]) => html`<button type="button" class="swatch ${k === st.banner ? 'sel' : ''}" data-b="${k}" style="background:${raw(g)}"></button>`)}</div></label>
      <div class="row gap wrap"><label class="field-inline">Accent <input type="color" name="accent" value="${st.accent}"></label>
      <label class="switch-row small grow"><span>🧭 Public (show in Discover)</span><input type="checkbox" class="switch" name="isPublic" checked></label>
      <label class="switch-row small grow"><span>🛡️ Automod</span><input type="checkbox" class="switch" name="automod" checked></label></div>
      <p class="muted small">You'll start with #welcome and #general plus Admin & Moderator roles — customize everything in Playroom settings.</p>
      <div class="row end"><button class="btn primary">Create Playroom</button></div>
    </form>`);
  $('#m-emoji', body).onclick = (e) => emojiPicker(e.currentTarget, (em) => { st.emoji = em; $('#m-emoji', body).textContent = em; });
  $$('[data-b]', body).forEach((s) => s.onclick = () => { st.banner = s.dataset.b; $$('[data-b]', body).forEach((x) => x.classList.toggle('sel', x === s)); });
  $('#manual-form', body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await create({
      name: fd.get('name'), description: fd.get('description'), iconEmoji: st.emoji, banner: st.banner, accentColor: fd.get('accent'),
      isPublic: !!fd.get('isPublic'), tags: [],
      categories: [
        { name: '📌 Info', channels: [{ name: 'welcome', type: 'announcement', topic: 'Say hi!' }, { name: 'rules', type: 'announcement', topic: 'Be kind.' }] },
        { name: '💬 Chat', channels: [{ name: 'general', type: 'text', topic: 'Chat about anything' }, { name: 'media', type: 'text', topic: 'Pics & clips' }] },
      ],
      roles: [
        { name: 'Admin', color: '#ff2e88', hoist: true, permissions: ['ADMINISTRATOR'] },
        { name: 'Moderator', color: '#b197fc', hoist: true, permissions: ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'TIMEOUT_MEMBERS', 'VIEW_MOD_LOG', 'MANAGE_AUTOMOD'] },
        { name: 'Member', color: '#74c0fc', hoist: false, permissions: [] },
      ],
      bots: [], automod: { enabled: !!fd.get('automod') },
    }, m);
  };
}

function joinView(body, m) {
  setHtml(body, html`
    <form class="form" id="join-form">
      <p class="muted">Paste an invite link or code from a friend.</p>
      <input class="input" name="code" placeholder="https://…/invite/AbC123 or AbC123" required>
      <div class="row end"><button class="btn primary">Join</button></div>
    </form>
    <p class="muted small">Or <a href="#/discover" data-close>browse public Playrooms in Discover 🧭</a></p>`);
  body.querySelector('[data-close]').onclick = () => m.close();
  $('#join-form', body).onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim().replace(/.*\/invite\//, '');
    try {
      const { id } = await api.req('playroom.join', { code });
      S.pendingOpenPlayroom = id;
      m.close();
      if (S.playrooms[id]) navigate(`#/p/${id}`);
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
// Groups & DMs
// ---------------------------------------------------------------------------
function friendPicker(el, { exclude = [], selected = new Set() } = {}) {
  const friends = S.me.friends.filter((id) => !exclude.includes(id)).map(user);
  const draw = (q = '') => {
    const list = friends.filter((u) => `${u.displayName} ${u.username}`.toLowerCase().includes(q.toLowerCase()));
    setHtml($('.fp-list', el), html`${list.length ? list.map((u) => html`<label class="fp-item"><input type="checkbox" value="${u.id}" ${selected.has(u.id) ? 'checked' : ''}>${avatar(u, 30, { status: true })}<b>${u.displayName}</b><small>@${u.username}</small></label>`) : html`<p class="muted pad">${friends.length ? 'No matches.' : 'Add some friends first! 👯'}</p>`}`);
    $$('.fp-item input', el).forEach((c) => c.onchange = () => (c.checked ? selected.add(c.value) : selected.delete(c.value)));
  };
  setHtml(el, html`<input class="input small" placeholder="Search friends"><div class="fp-list"></div>`);
  el.querySelector('input').oninput = (e) => draw(e.target.value);
  draw();
  return selected;
}

export function openCreateGroup() {
  if (S.me.isGuest) return toast('Claim your free account to make group chats with friends.');
  let selected;
  modal({
    title: 'New group chat',
    body: (b) => {
      setHtml(b, html`<label>Group name <small class="muted">(optional)</small><input class="input" id="g-name" maxlength="48" placeholder="The Squad 💗"></label><h4>Add friends</h4><div id="fp"></div>`);
      selected = friendPicker($('#fp', b));
    },
    footer: (f, m) => {
      setHtml(f, html`<span class="grow"></span><button class="btn primary">Create group</button>`);
      f.querySelector('button').onclick = async () => {
        try {
          const cv = await api.req('group.create', { name: $('#g-name', m.el).value, memberIds: [...selected] });
          S.conversations[cv.id] = cv;
          m.close();
          navigate(`#/home/${cv.id}`);
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}

export function openNewDm() {
  modal({
    title: 'Start a conversation',
    body: (b, m) => {
      setHtml(b, html`<form class="row gap" id="dm-user-form"><input class="input grow" name="username" placeholder="Username (e.g. pixel.pal)"><button class="btn primary">Message</button></form><h4>Friends</h4><div class="fp-list">${S.me.friends.length ? S.me.friends.map(user).map((u) => html`<button class="fp-item" data-uid="${u.id}">${avatar(u, 30, { status: true })}<b>${u.displayName}</b><small>@${u.username}</small></button>`) : html`<p class="muted pad">No friends yet — try a username above or DM a game bot from the Arcade.</p>`}</div>`);
      const open = async (userId) => {
        const cv = await api.req('dm.open', { userId });
        S.conversations[cv.id] = cv;
        m.close();
        navigate(`#/home/${cv.id}`);
      };
      $$('[data-uid]', b).forEach((x) => x.onclick = () => open(x.dataset.uid).catch((err) => toast(err.message, 'error')));
      $('#dm-user-form', b).onsubmit = async (e) => {
        e.preventDefault();
        try {
          const { user: u } = await api.req('user.get', { username: new FormData(e.target).get('username') });
          await open(u.id);
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}

export function openGroupSettings(cv) {
  if (!cv) return;
  const isOwner = cv.ownerId === S.me.id;
  modal({
    title: 'Group settings',
    body: (b, m) => {
      const st = { iconEmoji: cv.iconEmoji || '💬', icon: cv.icon };
      setHtml(b, html`
        <div class="row gap">
          <button class="bp-emoji" id="g-emoji">${st.iconEmoji}</button>
          <label class="grow">Name<input class="input" id="g-name" value="${cv.name || ''}" maxlength="48" placeholder="${convName(cv)}"></label>
        </div>
        <div class="row gap"><button class="btn small ghost" id="g-icon">📁 Upload icon</button>${cv.icon ? html`<button class="btn small ghost" id="g-icon-clear">Remove icon</button>` : ''}<span class="grow"></span><button class="btn small primary" id="g-save">Save</button></div>
        <h4>Members — ${cv.members.length}</h4>
        <div class="fp-list">${cv.members.map((id) => html`<div class="fp-item">${avatar(user(id), 30, { status: true })}<b>${user(id).displayName}</b>${cv.ownerId === id ? html`<span class="crown">👑</span>` : ''}<span class="grow"></span>${isOwner && id !== S.me.id ? html`<button class="btn tiny ghost" data-kick="${id}">Remove</button>` : ''}</div>`)}</div>
        <button class="btn small ghost" id="g-add">➕ Add friends</button>
        <h4>Game bots</h4>
        <div class="bot-toggle-list">${['bot_dicey', 'bot_quizzy', 'bot_hangry', 'bot_tictac', 'bot_rps', 'bot_scramble'].map((id) => html`<label class="switch-row small"><span>${avatar(user(id), 24)} ${user(id).displayName}</span><input type="checkbox" class="switch" data-bot="${id}" ${(cv.bots || []).includes(id) ? 'checked' : ''}></label>`)}</div>
        <hr><button class="btn danger ghost" id="g-leave">🚪 Leave group</button>`);
      $('#g-emoji', b).onclick = (e) => emojiPicker(e.currentTarget, (em) => { st.iconEmoji = em; $('#g-emoji', b).textContent = em; });
      $('#g-icon', b).onclick = () => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
        i.onchange = async () => { const up = await api.upload(i.files[0]).catch((err) => toast(err.message, 'error')); if (up) { await api.req('group.update', { id: cv.id, icon: up.url }); m.close(); } };
        i.click();
      };
      $('#g-icon-clear', b)?.addEventListener('click', async () => { await api.req('group.update', { id: cv.id, icon: null }); m.close(); });
      $('#g-save', b).onclick = async () => { await api.req('group.update', { id: cv.id, name: $('#g-name', b).value, iconEmoji: st.iconEmoji }); toast('Saved'); m.close(); };
      $$('[data-kick]', b).forEach((x) => x.onclick = async () => { await api.req('group.kick', { id: cv.id, userId: x.dataset.kick }); m.close(); });
      $$('[data-bot]', b).forEach((x) => x.onchange = () => api.req('conv.bots', { id: cv.id, botId: x.dataset.bot, add: x.checked }).catch((err) => { toast(err.message, 'error'); x.checked = !x.checked; }));
      $('#g-add', b).onclick = () => {
        m.close();
        let selected;
        modal({
          title: 'Add friends',
          body: (bb) => { selected = friendPicker(bb, { exclude: cv.members }); },
          footer: (f, mm) => { setHtml(f, html`<span class="grow"></span><button class="btn primary">Add</button>`); f.querySelector('button').onclick = async () => { try { await api.req('group.add', { id: cv.id, userIds: [...selected] }); mm.close(); } catch (err) { toast(err.message, 'error'); } }; },
        });
      };
      $('#g-leave', b).onclick = async () => {
        if (!(await confirmDialog({ title: 'Leave group?', message: 'You\'ll need to be re-added to come back.', confirm: 'Leave', danger: true }))) return;
        await api.req('group.leave', { id: cv.id });
        m.close();
      };
    },
  });
}
