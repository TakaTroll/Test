// Chat view: header, message list (4 layouts), composer, backgrounds.
import { html, raw, setHtml, $, $$, esc, markdown, timeShort, timeLabel, dayLabel, isEmojiOnly, CHAT_BACKGROUNDS, GRADIENTS, QUICK_REACTIONS, bytes, debounce } from './util.js';
import * as api from './api.js';
import { S, user, channelInfo, memberName, roleColor, can, layoutFor, convName, dmPartner, currentChannelId, upsertUsers } from './state.js';
import { avatar, nameTag, convIcon, toast, menu, popover, emojiPicker, registerActions, confirmDialog, modal, statusLabel } from './ui.js';
import { openProfile } from './profile.js';
import { openGroupSettings } from './create.js';
import { openPlayroomSettings } from './prsettings.js';
import { lightRefresh } from './app.js';

let cur = null; // { channelId, el, readAt }
const drafts = {};
const LAYOUTS = { bubbles: '💬 Bubbles', classic: '📰 Classic', compact: '📃 Compact', cozy: '🧸 Cozy cards' };

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
export function mount(container, channelId) {
  if (cur) drafts[cur.channelId] = $('#composer-input')?.value || '';
  const info = channelInfo(channelId);
  if (!info) return;
  cur = { channelId, el: container, readAt: S.me.settings.reads[channelId] || 0, atBottom: true };
  container.className = 'main chat-main';
  setHtml(container, html`
    <header class="chat-head"></header>
    <div class="chat-stage">
      <div class="chat-bg"></div>
      <div class="msg-scroll" id="msg-scroll"><div class="msg-list" id="msg-list"></div></div>
      <button class="jump-btn" data-action="jump-bottom" hidden>↓ Jump to present</button>
    </div>
    <div class="typing" id="typing"></div>
    <div class="composer-wrap" id="composer-wrap"></div>`);
  refreshHeader();
  renderBackground();
  renderComposer();
  const scroller = $('#msg-scroll');
  scroller.addEventListener('scroll', onScroll, { passive: true });
  const box = S.messages[channelId];
  if (box?.loaded) { renderMessages(true); markRead(channelId); } else {
    setHtml($('#msg-list'), html`<div class="msg-loading"><span class="spinner"></span></div>`);
    loadMessages(channelId).then(() => { if (cur?.channelId === channelId) { renderMessages(true); markRead(channelId); } });
  }
  renderTyping();
}

async function loadMessages(channelId, before) {
  const res = await api.req('messages.fetch', { channelId, before });
  upsertUsers(res.users);
  const box = S.messages[channelId] || (S.messages[channelId] = { list: [], loaded: false, hasMore: false });
  if (before) box.list = [...res.messages, ...box.list];
  else box.list = res.messages;
  box.loaded = true;
  box.hasMore = res.hasMore;
  return box;
}

let loadingOlder = false;
async function onScroll() {
  const sc = $('#msg-scroll');
  if (!sc || !cur) return;
  cur.atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
  const jump = $('.jump-btn');
  if (jump) jump.hidden = cur.atBottom;
  const box = S.messages[cur.channelId];
  if (sc.scrollTop < 120 && box?.hasMore && !loadingOlder) {
    loadingOlder = true;
    const prevHeight = sc.scrollHeight;
    try {
      await loadMessages(cur.channelId, box.list[0]?.id);
      renderMessages();
      sc.scrollTop = sc.scrollHeight - prevHeight + sc.scrollTop;
    } finally { loadingOlder = false; }
  }
}

function kindOf(info) { return info.kind === 'playroom' ? 'playroom' : info.kind; }
function bgKey(info) { return info.kind === 'playroom' ? info.pr.id : null; }

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
export function refreshHeader() {
  if (!cur) return;
  const info = channelInfo(cur.channelId);
  const head = $('.chat-head');
  if (!info || !head) return;
  const layout = layoutFor(kindOf(info));
  $('#msg-list')?.setAttribute('data-layout', layout);
  cur.el.dataset.layout = layout;
  let title, sub, icon;
  if (info.kind === 'playroom') {
    const ch = info.channel;
    icon = html`<span class="ch-icon big">${ch.type === 'announcement' ? '📢' : '#'}</span>`;
    title = ch.name;
    sub = ch.topic || (ch.slowmode ? `🐢 Slowmode ${ch.slowmode}s` : '');
  } else if (info.kind === 'dm') {
    const u = dmPartner(info.conv);
    icon = avatar(u, 30, { status: true });
    title = u.displayName;
    sub = u.profile.customStatus || (u.isBot ? u.bot?.tagline : statusLabel(u.presence));
  } else {
    icon = convIcon(info.conv, 30);
    title = convName(info.conv);
    sub = `${info.conv.members.length} members${info.conv.bots?.length ? ` · ${info.conv.bots.length} bot${info.conv.bots.length > 1 ? 's' : ''}` : ''}`;
  }
  setHtml(head, html`
    
    <div class="chat-title" ${info.kind === 'dm' ? raw(`data-action="profile" data-id="${esc(dmPartner(info.conv).id)}"`) : ''}>
      ${icon}
      <div class="chat-title-text"><h1>${title}</h1>${sub ? html`<small>${sub}</small>` : ''}</div>
    </div>
    <div class="chat-tools">
      <button class="tool-btn" data-action="layout-menu" title="Chat layout">${LAYOUTS[layout].split(' ')[0]}<span class="hide-sm">${LAYOUTS[layout].split(' ').slice(1).join(' ')}</span></button>
      <button class="tool-btn" data-action="bg-picker" title="Chat background">🖼️<span class="hide-sm">Background</span></button>
      <button class="icon-btn" data-action="pins" title="Pinned messages">📌</button>
      <button class="icon-btn" data-action="search-chat" title="Search">🔎</button>
      ${info.kind === 'group' ? html`<button class="icon-btn" data-action="group-settings" title="Group settings">⚙️</button>` : ''}
      ${info.kind === 'playroom' && (can(info.pr, 'MANAGE_PLAYROOM') || can(info.pr, 'MANAGE_ROLES') || can(info.pr, 'MANAGE_AUTOMOD')) ? html`<button class="icon-btn" data-action="pr-settings" title="Playroom settings">⚙️</button>` : ''}
      <button class="icon-btn ${S.rightPanel ? 'active' : ''}" data-action="toggle-right" title="${info.kind === 'dm' ? 'Profile' : 'Members'}">${info.kind === 'dm' ? '🪪' : '👥'}</button>
    </div>`);
  renderComposerState();
}

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------
function backgroundFor(info) {
  const bgs = S.me.settings.backgrounds || {};
  return bgs[cur.channelId] || (bgKey(info) && bgs[bgKey(info)]) || bgs[`default:${kindOf(info)}`] || null;
}

export function renderBackground() {
  if (!cur) return;
  const info = channelInfo(cur.channelId);
  const el = $('.chat-bg');
  if (!el || !info) return;
  const bg = backgroundFor(info);
  el.style.cssText = '';
  el.className = 'chat-bg';
  if (!bg) return;
  if (bg.type === 'preset') {
    const p = CHAT_BACKGROUNDS[bg.value];
    if (p && p.css !== 'none') { el.style.backgroundImage = p.css; if (p.size) el.style.backgroundSize = p.size; }
  } else if (bg.type === 'gradient') el.style.background = GRADIENTS[bg.value] || '';
  else if (bg.type === 'color') el.style.background = bg.value;
  else if (bg.type === 'image') el.style.background = `center / cover no-repeat url("${bg.value}")`;
  el.style.setProperty('--bg-dim', bg.dim || 0);
  el.style.filter = bg.blur ? `blur(${bg.blur}px)` : '';
  el.classList.add('has-bg');
}

function openBackgroundPicker() {
  const info = channelInfo(cur.channelId);
  const current = backgroundFor(info) || { type: 'preset', value: 'none', dim: 0, blur: 0 };
  let sel = { ...current };
  const scopes = [['channel', info.kind === 'playroom' ? `This channel (#${info.channel.name})` : 'This conversation']];
  if (info.kind === 'playroom') scopes.push(['playroom', `Every channel in ${info.pr.name}`]);
  scopes.push(['default', `Default for all ${info.kind === 'playroom' ? 'Playrooms' : info.kind === 'dm' ? 'DMs' : 'group chats'}`]);
  const keyFor = (scope) => scope === 'channel' ? cur.channelId : scope === 'playroom' ? info.pr.id : `default:${kindOf(info)}`;
  modal({
    title: 'Chat background',
    wide: true,
    body: (b, m) => {
      const draw = () => {
        setHtml(b, html`
          <p class="muted">Backgrounds are personal — only you see them.</p>
          <h4>Patterns</h4>
          <div class="swatch-grid">${Object.entries(CHAT_BACKGROUNDS).map(([k, p]) => html`<button class="swatch bg-swatch ${sel.type === 'preset' && sel.value === k ? 'sel' : ''}" data-t="preset" data-v="${k}" style="background-image:${raw(p.css === 'none' ? 'none' : p.css)};${raw(p.size ? `background-size:${p.size}` : '')}"><span>${p.label}</span></button>`)}</div>
          <h4>Gradients</h4>
          <div class="swatch-grid">${Object.entries(GRADIENTS).map(([k, g]) => html`<button class="swatch ${sel.type === 'gradient' && sel.value === k ? 'sel' : ''}" data-t="gradient" data-v="${k}" style="background:${raw(g)}"><span>${k}</span></button>`)}</div>
          <div class="row gap wrap">
            <label class="field-inline">Solid color <input type="color" id="bg-color" value="${sel.type === 'color' ? sel.value : '#2a1f33'}"></label>
            <button class="btn ghost" id="bg-upload">📁 Upload image</button>
            ${sel.type === 'image' ? html`<span class="muted tiny">Image selected ✓</span>` : ''}
          </div>
          <div class="row gap wrap">
            <label class="field-inline grow">Dim <input type="range" min="0" max="0.85" step="0.05" id="bg-dim" value="${sel.dim || 0}"></label>
            <label class="field-inline grow">Blur <input type="range" min="0" max="16" step="1" id="bg-blur" value="${sel.blur || 0}"></label>
          </div>
          <h4>Apply to</h4>
          <div class="radio-list">${scopes.map(([k, label], i) => html`<label><input type="radio" name="scope" value="${k}" ${i === 0 ? 'checked' : ''}> ${label}</label>`)}</div>`);
        $$('.swatch', b).forEach((s) => s.onclick = () => { sel = { ...sel, type: s.dataset.t, value: s.dataset.v }; preview(); draw(); });
        $('#bg-color', b).oninput = (e) => { sel = { ...sel, type: 'color', value: e.target.value }; preview(); };
        $('#bg-dim', b).oninput = (e) => { sel.dim = Number(e.target.value); preview(); };
        $('#bg-blur', b).oninput = (e) => { sel.blur = Number(e.target.value); preview(); };
        $('#bg-upload', b).onclick = async () => {
          const f = await pickImage();
          if (!f) return;
          const up = await api.upload(f);
          sel = { ...sel, type: 'image', value: up.url };
          preview(); draw();
        };
      };
      const preview = () => {
        const saved = S.me.settings.backgrounds[cur.channelId];
        S.me.settings.backgrounds[cur.channelId] = sel;
        renderBackground();
        if (saved) S.me.settings.backgrounds[cur.channelId] = saved; else delete S.me.settings.backgrounds[cur.channelId];
      };
      draw();
    },
    footer: (f, m) => {
      setHtml(f, html`<button class="btn ghost" data-x="reset">Reset</button><span class="grow"></span><button class="btn ghost" data-x="cancel">Cancel</button><button class="btn primary" data-x="save">Apply</button>`);
      const scope = () => m.el.querySelector('input[name=scope]:checked').value;
      f.querySelector('[data-x=cancel]').onclick = () => { m.close(); renderBackground(); };
      f.querySelector('[data-x=reset]').onclick = async () => {
        const key = keyFor(scope());
        delete S.me.settings.backgrounds[key];
        await api.req('me.update', { settings: { background: { key, value: null } } });
        m.close(); renderBackground();
      };
      f.querySelector('[data-x=save]').onclick = async () => {
        const key = keyFor(scope());
        const value = sel.type === 'preset' && sel.value === 'none' ? null : sel;
        if (value) S.me.settings.backgrounds[key] = value; else delete S.me.settings.backgrounds[key];
        await api.req('me.update', { settings: { background: { key, value } } });
        m.close(); renderBackground();
        toast('Background updated ✨');
      };
    },
    onClose: () => renderBackground(),
  });
}

function pickImage() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
function authorColor(info, uid) {
  return info.kind === 'playroom' ? roleColor(info.pr, uid) : '';
}
function authorName(info, uid) {
  return info.kind === 'playroom' ? memberName(info.pr, uid) : user(uid).displayName;
}

function renderEmbed(e) {
  if (!e) return '';
  return html`<div class="embed" style="--embed:${e.color || 'var(--accent)'}">
    ${e.title ? html`<div class="embed-title">${raw(markdown(e.title))}</div>` : ''}
    ${e.description ? html`<div class="embed-desc">${raw(markdown(e.description, { me: S.me, users: S.users }))}</div>` : ''}
    ${e.footer ? html`<div class="embed-foot">${e.footer}</div>` : ''}
  </div>`;
}

function renderAttachments(list) {
  if (!list?.length) return '';
  return html`<div class="attachments">${list.map((a) => a.type?.startsWith('image/')
    ? html`<a href="${a.url}" target="_blank" rel="noopener" class="att-img"><img src="${a.url}" alt="${a.name}" loading="lazy"></a>`
    : a.type?.startsWith('video/') ? html`<video src="${a.url}" controls class="att-video"></video>`
    : a.type?.startsWith('audio/') ? html`<audio src="${a.url}" controls></audio>`
    : html`<a href="${a.url}" target="_blank" rel="noopener" class="att-file">📄 <span>${a.name}</span><small>${a.size ? bytes(a.size) : ''}</small></a>`)}</div>`;
}

function renderReactions(m) {
  const entries = Object.entries(m.reactions || {});
  if (!entries.length) return '';
  return html`<div class="reactions">${entries.map(([e, ids]) => html`<button class="reaction ${ids.includes(S.me.id) ? 'mine' : ''}" data-action="react" data-id="${m.id}" data-emoji="${e}" title="${ids.map((id) => user(id).displayName).join(', ')}">${e} <b>${ids.length}</b></button>`)}<button class="reaction add" data-action="react-pick" data-id="${m.id}" title="Add reaction">＋</button></div>`;
}

function messageHtml(m, prev, info, layout) {
  if (m.system) {
    return html`<div class="msg system" data-id="${m.id}"><span class="sys-icon">${m.meta?.kind === 'join' ? '👋' : '✦'}</span><span class="sys-text">${raw(markdown(m.content, { me: S.me, users: S.users }))}</span><time>${timeShort(m.createdAt)}</time></div>`;
  }
  const u = user(m.authorId);
  const mine = m.authorId === S.me.id;
  const cont = prev && !prev.system && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 5 * 60000 && !m.replyTo && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
  const mentioned = !mine && new RegExp(`(^|\\W)@(${S.me.username.replace('.', '\\.')}|everyone|here)\\b`, 'i').test(m.content || '');
  const emojiOnly = isEmojiOnly(m.content) && !m.attachments?.length;
  const color = authorColor(info, m.authorId);
  const editing = S.editing === m.id;
  const showName = layout !== 'bubbles' || info.kind !== 'dm';
  const reply = m.replyTo ? html`<div class="reply-ref" data-action="jump-to" data-id="${m.replyTo.id}">↪ ${avatar(user(m.replyTo.authorId), 16, { deco: false })}<b>${authorName(info, m.replyTo.authorId)}</b><span>${m.replyTo.content || '📎 attachment'}</span></div>` : '';
  const content = editing
    ? html`<div class="edit-box"><textarea class="input" id="edit-input">${m.content}</textarea><small class="muted">Enter to save · Esc to cancel</small></div>`
    : m.content ? html`<div class="msg-content ${emojiOnly ? 'jumbo' : ''}">${raw(markdown(m.content, { me: S.me, users: S.users }))}${m.editedAt ? html`<span class="edited" title="${timeLabel(m.editedAt)}"> (edited)</span>` : ''}</div>` : '';
  return html`<div class="msg ${cont ? 'cont' : ''} ${mine ? 'mine' : ''} ${mentioned ? 'mentioned' : ''} ${m.pinned ? 'pinned' : ''}" data-id="${m.id}" data-context="msg-menu">
    <div class="msg-gutter">${cont ? html`<time class="hover-time">${timeShort(m.createdAt)}</time>` : html`<span data-action="profile" data-id="${u.id}">${avatar(u, layout === 'compact' ? 22 : layout === 'cozy' ? 48 : 40)}</span>`}</div>
    <div class="msg-body">
      ${reply}
      ${!cont && showName ? html`<div class="msg-head">${nameTag(u, { color, text: authorName(info, m.authorId) })}<time title="${timeLabel(m.createdAt)}">${layout === 'compact' ? timeShort(m.createdAt) : timeLabel(m.createdAt)}</time>${m.pinned ? html`<span class="pin-flag" title="Pinned">📌</span>` : ''}</div>` : ''}
      <div class="bubble ${emojiOnly ? 'emoji-only' : ''}">
        ${content}
        ${renderAttachments(m.attachments)}
        ${renderEmbed(m.embed)}
        ${layout === 'bubbles' ? html`<time class="bubble-time">${timeShort(m.createdAt)}</time>` : ''}
      </div>
      ${renderReactions(m)}
    </div>
    <div class="msg-tools">
      ${QUICK_REACTIONS.slice(0, 3).map((e) => html`<button data-action="react" data-id="${m.id}" data-emoji="${e}" title="React ${e}">${e}</button>`)}
      <button data-action="react-pick" data-id="${m.id}" title="Add reaction">😊</button>
      <button data-action="reply" data-id="${m.id}" title="Reply">↩</button>
      ${mine && !m.embed ? html`<button data-action="edit-msg" data-id="${m.id}" title="Edit">✏️</button>` : ''}
      <button data-action="msg-menu" data-id="${m.id}" title="More">⋯</button>
    </div>
  </div>`;
}

function welcomeHtml(info) {
  if (info.kind === 'playroom') {
    return html`<div class="chat-welcome"><div class="welcome-icon">${info.channel.type === 'announcement' ? '📢' : '#'}</div><h2>Welcome to #${info.channel.name}!</h2><p class="muted">${info.channel.topic || `This is the start of #${info.channel.name} in ${info.pr.name}.`}</p>${info.pr.bots.length ? html`<p class="muted tiny">🎮 Game bots are here — type <code>!help</code> to see what they can do.</p>` : ''}</div>`;
  }
  if (info.kind === 'dm') {
    const u = dmPartner(info.conv);
    return html`<div class="chat-welcome">${avatar(u, 80)}<h2>${u.displayName}</h2><p class="muted">This is the beginning of your direct messages with <b>${u.displayName}</b>.${u.isBot ? ' Type !help to play!' : ''}</p></div>`;
  }
  return html`<div class="chat-welcome">${convIcon(info.conv, 80)}<h2>${convName(info.conv)}</h2><p class="muted">Welcome to the beginning of this group chat. Add game bots in group settings ⚙️</p></div>`;
}

export function renderMessages(scrollToBottom = false) {
  if (!cur) return;
  const list = $('#msg-list');
  const sc = $('#msg-scroll');
  if (!list || !sc) return;
  const info = channelInfo(cur.channelId);
  const box = S.messages[cur.channelId];
  if (!info || !box) return;
  const layout = layoutFor(kindOf(info));
  list.dataset.layout = layout;
  const wasBottom = cur.atBottom;
  const parts = [];
  if (!box.hasMore) parts.push(welcomeHtml(info));
  else parts.push(html`<div class="msg-loading"><span class="spinner"></span></div>`);
  let prev = null;
  let newMarked = false;
  for (const m of box.list) {
    if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) {
      parts.push(html`<div class="day-divider"><span>${dayLabel(m.createdAt)}</span></div>`);
      prev = null;
    }
    if (!newMarked && cur.readAt && m.createdAt > cur.readAt && m.authorId !== S.me.id) {
      parts.push(html`<div class="new-divider"><span>New</span></div>`);
      newMarked = true;
      prev = null;
    }
    parts.push(messageHtml(m, prev, info, layout));
    prev = m;
  }
  setHtml(list, html`${parts}`);
  if (scrollToBottom || wasBottom) sc.scrollTop = sc.scrollHeight;
  // Images load late; keep pinned to bottom.
  if (scrollToBottom || wasBottom) $$('img', list).forEach((img) => { if (!img.complete) img.addEventListener('load', () => { if (cur?.atBottom) sc.scrollTop = sc.scrollHeight; }, { once: true }); });
  if (S.editing) {
    const ta = $('#edit-input');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.onkeydown = onEditKey; }
  }
}

export const refreshMessagesSoft = debounce(() => { if (cur && S.messages[cur.channelId]?.loaded && !S.editing) renderMessages(); }, 120);

export function ingestMessage(m) {
  const info = channelInfo(m.channelId);
  const box = S.messages[m.channelId];
  if (box?.loaded && !box.list.some((x) => x.id === m.id)) {
    box.list.push(m);
    if (box.list.length > 400) box.list.splice(0, box.list.length - 400);
  }
  if (cur?.channelId === m.channelId) {
    if (m.authorId === S.me.id) cur.atBottom = true;
    renderMessages();
  }
  return info;
}

export function updateMessage(m) {
  const box = S.messages[m.channelId];
  if (!box) return;
  const i = box.list.findIndex((x) => x.id === m.id);
  if (i >= 0) box.list[i] = m;
  if (cur?.channelId === m.channelId) renderMessages();
}

export function removeMessage(channelId, id) {
  const box = S.messages[channelId];
  if (!box) return;
  box.list = box.list.filter((x) => x.id !== id);
  if (cur?.channelId === channelId) renderMessages();
}

const readTimers = {};
export function markRead(channelId, force = false) {
  const info = channelInfo(channelId);
  const last = info?.kind === 'playroom' ? info.channel.lastMessageAt : info?.conv?.lastMessageAt;
  const prev = S.me.settings.reads[channelId] || 0;
  delete S.mentions[channelId];
  if (!force && last && prev >= last) return;
  S.me.settings.reads[channelId] = Date.now();
  clearTimeout(readTimers[channelId]);
  readTimers[channelId] = setTimeout(() => api.req('me.read', { channelId }).catch(() => {}), 600);
  lightRefresh();
}

export function renderTyping() {
  const el = $('#typing');
  if (!el || !cur) return;
  const now = Date.now();
  const t = S.typing[cur.channelId] || {};
  const who = Object.entries(t).filter(([uid, exp]) => exp > now && uid !== S.me.id).map(([uid]) => user(uid).displayName);
  if (!who.length) { el.innerHTML = ''; return; }
  const text = who.length === 1 ? `${who[0]} is typing` : who.length === 2 ? `${who[0]} and ${who[1]} are typing` : `${who.length} people are typing`;
  setHtml(el, html`<span class="typing-dots"><i></i><i></i><i></i></span> ${text}…`);
}
setInterval(() => { if (cur) renderTyping(); }, 1500);

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------
let pendingFiles = [];

function renderComposer() {
  const wrap = $('#composer-wrap');
  if (!wrap) return;
  pendingFiles = [];
  setHtml(wrap, html`
    <div class="composer-extra" id="composer-extra"></div>
    <div class="composer" id="composer">
      <button class="icon-btn" data-action="attach" title="Upload a file">＋</button>
      <textarea id="composer-input" rows="1" placeholder="Message…" maxlength="4000"></textarea>
      <button class="icon-btn" data-action="emoji" title="Emoji">😊</button>
      <button class="send-btn" data-action="send" title="Send">➤</button>
    </div>
    <div class="mention-pop" id="mention-pop" hidden></div>`);
  const ta = $('#composer-input');
  ta.value = drafts[cur.channelId] || '';
  autoGrow(ta);
  ta.addEventListener('input', () => { autoGrow(ta); emitTyping(); mentionAutocomplete(ta); });
  ta.addEventListener('keydown', onComposerKey);
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  const stage = cur.el;
  stage.ondragover = (e) => { e.preventDefault(); stage.classList.add('dragging'); };
  stage.ondragleave = (e) => { if (e.target === stage) stage.classList.remove('dragging'); };
  stage.ondrop = (e) => { e.preventDefault(); stage.classList.remove('dragging'); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); };
  renderComposerState();
  if (matchMedia('(pointer:fine)').matches) ta.focus();
}

function renderComposerState() {
  const ta = $('#composer-input');
  if (!ta || !cur) return;
  const info = channelInfo(cur.channelId);
  let disabled = '';
  if (info.kind === 'playroom') {
    const { pr, channel } = info;
    const mem = pr.members[S.me.id];
    const admin = can(pr, 'ADMINISTRATOR');
    if (mem?.timeoutUntil > Date.now()) disabled = `⏳ You're timed out until ${new Date(mem.timeoutUntil).toLocaleTimeString()}.`;
    else if (!admin && channel.type === 'announcement' && !can(pr, 'MANAGE_CHANNELS') && !(channel.writeRoles || []).some((r) => mem.roles.includes(r))) disabled = '📢 Only selected roles can post in this announcement channel.';
    else if (!admin && channel.type !== 'announcement' && channel.writeRoles?.length && !channel.writeRoles.some((r) => mem.roles.includes(r))) disabled = '🔒 You don\'t have a role that can post here.';
    else if (!can(pr, 'SEND_MESSAGES')) disabled = '🔇 You don\'t have permission to send messages here.';
    ta.placeholder = `Message #${channel.name}`;
  } else if (info.kind === 'dm') {
    const u = dmPartner(info.conv);
    ta.placeholder = `Message @${u.displayName}`;
    if (S.me.blocked.includes(u.id)) disabled = 'You blocked this user.';
  } else ta.placeholder = `Message ${convName(info.conv)}`;
  const comp = $('#composer');
  comp.classList.toggle('disabled', !!disabled);
  ta.disabled = !!disabled;
  if (disabled) ta.placeholder = disabled;
  renderComposerExtra();
}

function renderComposerExtra() {
  const ex = $('#composer-extra');
  if (!ex || !cur) return;
  const info = channelInfo(cur.channelId);
  const parts = [];
  if (S.replyTo) {
    const m = S.messages[cur.channelId]?.list.find((x) => x.id === S.replyTo);
    if (m) parts.push(html`<div class="reply-bar">↩ Replying to <b>${authorName(info, m.authorId)}</b><span class="muted">${(m.content || '').slice(0, 80)}</span><button class="icon-btn tiny" data-action="cancel-reply">✕</button></div>`);
  }
  if (pendingFiles.length) {
    parts.push(html`<div class="pending-files">${pendingFiles.map((f, i) => html`<div class="pf">${f.type?.startsWith('image/') ? html`<img src="${f.url}" alt="">` : html`<span>📄</span>`}<small>${f.name}</small><button class="icon-btn tiny" data-action="remove-file" data-i="${i}">✕</button></div>`)}</div>`);
  }
  setHtml(ex, html`${parts}`);
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
}

let lastTyping = 0;
function emitTyping() {
  if (Date.now() - lastTyping > 2500 && cur) { lastTyping = Date.now(); api.typing(cur.channelId); }
}

async function addFiles(files) {
  for (const f of files.slice(0, 6 - pendingFiles.length)) {
    try {
      toast(`Uploading ${f.name}…`, 'info', 1500);
      const up = await api.upload(f);
      pendingFiles.push(up);
      renderComposerExtra();
    } catch (err) { toast(err.message, 'error'); }
  }
}

async function send() {
  const ta = $('#composer-input');
  if (!ta || !cur || ta.disabled) return;
  const content = ta.value;
  if (!content.trim() && !pendingFiles.length) return;
  const channelId = cur.channelId;
  const payload = { channelId, content, replyTo: S.replyTo, attachments: pendingFiles };
  ta.value = '';
  autoGrow(ta);
  const saved = pendingFiles;
  pendingFiles = [];
  S.replyTo = null;
  drafts[channelId] = '';
  renderComposerExtra();
  closeMentionPop();
  try {
    await api.req('message.send', payload);
  } catch (err) {
    toast(err.message, 'error');
    if (cur?.channelId === channelId && !ta.value) { ta.value = content; autoGrow(ta); pendingFiles = saved; renderComposerExtra(); }
  }
}

function onComposerKey(e) {
  const pop = $('#mention-pop');
  if (pop && !pop.hidden) {
    const items = $$('.mp-item', pop);
    let i = items.findIndex((x) => x.classList.contains('sel'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[i]?.classList.remove('sel');
      i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[i]?.classList.add('sel');
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && items[i]) { e.preventDefault(); items[i].click(); return; }
    if (e.key === 'Escape') { closeMentionPop(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); return; }
  if (e.key === 'ArrowUp' && !e.target.value) {
    const box = S.messages[cur.channelId];
    const last = box && [...box.list].reverse().find((m) => m.authorId === S.me.id && !m.embed);
    if (last) { e.preventDefault(); startEdit(last.id); }
  }
  if (e.key === 'Escape' && S.replyTo) { S.replyTo = null; renderComposerExtra(); }
}

function mentionCandidates(info) {
  if (info.kind === 'playroom') return [...Object.keys(info.pr.members), ...info.pr.bots];
  return [...info.conv.members, ...(info.conv.bots || [])];
}

function mentionAutocomplete(ta) {
  const pop = $('#mention-pop');
  const before = ta.value.slice(0, ta.selectionStart);
  const m = before.match(/(^|\s)@([\w.]{0,24})$/);
  if (!m) return closeMentionPop();
  const q = m[2].toLowerCase();
  const info = channelInfo(cur.channelId);
  const ids = mentionCandidates(info).filter((id) => {
    const u = user(id);
    return u.username.includes(q) || u.displayName.toLowerCase().includes(q);
  }).slice(0, 8);
  const extra = info.kind === 'playroom' && can(info.pr, 'MENTION_EVERYONE') && 'everyone'.startsWith(q) ? ['everyone'] : [];
  if (!ids.length && !extra.length) return closeMentionPop();
  pop.hidden = false;
  setHtml(pop, html`${ids.map((id, i) => html`<button class="mp-item ${i === 0 ? 'sel' : ''}" data-u="${user(id).username}">${avatar(user(id), 24, { deco: false })}<b>${user(id).displayName}</b><small>@${user(id).username}</small></button>`)}${extra.map((x) => html`<button class="mp-item ${ids.length ? '' : 'sel'}" data-u="${x}">📣 <b>@${x}</b><small>notify everyone</small></button>`)}`);
  $$('.mp-item', pop).forEach((b) => b.onmousedown = (e) => {
    e.preventDefault();
    const pos = ta.selectionStart;
    const start = before.length - m[2].length - 1;
    ta.value = `${ta.value.slice(0, start)}@${b.dataset.u} ${ta.value.slice(pos)}`;
    ta.selectionStart = ta.selectionEnd = start + b.dataset.u.length + 2;
    ta.focus();
    closeMentionPop();
  });
  $$('.mp-item', pop).forEach((b) => b.onclick = b.onmousedown);
}
function closeMentionPop() { const p = $('#mention-pop'); if (p) p.hidden = true; }

function startEdit(id) {
  S.editing = id;
  renderMessages();
}

async function onEditKey(e) {
  if (e.key === 'Escape') { S.editing = null; renderMessages(); $('#composer-input')?.focus(); }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const id = S.editing;
    const content = e.target.value;
    S.editing = null;
    try {
      if (!content.trim()) await deleteMessage(id);
      else await api.req('message.edit', { channelId: cur.channelId, messageId: id, content });
    } catch (err) { toast(err.message, 'error'); }
    renderMessages();
    $('#composer-input')?.focus();
  }
}

async function deleteMessage(id, skipConfirm) {
  if (!skipConfirm && !(await confirmDialog({ title: 'Delete message?', message: 'This can\'t be undone.', confirm: 'Delete', danger: true }))) return;
  await api.req('message.delete', { channelId: cur.channelId, messageId: id });
}

function findMsg(id) {
  return S.messages[cur.channelId]?.list.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
registerActions({
  send: () => send(),
  attach: async () => {
    const i = document.createElement('input');
    i.type = 'file'; i.multiple = true;
    i.accept = 'image/*,video/mp4,audio/mpeg,application/pdf,text/plain';
    i.onchange = () => addFiles([...i.files]);
    i.click();
  },
  'remove-file': (el) => { pendingFiles.splice(Number(el.dataset.i), 1); renderComposerExtra(); },
  emoji: (el) => emojiPicker(el, (e) => {
    const ta = $('#composer-input');
    const p = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, p) + e + ta.value.slice(p);
    ta.selectionStart = ta.selectionEnd = p + e.length;
    ta.focus();
  }),
  react: (el) => api.req('message.react', { channelId: cur.channelId, messageId: el.dataset.id, emoji: el.dataset.emoji }),
  'react-pick': (el) => emojiPicker(el, (e) => api.req('message.react', { channelId: cur.channelId, messageId: el.dataset.id, emoji: e }).catch((err) => toast(err.message, 'error'))),
  reply: (el) => { S.replyTo = el.dataset.id; renderComposerExtra(); $('#composer-input')?.focus(); },
  'cancel-reply': () => { S.replyTo = null; renderComposerExtra(); },
  'edit-msg': (el) => startEdit(el.dataset.id),
  'msg-menu': (el, ev) => {
    const id = el.dataset.id || el.closest('.msg')?.dataset.id;
    const m = findMsg(id);
    if (!m || m.system) return;
    const info = channelInfo(cur.channelId);
    const mine = m.authorId === S.me.id;
    const canMod = info.kind === 'playroom' ? can(info.pr, 'MANAGE_MESSAGES') : info.kind === 'group' && info.conv.ownerId === S.me.id;
    const canPin = info.kind === 'playroom' ? can(info.pr, 'MANAGE_MESSAGES') : true;
    menu(el, [
      { icon: '😊', label: 'Add reaction', action: () => emojiPicker(el, (e) => api.req('message.react', { channelId: cur.channelId, messageId: id, emoji: e })) },
      { icon: '↩', label: 'Reply', action: () => { S.replyTo = id; renderComposerExtra(); $('#composer-input')?.focus(); } },
      mine && !m.embed ? { icon: '✏️', label: 'Edit', action: () => startEdit(id) } : null,
      canPin ? { icon: '📌', label: m.pinned ? 'Unpin' : 'Pin', action: () => api.req('message.pin', { channelId: cur.channelId, messageId: id, pinned: !m.pinned }) } : null,
      { icon: '📋', label: 'Copy text', action: () => navigator.clipboard?.writeText(m.content || '') },
      { icon: '👤', label: 'View profile', action: () => openProfile(m.authorId) },
      (mine || canMod) ? { divider: true } : null,
      (mine || canMod) ? { icon: '🗑️', label: 'Delete message', danger: true, hint: 'shift+click skips confirm', action: () => deleteMessage(id, ev?.shiftKey) } : null,
    ], ev);
  },
  'jump-bottom': () => { const sc = $('#msg-scroll'); sc.scrollTop = sc.scrollHeight; },
  'jump-to': (el) => {
    const t = $(`.msg[data-id="${CSS.escape(el.dataset.id)}"]`);
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    else toast('That message is further back in history.');
  },
  'layout-menu': (el) => {
    const info = channelInfo(cur.channelId);
    const kind = kindOf(info);
    const label = kind === 'playroom' ? 'Playrooms' : kind === 'dm' ? 'DMs' : 'group chats';
    menu(el, [
      { header: `Layout for all ${label}` },
      ...Object.entries(LAYOUTS).map(([k, l]) => ({
        icon: l.split(' ')[0], label: l.split(' ').slice(1).join(' '), active: layoutFor(kind) === k,
        action: async () => {
          S.me.settings.layouts[kind] = k;
          refreshHeader(); renderMessages(true);
          await api.req('me.update', { settings: { layouts: { [kind]: k } } });
        },
      })),
    ]);
  },
  'bg-picker': () => openBackgroundPicker(),
  pins: async (el) => {
    const pins = await api.req('messages.pinned', { channelId: cur.channelId });
    const info = channelInfo(cur.channelId);
    popover(el, (p) => setHtml(p, html`<div class="pop-title">📌 Pinned messages</div>${pins.length ? pins.slice().reverse().map((m) => html`<div class="pin-item" data-action="jump-to" data-id="${m.id}"><div class="pin-head">${avatar(user(m.authorId), 20, { deco: false })} <b>${authorName(info, m.authorId)}</b> <small class="muted">${timeLabel(m.createdAt)}</small></div><div class="pin-body">${raw(markdown(m.content))}</div></div>`) : html`<p class="muted pad">No pinned messages yet.</p>`}`), { className: 'pins-pop' });
  },
  'search-chat': (el) => {
    const info = channelInfo(cur.channelId);
    popover(el, (p) => {
      setHtml(p, html`<input class="input small" placeholder="Search loaded messages…" id="chat-search"><div class="search-results"></div>`);
      const inp = $('#chat-search', p);
      const res = $('.search-results', p);
      inp.oninput = () => {
        const q = inp.value.toLowerCase().trim();
        const hits = q ? S.messages[cur.channelId].list.filter((m) => (m.content || '').toLowerCase().includes(q) || user(m.authorId).displayName.toLowerCase().includes(q)).slice(-30).reverse() : [];
        setHtml(res, html`${hits.map((m) => html`<div class="pin-item" data-action="jump-to" data-id="${m.id}"><div class="pin-head"><b>${authorName(info, m.authorId)}</b> <small class="muted">${timeLabel(m.createdAt)}</small></div><div class="pin-body">${(m.content || '').slice(0, 160)}</div></div>`)}${q && !hits.length ? html`<p class="muted pad">No results.</p>` : ''}`);
      };
      setTimeout(() => inp.focus(), 10);
    }, { className: 'pins-pop' });
  },
  'group-settings': () => openGroupSettings(S.conversations[cur.channelId]),
  'pr-settings': () => openPlayroomSettings(channelInfo(cur.channelId).pr.id),
});

export function currentChat() { return cur; }
