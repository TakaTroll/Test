// User settings: profile studio, account, appearance, layouts, privacy.
import { html, raw, setHtml, $, $$, esc, GRADIENTS, ACCENTS, CHAT_BACKGROUNDS, APP_NAME } from './util.js';
import * as api from './api.js';
import { S } from './state.js';
import { modal, toast, chipInput, emojiPicker, confirmDialog } from './ui.js';
import { profileCardHtml } from './profile.js';
import { applyTheme, logout, refresh } from './app.js';
import { renderBackground } from './chat.js';

const DECORATIONS = [['none', 'None'], ['hearts', '💗 Hearts'], ['sparkle', '✨ Sparkle'], ['neon', '🌈 Neon ring'], ['crown', '👑 Crown'], ['petals', '🌸 Petals'], ['halo', '😇 Halo'], ['flame', '🔥 Flame']];
const NAME_STYLES = [['plain', 'Plain'], ['gradient', 'Gradient'], ['glow', 'Glow'], ['rainbow', 'Rainbow'], ['shimmer', 'Shimmer'], ['outline', 'Outline']];
const NAME_FONTS = [['default', 'Default'], ['rounded', 'Rounded'], ['serif', 'Elegant'], ['mono', 'Mono'], ['script', 'Script'], ['pixel', 'Pixel']];
const CARD_FX = [['none', 'None'], ['sparkles', '✨ Sparkles'], ['hearts', '💗 Floating hearts'], ['glow', '🌟 Glow border'], ['aurora', '🌌 Aurora'], ['glass', '🫧 Glass']];
const SECTIONS = [['profile', '🎨', 'Profile studio'], ['account', '🔑', 'Account'], ['appearance', '🌗', 'Appearance'], ['chats', '💬', 'Layouts & backgrounds'], ['privacy', '🛡️', 'Privacy & safety'], ['notifications', '🔔', 'Notifications'], ['about', '💗', `About ${APP_NAME}`]];

let section = 'profile';

export function openSettings(start = 'profile') {
  section = start;
  modal({
    full: true,
    className: 'settings-modal',
    body: (b, m) => {
      const draw = () => {
        setHtml(b, html`<div class="settings">
          <nav class="settings-nav">
            <h3>Settings</h3>
            ${SECTIONS.map(([k, i, l]) => html`<button class="${section === k ? 'active' : ''}" data-sec="${k}"><span>${i}</span>${l}</button>`)}
            <hr><button class="danger-link" data-x="logout">🚪 Log out</button>
          </nav>
          <section class="settings-body" id="settings-body"></section>
        </div>`);
        $$('[data-sec]', b).forEach((x) => x.onclick = () => { section = x.dataset.sec; draw(); });
        $('[data-x=logout]', b).onclick = () => { m.close(); logout(); };
        const body = $('#settings-body', b);
        ({ profile: profileStudio, account, appearance, chats, privacy, notifications, about })[section](body, m);
      };
      draw();
    },
  });
}

// ---------------------------------------------------------------------------
// Profile studio
// ---------------------------------------------------------------------------
function profileStudio(el) {
  const me = S.me;
  const draft = { displayName: me.displayName, profile: structuredClone(me.profile) };
  const p = draft.profile;
  const preview = () => {
    const fake = { ...me, displayName: draft.displayName || me.displayName, profile: p };
    setHtml($('#pc-preview'), profileCardHtml(fake));
  };
  setHtml(el, html`
    <h2>Profile studio</h2>
    <p class="muted">Make it yours. Everything here is free — always.</p>
    <div class="studio">
      <form class="form studio-form" id="studio">
        <div class="card-block">
          <h4>Identity</h4>
          <label>Display name<input class="input" name="displayName" value="${draft.displayName}" maxlength="32"></label>
          <div class="row gap"><label class="grow">Pronouns<input class="input" name="pronouns" value="${p.pronouns}" maxlength="32" placeholder="she/her, they/them…"></label>
          <label class="grow">Birthday<input class="input" name="birthday" value="${p.birthday}" maxlength="16" placeholder="e.g. 14 Feb"></label></div>
          <label>About me <small class="muted">markdown supported</small><textarea class="input" name="bio" rows="4" maxlength="800">${p.bio}</textarea></label>
          <div class="row gap"><label class="grow">Location<input class="input" name="location" value="${p.location}" maxlength="48"></label>
          <label class="grow">Mood<input class="input" name="mood" value="${p.mood}" maxlength="40" placeholder="cozy & caffeinated"></label></div>
        </div>
        <div class="card-block">
          <h4>Status</h4>
          <div class="row gap"><button type="button" class="btn ghost emoji-pick" id="status-emoji">${p.statusEmoji || '😊'}</button><input class="input grow" name="customStatus" value="${p.customStatus}" maxlength="80" placeholder="What's up?"></div>
          <label>Now playing / doing<input class="input" name="nowPlaying" value="${p.nowPlaying}" maxlength="80" placeholder="Minecraft, Lo-fi beats, Homework…"></label>
        </div>
        <div class="card-block">
          <h4>Avatar</h4>
          <div class="row gap wrap">
            <button type="button" class="btn ghost" id="av-upload">📁 Upload image</button>
            <button type="button" class="btn ghost" id="av-emoji">😀 Use emoji</button>
            ${p.avatar || p.avatarEmoji ? html`<button type="button" class="btn ghost" id="av-clear">Reset</button>` : ''}
            <label class="field-inline">Color <input type="color" name="avatarColor" value="${p.avatarColor || '#ff4fa3'}"></label>
          </div>
          <label>Decoration<div class="opt-grid">${DECORATIONS.map(([k, l]) => html`<label class="opt"><input type="radio" name="decoration" value="${k}" ${p.decoration === k ? 'checked' : ''}><span>${l}</span></label>`)}</div></label>
        </div>
        <div class="card-block">
          <h4>Banner</h4>
          <div class="swatch-grid small">${Object.entries(GRADIENTS).map(([k, g]) => html`<button type="button" class="swatch ${p.banner.type === 'gradient' && p.banner.value === k ? 'sel' : ''}" data-banner="${k}" style="background:${raw(g)}" title="${k}"></button>`)}</div>
          <div class="row gap wrap"><label class="field-inline">Solid <input type="color" id="banner-color" value="${p.banner.type === 'color' ? p.banner.value : '#ff4fa3'}"></label><button type="button" class="btn ghost" id="banner-upload">📁 Upload banner (GIFs work!)</button>
          ${p.banner.type === 'image' ? html`<label class="field-inline grow">Position <input type="range" min="0" max="100" id="banner-pos" value="${p.banner.position ?? 50}"></label>` : ''}</div>
        </div>
        <div class="card-block">
          <h4>Card theme</h4>
          <div class="row gap wrap"><label class="field-inline">Primary <input type="color" name="t1" value="${p.themeColors[0]}"></label><label class="field-inline">Secondary <input type="color" name="t2" value="${p.themeColors[1]}"></label></div>
          <label>Card effect<div class="opt-grid">${CARD_FX.map(([k, l]) => html`<label class="opt"><input type="radio" name="cardEffect" value="${k}" ${(p.cardEffect || 'none') === k ? 'checked' : ''}><span>${l}</span></label>`)}</div></label>
        </div>
        <div class="card-block">
          <h4>Name style</h4>
          <div class="opt-grid">${NAME_STYLES.map(([k, l]) => html`<label class="opt"><input type="radio" name="nameStyle" value="${k}" ${p.nameStyle === k ? 'checked' : ''}><span>${l}</span></label>`)}</div>
          <div class="opt-grid">${NAME_FONTS.map(([k, l]) => html`<label class="opt"><input type="radio" name="nameFont" value="${k}" ${(p.nameFont || 'default') === k ? 'checked' : ''}><span class="font-${k}">${l}</span></label>`)}</div>
          <label class="field-inline">Name color <input type="color" name="nameColor" value="${p.nameColor || '#ffffff'}"> <button type="button" class="btn small ghost" id="name-color-clear">Default</button></label>
        </div>
        <div class="card-block">
          <h4>Interests, games & showcase</h4>
          <label>Interests<div id="chips-interests"></div></label>
          <label>Favorite games<div id="chips-games"></div></label>
          <label>Showcase <small class="muted">anything: achievements, fandoms, quotes</small><div id="chips-showcase"></div></label>
        </div>
        <div class="card-block">
          <h4>Links</h4>
          <div id="links"></div>
          <button type="button" class="btn small ghost" id="add-link">＋ Add link</button>
        </div>
      </form>
      <aside class="studio-preview"><div class="sticky"><h4>Live preview</h4><div id="pc-preview"></div></div></aside>
    </div>
    <div class="save-bar"><span class="muted">Changes preview instantly.</span><button class="btn ghost" id="studio-reset">Reset</button><button class="btn primary" id="studio-save">Save profile</button></div>`);

  const form = $('#studio');
  const sync = () => {
    const fd = new FormData(form);
    draft.displayName = fd.get('displayName');
    for (const k of ['pronouns', 'birthday', 'bio', 'location', 'mood', 'customStatus', 'nowPlaying', 'avatarColor', 'decoration', 'nameStyle', 'nameFont', 'cardEffect']) p[k] = fd.get(k) ?? p[k];
    if (!form.dataset.nameColorCleared) p.nameColor = fd.get('nameColor');
    p.themeColors = [fd.get('t1'), fd.get('t2')];
    preview();
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.onsubmit = (e) => e.preventDefault();

  const interests = chipInput($('#chips-interests'), p.interests || [], { placeholder: 'type & Enter', onChange: (v) => { p.interests = v; preview(); } });
  const games = chipInput($('#chips-games'), p.favoriteGames || [], { placeholder: 'type & Enter', onChange: (v) => { p.favoriteGames = v; preview(); } });
  const showcase = chipInput($('#chips-showcase'), p.showcase || [], { placeholder: 'type & Enter', onChange: (v) => { p.showcase = v; preview(); } });

  const drawLinks = () => {
    setHtml($('#links'), html`${(p.links || []).map((l, i) => html`<div class="row gap link-row"><input class="input" data-li="${i}" data-k="label" value="${l.label}" placeholder="Label"><input class="input grow" data-li="${i}" data-k="url" value="${l.url}" placeholder="https://"><button type="button" class="icon-btn" data-rm="${i}">✕</button></div>`)}`);
    $$('#links input').forEach((inp) => inp.oninput = () => { p.links[inp.dataset.li][inp.dataset.k] = inp.value; preview(); });
    $$('#links [data-rm]').forEach((b) => b.onclick = () => { p.links.splice(Number(b.dataset.rm), 1); drawLinks(); preview(); });
  };
  drawLinks();
  $('#add-link').onclick = () => { if ((p.links || []).length >= 6) return toast('Up to 6 links.'); p.links = [...(p.links || []), { label: '', url: 'https://' }]; drawLinks(); };

  $('#status-emoji').onclick = (e) => emojiPicker(e.currentTarget, (em) => { p.statusEmoji = em; $('#status-emoji').textContent = em; preview(); });
  $('#av-emoji').onclick = (e) => emojiPicker(e.currentTarget, (em) => { p.avatarEmoji = em; p.avatar = null; preview(); });
  $('#av-upload').onclick = async () => {
    const f = await pick('image/*');
    if (!f) return;
    const up = await api.upload(f).catch((err) => toast(err.message, 'error'));
    if (up) { p.avatar = up.url; preview(); }
  };
  $('#av-clear')?.addEventListener('click', () => { p.avatar = null; p.avatarEmoji = ''; preview(); });
  $$('[data-banner]').forEach((s) => s.onclick = () => { p.banner = { type: 'gradient', value: s.dataset.banner }; $$('[data-banner]').forEach((x) => x.classList.toggle('sel', x === s)); preview(); });
  $('#banner-color').oninput = (e) => { p.banner = { type: 'color', value: e.target.value }; preview(); };
  $('#banner-upload').onclick = async () => {
    const f = await pick('image/*');
    if (!f) return;
    const up = await api.upload(f).catch((err) => toast(err.message, 'error'));
    if (up) { p.banner = { type: 'image', value: up.url, position: 50 }; preview(); }
  };
  $('#banner-pos')?.addEventListener('input', (e) => { p.banner.position = Number(e.target.value); preview(); });
  $('#name-color-clear').onclick = () => { p.nameColor = ''; form.dataset.nameColorCleared = '1'; preview(); };
  form.querySelector('[name=nameColor]').addEventListener('input', () => { delete form.dataset.nameColorCleared; });

  $('#studio-reset').onclick = () => profileStudio(el);
  $('#studio-save').onclick = async () => {
    sync();
    p.interests = interests.get();
    p.favoriteGames = games.get();
    p.showcase = showcase.get();
    p.links = (p.links || []).filter((l) => /^https?:\/\/.+\..+/.test(l.url));
    try {
      await api.req('me.update', { displayName: draft.displayName, profile: p });
      toast('Profile saved 💗');
    } catch (err) { toast(err.message, 'error'); }
  };
  preview();
}

function pick(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

// ---------------------------------------------------------------------------
function account(el, m) {
  const me = S.me;
  setHtml(el, html`
    <h2>Account</h2>
    ${me.isGuest ? html`
      <div class="card-block highlight">
        <h4>👻 Claim your guest account</h4>
        <p class="muted">Pick a username and password to keep your profile, Playrooms and chats forever. Free, no email needed. Unclaimed guest accounts are removed after 7 days of inactivity.</p>
        <form class="form" id="claim-form">
          <label>Username<input class="input" name="username" placeholder="your_name" maxlength="24" required></label>
          <label>Password<input class="input" type="password" name="password" minlength="6" required></label>
          <button class="btn primary">Claim account</button>
        </form>
      </div>` : html`
      <div class="card-block">
        <h4>Username</h4>
        <form class="row gap" id="username-form"><span class="input-prefix">@</span><input class="input grow" name="username" value="${me.username}" maxlength="24"><button class="btn ghost">Change</button></form>
      </div>
      <div class="card-block">
        <h4>Password</h4>
        <form class="form" id="pw-form">
          <label>Current password<input class="input" type="password" name="current" required></label>
          <label>New password<input class="input" type="password" name="next" minlength="6" required></label>
          <button class="btn ghost">Update password</button>
        </form>
      </div>`}
    <div class="card-block danger-zone">
      <h4>Danger zone</h4>
      <p class="muted">Deleting your account removes your profile and any Playrooms you own. Messages you sent elsewhere will show as "Deleted User".</p>
      <button class="btn danger" id="delete-acc">Delete account</button>
    </div>`);
  $('#claim-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.rest('/api/upgrade', Object.fromEntries(new FormData(e.target)));
      toast('Account claimed! Welcome for real 💗');
      account(el, m);
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#username-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.req('account.username', { username: new FormData(e.target).get('username') }); toast('Username changed'); } catch (err) { toast(err.message, 'error'); }
  });
  $('#pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.req('account.password', Object.fromEntries(new FormData(e.target))); toast('Password updated'); e.target.reset(); } catch (err) { toast(err.message, 'error'); }
  });
  $('#delete-acc').onclick = async () => {
    const pw = me.isGuest ? (await confirmDialog({ title: 'Delete guest account?', message: 'Everything will be gone.', confirm: 'Delete', danger: true }) && '')
      : await confirmDialog({ title: 'Delete account?', message: 'Enter your password to confirm. This can\'t be undone.', confirm: 'Delete forever', danger: true, input: { type: 'password', placeholder: 'Password' } });
    if (pw === null || pw === false) return;
    try { await api.req('account.delete', { password: pw }); m.close(); api.setToken(null); location.reload(); } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
async function saveSettings(patch) {
  Object.assign(S.me.settings, patch);
  applyTheme();
  refresh();
  await api.req('me.update', { settings: patch });
}

function appearance(el) {
  const s = S.me.settings;
  setHtml(el, html`
    <h2>Appearance</h2>
    <div class="card-block">
      <h4>Theme</h4>
      <div class="theme-cards">${[['dark', '🌙 Dark'], ['light', '☀️ Light'], ['system', '💻 System']].map(([k, l]) => html`<button class="theme-card t-${k} ${s.theme === k ? 'sel' : ''}" data-theme="${k}"><span class="tc-preview"><i></i><i></i><i></i></span>${l}</button>`)}</div>
    </div>
    <div class="card-block">
      <h4>Accent color</h4>
      <p class="muted small">Pink by default — pick any shade you like.</p>
      <div class="row gap wrap">${ACCENTS.map((c) => html`<button class="accent-dot ${s.accent === c ? 'sel' : ''}" data-accent="${c}" style="background:${c}" title="${c}"></button>`)}<label class="field-inline">Custom <input type="color" id="accent-custom" value="${s.accent}"></label></div>
    </div>
    <div class="card-block">
      <h4>Text size</h4>
      <input type="range" min="0.85" max="1.3" step="0.05" value="${s.fontScale}" id="font-scale" class="grow"> <span id="font-scale-v">${Math.round(s.fontScale * 100)}%</span>
    </div>
    <div class="card-block">
      <label class="switch-row"><span><b>Reduce motion</b><small class="muted">Turn off animations and floating effects</small></span><input type="checkbox" class="switch" id="reduce-motion" ${s.reduceMotion ? 'checked' : ''}></label>
    </div>`);
  $$('[data-theme]', el).forEach((b) => b.onclick = async () => { await saveSettings({ theme: b.dataset.theme }); appearance(el); });
  $$('[data-accent]', el).forEach((b) => b.onclick = async () => { await saveSettings({ accent: b.dataset.accent }); appearance(el); });
  $('#accent-custom').onchange = (e) => saveSettings({ accent: e.target.value });
  $('#font-scale').oninput = (e) => { document.documentElement.style.setProperty('--font-scale', e.target.value); $('#font-scale-v').textContent = `${Math.round(e.target.value * 100)}%`; };
  $('#font-scale').onchange = (e) => saveSettings({ fontScale: Number(e.target.value) });
  $('#reduce-motion').onchange = (e) => saveSettings({ reduceMotion: e.target.checked });
}

function chats(el) {
  const s = S.me.settings;
  const LAY = [['bubbles', '💬 Bubbles', 'Messenger style — yours on the right'], ['classic', '📰 Classic', 'Avatars & names on the left'], ['compact', '📃 Compact', 'Dense, IRC-like lines'], ['cozy', '🧸 Cozy cards', 'Roomy cards with big avatars']];
  const bgCount = Object.keys(s.backgrounds || {}).length;
  setHtml(el, html`
    <h2>Layouts & backgrounds</h2>
    <p class="muted">Pick a different layout for each kind of chat. You can also switch from any chat header.</p>
    ${[['dm', 'Direct messages'], ['group', 'Group chats'], ['playroom', 'Playrooms']].map(([kind, label]) => html`
      <div class="card-block">
        <h4>${label}</h4>
        <div class="layout-cards">${LAY.map(([k, l, d]) => html`<button class="layout-card lc-${k} ${s.layouts[kind] === k ? 'sel' : ''}" data-kind="${kind}" data-layout="${k}"><span class="lc-preview"><i></i><i></i><i></i></span><b>${l}</b><small>${d}</small></button>`)}</div>
      </div>`)}
    <div class="card-block">
      <h4>Chat backgrounds</h4>
      <p class="muted small">Set a background from the 🖼️ button in any chat — per conversation, per Playroom or as a default. You have <b>${bgCount}</b> custom background${bgCount === 1 ? '' : 's'}.</p>
      <div class="swatch-grid small">${Object.entries(CHAT_BACKGROUNDS).filter(([k]) => k !== 'none').map(([k, p]) => html`<span class="swatch bg-swatch" style="background-image:${raw(p.css)};${raw(p.size ? `background-size:${p.size}` : '')}"><span>${p.label}</span></span>`)}</div>
      ${bgCount ? html`<button class="btn ghost" id="clear-bgs">Clear all custom backgrounds</button>` : ''}
    </div>`);
  $$('[data-layout]', el).forEach((b) => b.onclick = async () => {
    const layouts = { ...s.layouts, [b.dataset.kind]: b.dataset.layout };
    await saveSettings({ layouts });
    chats(el);
  });
  $('#clear-bgs')?.addEventListener('click', async () => {
    for (const key of Object.keys(s.backgrounds)) await api.req('me.update', { settings: { background: { key, value: null } } });
    s.backgrounds = {};
    renderBackground();
    chats(el);
  });
}

function privacy(el) {
  const s = S.me.settings;
  setHtml(el, html`
    <h2>Privacy & safety</h2>
    <div class="card-block">
      <h4>Who can DM you</h4>
      <div class="radio-list">${[['everyone', 'Everyone'], ['friends', 'Friends only'], ['none', 'No one']].map(([k, l]) => html`<label><input type="radio" name="dms" value="${k}" ${s.privacy.dmsFrom === k ? 'checked' : ''}> ${l}</label>`)}</div>
    </div>
    <div class="card-block">
      <h4>Friend requests</h4>
      <div class="radio-list">${[['everyone', 'Anyone can send me requests'], ['none', 'Nobody — I\'ll add people myself']].map(([k, l]) => html`<label><input type="radio" name="fr" value="${k}" ${s.privacy.friendRequests === k ? 'checked' : ''}> ${l}</label>`)}</div>
    </div>
    <div class="card-block">
      <h4>Blocked users</h4>
      <p class="muted small">You have ${S.me.blocked.length} blocked user${S.me.blocked.length === 1 ? '' : 's'}. Manage them in Friends → Blocked.</p>
    </div>`);
  el.querySelectorAll('input[name=dms]').forEach((i) => i.onchange = () => saveSettings({ privacy: { ...s.privacy, dmsFrom: i.value } }));
  el.querySelectorAll('input[name=fr]').forEach((i) => i.onchange = () => saveSettings({ privacy: { ...s.privacy, friendRequests: i.value } }));
}

function notifications(el) {
  const s = S.me.settings;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  setHtml(el, html`
    <h2>Notifications</h2>
    <div class="card-block"><label class="switch-row"><span><b>Sounds</b><small class="muted">A soft chime for mentions and DMs</small></span><input type="checkbox" class="switch" id="snd" ${s.sounds ? 'checked' : ''}></label></div>
    <div class="card-block"><label class="switch-row"><span><b>Desktop notifications</b><small class="muted">Status: ${perm}</small></span><button class="btn ghost small" id="desk" ${perm !== 'default' ? 'disabled' : ''}>${perm === 'granted' ? 'Enabled' : 'Enable'}</button></label></div>
    <p class="muted small">Tip: set your status to ⛔ Do not disturb to silence everything.</p>`);
  $('#snd').onchange = (e) => saveSettings({ sounds: e.target.checked });
  $('#desk').onclick = async () => { await Notification.requestPermission(); notifications(el); };
}

function about(el) {
  setHtml(el, html`
    <h2>About ${APP_NAME}</h2>
    <div class="card-block about">
      <div class="brand big"><span class="logo">✦</span> ${APP_NAME}</div>
      <p>A free, open communication & communities app. No Nitro, no boosts, no paywalls: every customization is available to everyone.</p>
      <ul>
        <li>🏰 Playrooms with categories, channels, roles & hierarchy</li>
        <li>🛡️ Toggleable Automoderator per Playroom</li>
        <li>🤖 AI Playroom assistant (${S.aiPoweredBy === 'claude' ? 'powered by Claude' : 'built-in engine'})</li>
        <li>🕹️ Public game bots for Playrooms, groups and DMs</li>
        <li>🎨 Banners, decorations, name effects, card themes</li>
        <li>💬 Four chat layouts + personal chat backgrounds</li>
      </ul>
      <p class="muted small">Keyboard: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> quick switcher · <kbd>↑</kbd> edit last message · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</p>
    </div>`);
}
