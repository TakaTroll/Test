// Playroom settings: overview, channels, roles & hierarchy, members,
// invites, bans, automod, bots, mod log, danger zone.
import { html, raw, setHtml, $, $$, esc, GRADIENTS, bannerCss, timeLabel, ago } from './util.js';
import * as api from './api.js';
import { S, user, memberName, memberRoles, roleColor, can, topPosition } from './state.js';
import { avatar, nameTag, prIcon, modal, toast, menu, emojiPicker, confirmDialog, promptDialog, chipInput } from './ui.js';
import { navigate } from './app.js';

const PERM_GROUPS = {
  'General': ['ADMINISTRATOR', 'MANAGE_PLAYROOM', 'MANAGE_ROLES', 'MANAGE_CHANNELS', 'MANAGE_BOTS', 'CREATE_INVITE', 'CHANGE_NICKNAME'],
  'Moderation': ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'BAN_MEMBERS', 'TIMEOUT_MEMBERS', 'MANAGE_AUTOMOD', 'VIEW_MOD_LOG'],
  'Chat': ['SEND_MESSAGES', 'ATTACH_FILES', 'ADD_REACTIONS', 'MENTION_EVERYONE'],
};
const PERM_NAMES = {
  ADMINISTRATOR: 'Administrator', MANAGE_PLAYROOM: 'Manage Playroom', MANAGE_ROLES: 'Manage roles', MANAGE_CHANNELS: 'Manage channels', MANAGE_BOTS: 'Manage bots',
  CREATE_INVITE: 'Create invites', CHANGE_NICKNAME: 'Change nickname', MANAGE_MESSAGES: 'Manage messages', KICK_MEMBERS: 'Kick members', BAN_MEMBERS: 'Ban members',
  TIMEOUT_MEMBERS: 'Timeout members', MANAGE_AUTOMOD: 'Manage Automod', VIEW_MOD_LOG: 'View mod log', SEND_MESSAGES: 'Send messages', ATTACH_FILES: 'Attach files',
  ADD_REACTIONS: 'Add reactions', MENTION_EVERYONE: 'Mention @everyone',
};
const ROLE_COLORS = ['#ff4fa3', '#ff2e88', '#b197fc', '#7b2ff7', '#4dabf7', '#20c997', '#51cf66', '#ffd43b', '#ff922b', '#ff6b6b', '#99a1b3', '#ffffff'];
const LOG_LABELS = { join: '👋 joined', leave: '🚪 left', kick: '👢 kicked', ban: '🔨 banned', unban: '🕊️ unbanned', timeout: '⏳ timed out', timeout_clear: '✅ timeout removed', automod: '🛡️ Automod blocked', role_add: '➕ role', role_remove: '➖ role', role_create: '🏷️ role created', role_update: '🏷️ role edited', role_delete: '🗑️ role deleted', channel_create: '#️⃣ channel created', channel_delete: '🗑️ channel deleted', message_delete: '🗑️ message deleted', playroom_update: '⚙️ settings changed', automod_update: '🛡️ Automod changed', bot_add: '🤖 bot added', bot_remove: '🤖 bot removed', transfer: '👑 ownership transferred' };

let state = { section: 'overview', roleId: null };

export function openPlayroomSettings(prId, section) {
  const pr0 = S.playrooms[prId];
  if (!pr0) return;
  state = { section: section || (can(pr0, 'MANAGE_PLAYROOM') ? 'overview' : 'members'), roleId: null };
  let m;
  const draw = () => {
    const pr = S.playrooms[prId];
    if (!pr) return m?.close();
    const sections = [
      ['overview', '🏠', 'Overview', can(pr, 'MANAGE_PLAYROOM')],
      ['channels', '#️⃣', 'Channels', can(pr, 'MANAGE_CHANNELS')],
      ['roles', '🏷️', 'Roles & hierarchy', can(pr, 'MANAGE_ROLES')],
      ['members', '👥', 'Members', true],
      ['invites', '💌', 'Invites', can(pr, 'CREATE_INVITE')],
      ['bans', '🔨', 'Bans', can(pr, 'BAN_MEMBERS')],
      ['automod', '🛡️', 'Automod', can(pr, 'MANAGE_AUTOMOD')],
      ['bots', '🤖', 'Game bots', can(pr, 'MANAGE_BOTS')],
      ['log', '📜', 'Mod log', can(pr, 'VIEW_MOD_LOG')],
      ['danger', '⚠️', pr.ownerId === S.me.id ? 'Ownership & delete' : 'Leave', true],
    ].filter((s) => s[3]);
    if (!sections.some((s) => s[0] === state.section)) state.section = sections[0][0];
    setHtml(m.body, html`<div class="settings">
      <nav class="settings-nav">
        <div class="pr-nav-head">${prIcon(pr, 36)}<h3>${pr.name}</h3></div>
        ${sections.map(([k, i, l]) => html`<button class="${state.section === k ? 'active' : ''}" data-sec="${k}"><span>${i}</span>${l}</button>`)}
      </nav>
      <section class="settings-body" id="prs-body"></section>
    </div>`);
    $$('[data-sec]', m.body).forEach((x) => x.onclick = () => { state.section = x.dataset.sec; draw(); });
    const body = $('#prs-body', m.body);
    ({ overview, channels, roles, members, invites, bans, automod, bots, log, danger })[state.section](body, pr, m, draw);
  };
  const onUpdate = (e) => { if (e.detail === prId && !['overview', 'automod'].includes(state.section)) draw(); };
  m = modal({ full: true, className: 'settings-modal', body: () => {}, onClose: () => document.removeEventListener('xp:playroom', onUpdate) });
  document.addEventListener('xp:playroom', onUpdate);
  draw();
}

// ---------------------------------------------------------------------------
function overview(el, pr) {
  const st = { iconEmoji: pr.iconEmoji, icon: pr.icon, banner: { ...pr.banner } };
  setHtml(el, html`
    <h2>Overview</h2>
    <div class="pr-preview" id="pr-prev"></div>
    <form class="form" id="ov-form">
      <div class="card-block">
        <h4>Identity</h4>
        <div class="row gap"><button type="button" class="bp-emoji" id="ov-emoji">${pr.iconEmoji}</button><label class="grow">Name<input class="input" name="name" value="${pr.name}" maxlength="48"></label></div>
        <div class="row gap"><button type="button" class="btn small ghost" id="ov-icon">📁 Upload icon</button>${pr.icon ? html`<button type="button" class="btn small ghost" id="ov-icon-clear">Use emoji instead</button>` : ''}</div>
        <label>Description<textarea class="input" name="description" rows="3" maxlength="500">${pr.description}</textarea></label>
        <label>Tags <small class="muted">help people find you in Discover</small><div id="ov-tags"></div></label>
      </div>
      <div class="card-block">
        <h4>Look & feel</h4>
        <label>Banner<div class="swatch-grid small">${Object.entries(GRADIENTS).map(([k, g]) => html`<button type="button" class="swatch ${pr.banner.type === 'gradient' && pr.banner.value === k ? 'sel' : ''}" data-b="${k}" style="background:${raw(g)}"></button>`)}</div></label>
        <div class="row gap wrap"><button type="button" class="btn small ghost" id="ov-banner">📁 Upload banner</button><label class="field-inline">Accent color <input type="color" name="accentColor" value="${pr.accentColor}"></label></div>
      </div>
      <div class="card-block">
        <h4>Welcome & rules</h4>
        <label>Welcome message <small class="muted">{user} becomes their @mention</small><input class="input" name="welcomeMessage" value="${pr.welcomeMessage}" maxlength="300"></label>
        <label>Post welcome messages in<select class="input" name="welcomeChannelId"><option value="">Don't post</option>${pr.channels.map((c) => html`<option value="${c.id}" ${pr.welcomeChannelId === c.id ? 'selected' : ''}>#${c.name}</option>`)}</select></label>
        <label>Rules <small class="muted">shown on the preview card before people join</small><textarea class="input" name="rules" rows="4" maxlength="2000">${pr.rules}</textarea></label>
      </div>
      <div class="card-block">
        <label class="switch-row"><span><b>🧭 Discoverable</b><small class="muted">List this Playroom in Discover so anyone can join</small></span><input type="checkbox" class="switch" name="isPublic" ${pr.isPublic ? 'checked' : ''}></label>
      </div>
    </form>
    <div class="save-bar"><button class="btn primary" id="ov-save">Save changes</button></div>`);
  const tags = chipInput($('#ov-tags', el), pr.tags, { placeholder: 'gaming, art…', max: 8 });
  const prev = () => setHtml($('#pr-prev', el), html`<div class="pv-banner" style="background:${raw(bannerCss(st.banner))}"></div><div class="pv-head">${prIcon({ ...pr, icon: st.icon, iconEmoji: st.iconEmoji, accentColor: $('[name=accentColor]', el)?.value || pr.accentColor }, 64)}<h2>${$('[name=name]', el)?.value || pr.name}</h2></div>`);
  prev();
  $('#ov-form', el).oninput = prev;
  $('#ov-emoji', el).onclick = (e) => emojiPicker(e.currentTarget, (em) => { st.iconEmoji = em; st.icon = null; $('#ov-emoji', el).textContent = em; prev(); });
  const upload = (cb) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => { const up = await api.upload(i.files[0]).catch((err) => toast(err.message, 'error')); if (up) { cb(up.url); prev(); } }; i.click(); };
  $('#ov-icon', el).onclick = () => upload((u) => { st.icon = u; });
  $('#ov-icon-clear', el)?.addEventListener('click', () => { st.icon = null; prev(); });
  $('#ov-banner', el).onclick = () => upload((u) => { st.banner = { type: 'image', value: u, position: 50 }; });
  $$('[data-b]', el).forEach((s) => s.onclick = () => { st.banner = { type: 'gradient', value: s.dataset.b }; $$('[data-b]', el).forEach((x) => x.classList.toggle('sel', x === s)); prev(); });
  $('#ov-save', el).onclick = async () => {
    const fd = new FormData($('#ov-form', el));
    try {
      await api.req('playroom.update', { id: pr.id, patch: { name: fd.get('name'), description: fd.get('description'), rules: fd.get('rules'), welcomeMessage: fd.get('welcomeMessage'), welcomeChannelId: fd.get('welcomeChannelId') || null, accentColor: fd.get('accentColor'), isPublic: !!fd.get('isPublic'), tags: tags.get(), iconEmoji: st.iconEmoji, icon: st.icon, banner: st.banner } });
      toast('Playroom updated ✨');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
function channels(el, pr) {
  const loose = pr.channels.filter((c) => !c.categoryId || !pr.categories.some((k) => k.id === c.categoryId));
  const chRow = (c) => html`<div class="mgr-row"><span class="ch-icon">${c.type === 'announcement' ? '📢' : c.viewRoles?.length ? '🔒' : '#'}</span><b>${c.name}</b><small class="muted grow">${c.topic}</small>
    <button class="icon-btn tiny" data-ch-move="${c.id}" data-dir="-1" title="Move up">▲</button><button class="icon-btn tiny" data-ch-move="${c.id}" data-dir="1" title="Move down">▼</button><button class="btn tiny ghost" data-ch-edit="${c.id}">Edit</button></div>`;
  setHtml(el, html`
    <h2>Channels & categories</h2>
    <div class="row gap"><button class="btn primary" id="new-ch">＋ Channel</button><button class="btn ghost" id="new-cat">＋ Category</button></div>
    ${loose.length ? html`<div class="card-block"><h4>No category</h4>${loose.map(chRow)}</div>` : ''}
    ${pr.categories.map((k, i) => html`<div class="card-block">
      <div class="mgr-row cat-row"><b class="grow">${k.name}</b>
        <button class="icon-btn tiny" data-cat-move="${k.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="icon-btn tiny" data-cat-move="${k.id}" data-dir="1" ${i === pr.categories.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn tiny ghost" data-cat-rename="${k.id}">Rename</button><button class="btn tiny ghost danger" data-cat-del="${k.id}">Delete</button></div>
      ${pr.channels.filter((c) => c.categoryId === k.id).map(chRow)}
      <button class="btn tiny ghost" data-cat-add="${k.id}">＋ Add channel here</button>
    </div>`)}`);
  const views = () => import('./views.js');
  $('#new-ch', el).onclick = () => views().then((v) => v.openChannelEditor(pr));
  $('#new-cat', el).onclick = async () => { const n = await promptDialog('New category', { placeholder: 'Category name', confirm: 'Create' }); if (n) await api.req('category.create', { prId: pr.id, name: n }); };
  $$('[data-ch-edit]', el).forEach((b) => b.onclick = () => views().then((v) => v.openChannelEditor(S.playrooms[pr.id], b.dataset.chEdit)));
  $$('[data-cat-add]', el).forEach((b) => b.onclick = () => views().then((v) => v.openChannelEditor(S.playrooms[pr.id], null, b.dataset.catAdd)));
  $$('[data-ch-move]', el).forEach((b) => b.onclick = () => api.req('channel.update', { prId: pr.id, id: b.dataset.chMove, move: Number(b.dataset.dir) }));
  $$('[data-cat-move]', el).forEach((b) => b.onclick = () => api.req('category.update', { prId: pr.id, id: b.dataset.catMove, move: Number(b.dataset.dir) }));
  $$('[data-cat-rename]', el).forEach((b) => b.onclick = async () => { const k = pr.categories.find((x) => x.id === b.dataset.catRename); const n = await promptDialog('Rename category', { value: k.name }); if (n) await api.req('category.update', { prId: pr.id, id: k.id, name: n }); });
  $$('[data-cat-del]', el).forEach((b) => b.onclick = async () => { if (await confirmDialog({ title: 'Delete category?', message: 'Its channels will be kept and moved to "No category".', confirm: 'Delete', danger: true })) await api.req('category.delete', { prId: pr.id, id: b.dataset.catDel }); });
}

// ---------------------------------------------------------------------------
function roles(el, pr, m, redraw) {
  const sorted = [...pr.roles].sort((a, b) => b.position - a.position);
  const myTop = pr.myTop;
  if (!state.roleId || !pr.roles.some((r) => r.id === state.roleId)) state.roleId = sorted[0].id;
  const role = pr.roles.find((r) => r.id === state.roleId);
  const isEveryone = role.id === pr.id;
  const editable = pr.ownerId === S.me.id || (role.position < myTop) || (isEveryone && can(pr, 'MANAGE_ROLES'));
  const count = (rid) => Object.values(pr.members).filter((mm) => mm.roles.includes(rid)).length;
  setHtml(el, html`
    <h2>Roles & hierarchy</h2>
    <p class="muted small">Roles higher in the list outrank roles below them. Members can only manage roles and people <b>below</b> their own highest role. The owner 👑 is above everything.</p>
    <div class="roles-layout">
      <div class="role-list">
        <button class="btn primary block" id="new-role">＋ Create role</button>
        <div class="role-owner">👑 Owner — ${user(pr.ownerId).displayName}</div>
        ${sorted.map((r, i) => html`<div class="role-item ${r.id === state.roleId ? 'active' : ''} ${pr.ownerId !== S.me.id && r.position >= myTop && r.id !== pr.id ? 'locked' : ''}" data-role="${r.id}">
          <span class="role-dot" style="--rc:${r.color || '#99a1b3'}"></span><b>${r.name}</b><small>${r.id === pr.id ? 'everyone' : count(r.id)}</small>
          ${r.id !== pr.id ? html`<span class="role-move"><button class="icon-btn tiny" data-up="${r.id}" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button><button class="icon-btn tiny" data-down="${r.id}" ${r.position <= 1 ? 'disabled' : ''} title="Move down">▼</button></span>` : ''}
        </div>`)}
      </div>
      <div class="role-edit">
        ${!editable ? html`<div class="notice">🔒 This role is at or above your highest role, so you can't edit it.</div>` : ''}
        <fieldset ${editable ? '' : 'disabled'}>
          <div class="row gap"><label class="grow">Role name<input class="input" id="r-name" value="${role.name}" ${isEveryone ? 'disabled' : ''} maxlength="32"></label><button class="bp-emoji small" id="r-icon" title="Role icon">${role.icon || '🏷️'}</button></div>
          <label>Color<div class="row gap wrap">${ROLE_COLORS.map((c) => html`<button class="accent-dot small ${role.color === c ? 'sel' : ''}" data-color="${c}" style="background:${c}"></button>`)}<input type="color" id="r-color" value="${role.color || '#99a1b3'}"></div></label>
          ${!isEveryone ? html`<label class="switch-row small"><span>Show members separately in the member list</span><input type="checkbox" class="switch" id="r-hoist" ${role.hoist ? 'checked' : ''}></label>
          <label class="switch-row small"><span>Allow anyone to @mention this role</span><input type="checkbox" class="switch" id="r-mention" ${role.mentionable ? 'checked' : ''}></label>` : ''}
          <h4>Permissions</h4>
          ${Object.entries(PERM_GROUPS).map(([g, list]) => html`<div class="perm-group"><h5>${g}</h5>${list.map((p) => html`<label class="switch-row small perm"><span><b>${PERM_NAMES[p]}</b><small class="muted">${S.permissions[p]}</small></span><input type="checkbox" class="switch" data-perm="${p}" ${role.permissions.includes(p) ? 'checked' : ''}></label>`)}</div>`)}
          <div class="row gap"><button class="btn primary" id="r-save">Save role</button>${!isEveryone ? html`<button class="btn danger ghost" id="r-del">Delete role</button>` : ''}</div>
        </fieldset>
      </div>
    </div>`);
  let color = role.color;
  let icon = role.icon || '';
  $$('[data-role]', el).forEach((x) => x.onclick = (e) => { if (e.target.closest('button')) return; state.roleId = x.dataset.role; redraw(); });
  $$('[data-up]', el).forEach((b) => b.onclick = () => api.req('role.move', { prId: pr.id, id: b.dataset.up, direction: 1 }).catch((err) => toast(err.message, 'error')));
  $$('[data-down]', el).forEach((b) => b.onclick = () => api.req('role.move', { prId: pr.id, id: b.dataset.down, direction: -1 }).catch((err) => toast(err.message, 'error')));
  $('#new-role', el).onclick = async () => {
    const n = await promptDialog('Create role', { placeholder: 'Role name', confirm: 'Create' });
    if (!n) return;
    const { id } = await api.req('role.create', { prId: pr.id, name: n, color: ROLE_COLORS[Math.floor(Math.random() * ROLE_COLORS.length)] });
    state.roleId = id;
  };
  $$('[data-color]', el).forEach((b) => b.onclick = () => { color = b.dataset.color; $$('[data-color]', el).forEach((x) => x.classList.toggle('sel', x === b)); $('#r-color', el).value = color; });
  $('#r-color', el).oninput = (e) => { color = e.target.value; };
  $('#r-icon', el).onclick = (e) => emojiPicker(e.currentTarget, (em) => { icon = em; $('#r-icon', el).textContent = em; });
  $('#r-save', el).onclick = async () => {
    const patch = { color, icon, permissions: $$('[data-perm]', el).filter((c) => c.checked).map((c) => c.dataset.perm) };
    if (!isEveryone) Object.assign(patch, { name: $('#r-name', el).value, hoist: $('#r-hoist', el).checked, mentionable: $('#r-mention', el).checked });
    try { await api.req('role.update', { prId: pr.id, id: role.id, patch }); toast('Role saved'); } catch (err) { toast(err.message, 'error'); }
  };
  $('#r-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: `Delete ${role.name}?`, message: 'Members will lose this role.', confirm: 'Delete', danger: true }))) return;
    await api.req('role.delete', { prId: pr.id, id: role.id });
    state.roleId = null;
  });
}

// ---------------------------------------------------------------------------
export function memberActions(pr, id) {
  if (!pr) return [];
  const u = user(id);
  const isSelf = id === S.me.id;
  const above = pr.ownerId === S.me.id || pr.myTop > topPosition(pr, id);
  const assignable = [...pr.roles].filter((r) => r.id !== pr.id && (pr.ownerId === S.me.id || r.position < pr.myTop)).sort((a, b) => b.position - a.position);
  const mem = pr.members[id];
  return [
    { header: memberName(pr, id) },
    { icon: '👤', label: 'Profile', action: () => import('./profile.js').then((p) => p.openProfile(id)) },
    !isSelf ? { icon: '💬', label: 'Message', action: async () => { const cv = await api.req('dm.open', { userId: id }); S.conversations[cv.id] = cv; navigate(`#/home/${cv.id}`); } } : null,
    can(pr, 'MANAGE_ROLES') && (above || isSelf) && assignable.length ? { icon: '🏷️', label: 'Roles…', action: () => rolePicker(pr, id) } : null,
    (isSelf && can(pr, 'CHANGE_NICKNAME')) || (!isSelf && can(pr, 'MANAGE_PLAYROOM') && above) ? { icon: '✏️', label: 'Change nickname', action: async () => { const n = await promptDialog('Nickname', { value: mem?.nickname || '', placeholder: u.displayName }); if (n !== null) await api.req('member.nick', { prId: pr.id, userId: id, nickname: n }); } } : null,
    !isSelf && above && can(pr, 'TIMEOUT_MEMBERS') ? { icon: '⏳', label: mem?.timeoutUntil > Date.now() ? 'Remove timeout' : 'Timeout…', action: () => timeoutDialog(pr, id) } : null,
    !isSelf && above && (can(pr, 'KICK_MEMBERS') || can(pr, 'BAN_MEMBERS')) ? { divider: true } : null,
    !isSelf && above && can(pr, 'KICK_MEMBERS') ? { icon: '👢', label: 'Kick', danger: true, action: async () => { const r = await confirmDialog({ title: `Kick ${u.displayName}?`, message: 'They can rejoin with an invite.', confirm: 'Kick', danger: true, input: { placeholder: 'Reason (optional)' } }); if (r !== null) await api.req('member.kick', { prId: pr.id, userId: id, reason: r }); } } : null,
    !isSelf && above && can(pr, 'BAN_MEMBERS') ? { icon: '🔨', label: 'Ban', danger: true, action: async () => { const r = await confirmDialog({ title: `Ban ${u.displayName}?`, message: 'They won\'t be able to rejoin until unbanned.', confirm: 'Ban', danger: true, input: { placeholder: 'Reason (optional)' } }); if (r !== null) await api.req('member.ban', { prId: pr.id, userId: id, reason: r }); } } : null,
  ];
}

function rolePicker(pr, id) {
  modal({
    title: `Roles for ${memberName(pr, id)}`,
    body: (b) => {
      const draw = () => {
        const p = S.playrooms[pr.id];
        const mem = p.members[id];
        if (!mem) return;
        const list = [...p.roles].filter((r) => r.id !== p.id).sort((a, c) => c.position - a.position);
        setHtml(b, html`${list.map((r) => {
          const ok = p.ownerId === S.me.id || r.position < p.myTop;
          return html`<label class="switch-row small"><span><span class="role-dot" style="--rc:${r.color}"></span> ${r.icon || ''} ${r.name}${ok ? '' : html` <small class="muted">🔒</small>`}</span><input type="checkbox" class="switch" data-r="${r.id}" ${mem.roles.includes(r.id) ? 'checked' : ''} ${ok ? '' : 'disabled'}></label>`;
        })}`);
        $$('[data-r]', b).forEach((c) => c.onchange = () => api.req('member.roles', { prId: p.id, userId: id, roleId: c.dataset.r, add: c.checked }).catch((err) => { toast(err.message, 'error'); c.checked = !c.checked; }));
      };
      draw();
    },
  });
}

async function timeoutDialog(pr, id) {
  const mem = pr.members[id];
  if (mem.timeoutUntil > Date.now()) return api.req('member.timeout', { prId: pr.id, userId: id, minutes: 0 });
  menu(document.querySelector('.modal') || document.body, [
    { header: 'Timeout for…' },
    ...[[1, '60 seconds'], [5, '5 minutes'], [10, '10 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']].map(([min, l]) => ({ icon: '⏳', label: l, action: () => api.req('member.timeout', { prId: pr.id, userId: id, minutes: min }) })),
  ]);
}

function members(el, pr) {
  const ids = Object.keys(pr.members).sort((a, b) => topPosition(pr, b) - topPosition(pr, a) || memberName(pr, a).localeCompare(memberName(pr, b)));
  setHtml(el, html`
    <h2>Members — ${ids.length}</h2>
    <input class="input small" placeholder="Search members" id="m-q">
    <div class="member-table">${ids.map((id) => {
      const mem = pr.members[id];
      return html`<div class="mt-row" data-name="${memberName(pr, id).toLowerCase()} ${user(id).username}">
        ${avatar(user(id), 36, { status: true })}
        <div class="mt-name">${nameTag(user(id), { color: roleColor(pr, id), text: memberName(pr, id) })}${pr.ownerId === id ? html` 👑` : ''}<small class="muted">@${user(id).username} · joined ${ago(mem.joinedAt)}${mem.timeoutUntil > Date.now() ? html` · ⏳ timed out` : ''}</small></div>
        <div class="mt-roles">${memberRoles(pr, id).map((r) => html`<span class="role-pill" style="--rc:${r.color}"><i></i>${r.name}</span>`)}</div>
        <button class="icon-btn" data-mm="${id}">⋯</button>
      </div>`;
    })}</div>`);
  $('#m-q', el).oninput = (e) => $$('.mt-row', el).forEach((r) => { r.style.display = r.dataset.name.includes(e.target.value.toLowerCase()) ? '' : 'none'; });
  $$('[data-mm]', el).forEach((b) => b.onclick = () => menu(b, memberActions(S.playrooms[pr.id], b.dataset.mm)));
}

// ---------------------------------------------------------------------------
export function inviteUrl(code) { return `${location.origin}/invite/${code}`; }

function invites(el, pr) {
  setHtml(el, html`
    <h2>Invites</h2>
    <div class="card-block">
      <h4>New invite</h4>
      <div class="row gap wrap">
        <label class="field-inline">Expires <select class="input small" id="inv-exp"><option value="0">Never</option><option value="1">1 hour</option><option value="24" selected>1 day</option><option value="168">7 days</option></select></label>
        <label class="field-inline">Max uses <select class="input small" id="inv-max"><option value="0">∞</option><option value="1">1</option><option value="5">5</option><option value="25">25</option><option value="100">100</option></select></label>
        <button class="btn primary" id="inv-new">Create invite</button>
      </div>
    </div>
    ${pr.invites.length ? html`<div class="card-block">${pr.invites.slice().reverse().map((i) => html`<div class="mgr-row"><code class="grow">${inviteUrl(i.code)}</code><small class="muted">${i.uses}${i.maxUses ? `/${i.maxUses}` : ''} uses · ${i.expiresAt ? (i.expiresAt < Date.now() ? 'expired' : `expires ${new Date(i.expiresAt).toLocaleString()}`) : 'never expires'} · by ${user(i.by).displayName}</small><button class="btn tiny ghost" data-copy="${i.code}">Copy</button><button class="btn tiny ghost danger" data-rev="${i.code}">Revoke</button></div>`)}</div>` : html`<p class="muted">No invites yet.</p>`}`);
  $('#inv-new', el).onclick = async () => {
    const inv = await api.req('invite.create', { prId: pr.id, expiresHours: Number($('#inv-exp', el).value), maxUses: Number($('#inv-max', el).value) });
    navigator.clipboard?.writeText(inviteUrl(inv.code));
    toast('Invite link copied 💌');
  };
  $$('[data-copy]', el).forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(inviteUrl(b.dataset.copy)); toast('Copied!'); });
  $$('[data-rev]', el).forEach((b) => b.onclick = () => api.req('invite.revoke', { prId: pr.id, code: b.dataset.rev }));
}

export async function openInvite(pr) {
  if (!pr) return;
  let inv = pr.invites.find((i) => i.by === S.me.id && (!i.expiresAt || i.expiresAt > Date.now()) && (!i.maxUses || i.uses < i.maxUses));
  if (!inv) inv = await api.req('invite.create', { prId: pr.id, expiresHours: 168 });
  const url = inviteUrl(inv.code);
  const friends = S.me.friends.map(user);
  modal({
    title: `Invite friends to ${pr.name}`,
    body: (b, m) => {
      setHtml(b, html`
        <p class="muted">Share this link — it ${inv.expiresAt ? `expires ${new Date(inv.expiresAt).toLocaleDateString()}` : 'never expires'}.</p>
        <div class="row gap"><input class="input grow" readonly value="${url}" id="inv-url"><button class="btn primary" id="inv-copy">Copy</button></div>
        ${friends.length ? html`<h4>Send to friends</h4><div class="fp-list">${friends.map((u) => html`<div class="fp-item">${avatar(u, 30, { status: true })}<b>${u.displayName}</b><span class="grow"></span>${pr.members[u.id] ? html`<small class="muted">Already here</small>` : html`<button class="btn tiny ghost" data-send="${u.id}">Send</button>`}</div>`)}</div>` : ''}`);
      $('#inv-copy', b).onclick = () => { navigator.clipboard?.writeText(url); $('#inv-url', b).select(); toast('Copied 💌'); };
      $$('[data-send]', b).forEach((x) => x.onclick = async () => {
        const cv = await api.req('dm.open', { userId: x.dataset.send });
        await api.req('message.send', { channelId: cv.id, content: `Come hang out in **${pr.name}**! ${url}` });
        x.textContent = 'Sent ✓';
        x.disabled = true;
      });
    },
  });
}

function bans(el, pr) {
  const list = Object.entries(pr.bans);
  setHtml(el, html`<h2>Bans — ${list.length}</h2>${list.length ? html`<div class="card-block">${list.map(([id, b]) => html`<div class="mgr-row">${avatar(user(id), 30)}<b>${user(id).displayName}</b><small class="muted grow">${b.reason || 'No reason'} · by ${user(b.by).displayName} · ${ago(b.at)}</small><button class="btn tiny ghost" data-unban="${id}">Unban</button></div>`)}</div>` : html`<p class="muted">Nobody is banned. 🕊️</p>`}`);
  $$('[data-unban]', el).forEach((b) => b.onclick = () => api.req('member.unban', { prId: pr.id, userId: b.dataset.unban }));
}

// ---------------------------------------------------------------------------
function automod(el, pr, m, redraw) {
  const a = structuredClone(pr.automod);
  const r = a.rules;
  const roleList = pr.roles.filter((x) => x.id !== pr.id).sort((x, y) => y.position - x.position);
  const rule = (k, title, desc, extra = '') => html`<div class="am-rule ${r[k].enabled ? 'on' : ''}"><label class="switch-row"><span><b>${title}</b><small class="muted">${desc}</small></span><input type="checkbox" class="switch" data-rule="${k}" ${r[k].enabled ? 'checked' : ''}></label>${extra}</div>`;
  setHtml(el, html`
    <h2>🛡️ Automod</h2>
    <div class="card-block am-master ${a.enabled ? 'on' : ''}">
      <label class="switch-row"><span><b>Automod is ${a.enabled ? 'ON' : 'OFF'}</b><small class="muted">Automatically blocks rule-breaking messages before anyone sees them.</small></span><input type="checkbox" class="switch big" id="am-enabled" ${a.enabled ? 'checked' : ''}></label>
      <div class="row gap wrap am-presets"><span class="muted small">Presets:</span><button class="btn tiny ghost" data-preset="chill">😌 Chill</button><button class="btn tiny ghost" data-preset="balanced">⚖️ Balanced</button><button class="btn tiny ghost" data-preset="strict">🔒 Strict (family-friendly)</button></div>
    </div>
    <fieldset id="am-fields" ${a.enabled ? '' : 'class="dim"'}>
      ${rule('bannedWords', '🚫 Blocked words', 'Use * as a wildcard, e.g. bad* blocks "badword".', html`<textarea class="input" id="am-words" rows="3" placeholder="one per line">${r.bannedWords.words.join('\n')}</textarea>`)}
      ${rule('invites', '💌 Invite links', 'Block invites to other communities.')}
      ${rule('links', '🔗 All links', 'Block links except for allowed domains.', html`<input class="input" id="am-allow" placeholder="allowed domains, comma separated (youtube.com, imgur.com)" value="${r.links.allow.join(', ')}">`)}
      ${rule('mentions', '📣 Mass mentions', 'Limit mentions per message.', html`<label class="field-inline">Max <input class="input small num" type="number" min="1" max="50" id="am-mentions" value="${r.mentions.max}"></label>`)}
      ${rule('caps', '🔠 Excessive caps', 'Block messages that are mostly CAPITAL LETTERS.', html`<label class="field-inline">Threshold <input class="input small num" type="number" min="50" max="100" id="am-caps" value="${r.caps.percent}">%</label>`)}
      ${rule('spam', '⚡ Spam / flooding', 'Too many messages too fast.', html`<label class="field-inline">Max <input class="input small num" type="number" min="2" max="30" id="am-spam" value="${r.spam.max}"> messages in <input class="input small num" type="number" min="2" max="60" id="am-spam-s" value="${r.spam.seconds}">s</label>`)}
      ${rule('duplicates', '🔁 Repeated messages', 'Same message sent again and again.', html`<label class="field-inline">Max repeats <input class="input small num" type="number" min="1" max="10" id="am-dupes" value="${r.duplicates.max}"></label>`)}
      ${rule('zalgo', '👾 Glitch text', 'Block zalgo / combining-character spam.')}
      <div class="card-block">
        <h4>When a message is blocked</h4>
        <div class="radio-list"><label><input type="radio" name="am-action" value="block" ${a.action === 'block' ? 'checked' : ''}> Block the message and warn the sender</label>
        <label><input type="radio" name="am-action" value="block_timeout" ${a.action === 'block_timeout' ? 'checked' : ''}> Block and timeout for <input class="input small num" type="number" min="1" max="1440" id="am-tmin" value="${a.timeoutMinutes}"> minutes</label></div>
        <h4>Exemptions</h4>
        <label class="switch-row small"><span>Admins & message managers are exempt</span><input type="checkbox" class="switch" id="am-admins" ${a.exemptAdmins ? 'checked' : ''}></label>
        <div class="check-grid">${roleList.map((x) => html`<label class="check"><input type="checkbox" data-exempt="${x.id}" ${a.exemptRoles.includes(x.id) ? 'checked' : ''}><span class="role-dot" style="--rc:${x.color}"></span>${x.name}</label>`)}</div>
      </div>
    </fieldset>
    <div class="save-bar"><button class="btn primary" id="am-save">Save Automod</button></div>`);
  $('#am-enabled', el).onchange = (e) => { $('#am-fields', el).className = e.target.checked ? '' : 'dim'; e.target.closest('.am-master').classList.toggle('on', e.target.checked); };
  $$('[data-rule]', el).forEach((c) => c.onchange = () => c.closest('.am-rule').classList.toggle('on', c.checked));
  const PRESETS = {
    chill: { bannedWords: 1, invites: 1, links: 0, mentions: 1, caps: 0, spam: 1, duplicates: 0, zalgo: 1 },
    balanced: { bannedWords: 1, invites: 1, links: 0, mentions: 1, caps: 1, spam: 1, duplicates: 1, zalgo: 1 },
    strict: { bannedWords: 1, invites: 1, links: 1, mentions: 1, caps: 1, spam: 1, duplicates: 1, zalgo: 1 },
  };
  $$('[data-preset]', el).forEach((b) => b.onclick = () => {
    const p = PRESETS[b.dataset.preset];
    $('#am-enabled', el).checked = true;
    $('#am-enabled', el).dispatchEvent(new Event('change'));
    for (const [k, v] of Object.entries(p)) { const c = $(`[data-rule=${k}]`, el); c.checked = !!v; c.dispatchEvent(new Event('change')); }
    if (b.dataset.preset === 'strict') { $('[name=am-action][value=block_timeout]', el).checked = true; $('#am-mentions', el).value = 3; }
    toast(`${b.textContent} preset applied — remember to save`);
  });
  $('#am-save', el).onclick = async () => {
    const payload = {
      enabled: $('#am-enabled', el).checked,
      action: $('[name=am-action]:checked', el).value,
      timeoutMinutes: Number($('#am-tmin', el).value),
      exemptAdmins: $('#am-admins', el).checked,
      exemptRoles: $$('[data-exempt]', el).filter((c) => c.checked).map((c) => c.dataset.exempt),
      rules: {
        bannedWords: { enabled: $('[data-rule=bannedWords]', el).checked, words: $('#am-words', el).value.split('\n').map((w) => w.trim()).filter(Boolean) },
        invites: { enabled: $('[data-rule=invites]', el).checked },
        links: { enabled: $('[data-rule=links]', el).checked, allow: $('#am-allow', el).value.split(',').map((d) => d.trim()).filter(Boolean) },
        mentions: { enabled: $('[data-rule=mentions]', el).checked, max: Number($('#am-mentions', el).value) },
        caps: { enabled: $('[data-rule=caps]', el).checked, percent: Number($('#am-caps', el).value) },
        spam: { enabled: $('[data-rule=spam]', el).checked, max: Number($('#am-spam', el).value), seconds: Number($('#am-spam-s', el).value) },
        duplicates: { enabled: $('[data-rule=duplicates]', el).checked, max: Number($('#am-dupes', el).value) },
        zalgo: { enabled: $('[data-rule=zalgo]', el).checked },
      },
    };
    try { await api.req('automod.update', { prId: pr.id, automod: payload }); toast(`Automod ${payload.enabled ? 'enabled 🛡️' : 'disabled'}`); redraw(); } catch (err) { toast(err.message, 'error'); }
  };
}

function bots(el, pr) {
  const all = ['bot_dicey', 'bot_quizzy', 'bot_hangry', 'bot_tictac', 'bot_rps', 'bot_scramble'];
  setHtml(el, html`<h2>🤖 Game bots</h2><p class="muted">Public bots anyone can add for free. Members type <code>!help</code> to see commands.</p>
    <div class="bot-grid small">${all.map((id) => { const u = user(id); return html`<div class="bot-card mini" style="--bot:${u.profile.avatarColor}"><div class="bot-top">${avatar(u, 44)}<div><h3>${u.displayName}</h3><p class="small">${u.bot?.tagline || ''}</p></div></div><label class="switch-row small"><span>${pr.bots.includes(id) ? 'Added' : 'Not added'}</span><input type="checkbox" class="switch" data-bot="${id}" ${pr.bots.includes(id) ? 'checked' : ''}></label></div>`; })}</div>`);
  $$('[data-bot]', el).forEach((c) => c.onchange = () => api.req('playroom.bots', { prId: pr.id, botId: c.dataset.bot, add: c.checked }).catch((err) => toast(err.message, 'error')));
}

function log(el, pr) {
  const entries = pr.modLog.slice().reverse();
  setHtml(el, html`<h2>📜 Mod log</h2>${entries.length ? html`<div class="card-block log">${entries.map((e) => html`<div class="log-row"><time>${timeLabel(e.at)}</time><span>${e.actorId ? html`<b>${user(e.actorId).displayName}</b>` : html`<b>🛡️ Automod</b>`} ${LOG_LABELS[e.type] || e.type} ${e.targetId && e.targetId !== e.actorId ? html`<b>${user(e.targetId).displayName}</b>` : ''} ${e.detail ? html`<small class="muted">— ${e.detail}</small>` : ''}</span></div>`)}</div>` : html`<p class="muted">Nothing here yet.</p>`}`);
}

function danger(el, pr, m) {
  const isOwner = pr.ownerId === S.me.id;
  const others = Object.keys(pr.members).filter((id) => id !== S.me.id);
  setHtml(el, html`
    <h2>${isOwner ? 'Ownership & delete' : 'Leave Playroom'}</h2>
    ${isOwner ? html`
      <div class="card-block">
        <h4>👑 Transfer ownership</h4>
        <div class="row gap"><select class="input grow" id="tr-user">${others.map((id) => html`<option value="${id}">${memberName(pr, id)} (@${user(id).username})</option>`)}</select><button class="btn ghost" id="tr-go" ${others.length ? '' : 'disabled'}>Transfer</button></div>
      </div>
      <div class="card-block danger-zone">
        <h4>Delete Playroom</h4>
        <p class="muted">This permanently deletes all channels, messages and roles.</p>
        <button class="btn danger" id="pr-del">Delete ${pr.name}</button>
      </div>` : html`<div class="card-block"><button class="btn danger" id="pr-leave">🚪 Leave ${pr.name}</button></div>`}`);
  $('#tr-go', el)?.addEventListener('click', async () => {
    const id = $('#tr-user', el).value;
    if (!(await confirmDialog({ title: 'Transfer ownership?', message: `${memberName(pr, id)} will become the owner. You'll keep your roles.`, confirm: 'Transfer', danger: true }))) return;
    await api.req('playroom.transfer', { id: pr.id, userId: id });
    toast('Ownership transferred 👑');
  });
  $('#pr-del', el)?.addEventListener('click', async () => {
    const name = await confirmDialog({ title: 'Delete Playroom?', message: `Type "${pr.name}" to confirm.`, confirm: 'Delete forever', danger: true, input: { placeholder: pr.name } });
    if (name === null) return;
    try { await api.req('playroom.delete', { id: pr.id, confirmName: name }); m.close(); navigate('#/home'); } catch (err) { toast(err.message, 'error'); }
  });
  $('#pr-leave', el)?.addEventListener('click', async () => { m.close(); (await import('./views.js')).leavePlayroom(pr); });
}
