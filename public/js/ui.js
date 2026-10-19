// Reusable UI pieces: avatars, names, modals, toasts, menus, emoji picker.
import { html, raw, esc, setHtml, $, initials, EMOJI } from './util.js';
import { S, user } from './state.js';

// ---------------------------------------------------------------------------
// Action dispatch: any element with data-action="name" calls actions[name].
// ---------------------------------------------------------------------------
export const actions = {};
export function registerActions(map) { Object.assign(actions, map); }

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    ev.preventDefault();
    ev.stopPropagation();
    Promise.resolve(fn(el, ev)).catch((err) => toast(err.message, 'error'));
  }
});
document.addEventListener('contextmenu', (ev) => {
  const el = ev.target.closest('[data-context]');
  if (!el) return;
  const fn = actions[el.dataset.context];
  if (fn) { ev.preventDefault(); fn(el, ev); }
});

// ---------------------------------------------------------------------------
// Avatars & names
// ---------------------------------------------------------------------------
export function avatar(u, size = 40, { status = false, deco = true } = {}) {
  if (typeof u === 'string') u = user(u);
  const p = u.profile || {};
  const inner = p.avatar
    ? html`<img src="${p.avatar}" alt="" loading="lazy">`
    : p.avatarEmoji
      ? html`<span class="av-emoji" style="font-size:${Math.round(size * 0.55)}px">${p.avatarEmoji}</span>`
      : html`<span class="av-initials" style="font-size:${Math.round(size * 0.38)}px">${initials(u.displayName)}</span>`;
  const decoClass = deco && p.decoration && p.decoration !== 'none' ? ` deco-${p.decoration}` : '';
  return html`<span class="avatar${decoClass}" style="--size:${size}px;--av-bg:${p.avatarColor || '#ff4fa3'};--t1:${(p.themeColors || [])[0] || '#ff4fa3'};--t2:${(p.themeColors || [])[1] || '#7b2ff7'}">
    <span class="av-inner">${inner}</span>
    ${status ? html`<span class="status-dot s-${u.presence || 'offline'}" title="${u.presence}"></span>` : ''}
  </span>`;
}

export function nameStyle(u, color) {
  const p = u.profile || {};
  const font = p.nameFont && p.nameFont !== 'default' ? ` font-${p.nameFont}` : '';
  const style = p.nameStyle || 'plain';
  const c1 = (p.themeColors || [])[0] || '#ff4fa3';
  const c2 = (p.themeColors || [])[1] || '#7b2ff7';
  const col = color || p.nameColor || '';
  return { cls: `uname ns-${style}${font}`, style: `--c1:${c1};--c2:${c2};${col ? `--ncol:${col};` : ''}` };
}

export function nameTag(u, { color = '', text = null, action = true } = {}) {
  if (typeof u === 'string') u = user(u);
  const ns = nameStyle(u, color);
  return html`<span class="${ns.cls}" style="${ns.style}" ${action ? raw(`data-action="profile" data-id="${esc(u.id)}"`) : ''}>${text ?? u.displayName}</span>${u.isBot ? html`<span class="tag-bot">BOT</span>` : ''}${u.isGuest ? html`<span class="tag-guest">GUEST</span>` : ''}`;
}

export function prIcon(pr, size = 44) {
  return html`<span class="pr-icon" style="--size:${size}px;--pr-accent:${pr.accentColor || '#ff4fa3'}">${pr.icon ? html`<img src="${pr.icon}" alt="">` : html`<span style="font-size:${Math.round(size * 0.5)}px">${pr.iconEmoji || initials(pr.name)}</span>`}</span>`;
}

export function convIcon(cv, size = 36) {
  if (cv.type === 'dm') {
    const other = cv.members.find((id) => id !== S.me.id) || S.me.id;
    return avatar(user(other), size, { status: true });
  }
  if (cv.icon) return html`<span class="avatar" style="--size:${size}px"><span class="av-inner"><img src="${cv.icon}" alt=""></span></span>`;
  return html`<span class="avatar group-av" style="--size:${size}px;--av-bg:var(--accent)"><span class="av-inner"><span class="av-emoji" style="font-size:${Math.round(size * 0.5)}px">${cv.iconEmoji || '💬'}</span></span></span>`;
}

export function statusLabel(p) {
  return { online: 'Online', idle: 'Away', dnd: 'Do not disturb', offline: 'Offline', invisible: 'Invisible' }[p] || p;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function toast(message, type = 'info', ms = 3800) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
const modalStack = [];

export function modal({ title = '', body, className = '', onClose, wide = false, full = false, footer = null }) {
  const overlay = document.createElement('div');
  overlay.className = `modal-overlay${full ? ' full' : ''}`;
  overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${full ? 'full' : ''} ${className}" role="dialog" aria-modal="true">
    ${title ? `<header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn modal-x" aria-label="Close">✕</button></header>` : '<button class="icon-btn modal-x floating" aria-label="Close">✕</button>'}
    <div class="modal-body"></div>
    ${footer ? '<footer class="modal-foot"></footer>' : ''}
  </div>`;
  const m = overlay.querySelector('.modal');
  const bodyEl = overlay.querySelector('.modal-body');
  const close = () => {
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 160);
    const i = modalStack.indexOf(api);
    if (i >= 0) modalStack.splice(i, 1);
    onClose?.();
  };
  const api = { el: m, body: bodyEl, close, overlay, foot: overlay.querySelector('.modal-foot') };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-x').addEventListener('click', close);
  document.body.append(overlay);
  modalStack.push(api);
  if (typeof body === 'function') body(bodyEl, api);
  else if (body) setHtml(bodyEl, body);
  if (footer) {
    if (typeof footer === 'function') footer(api.foot, api);
    else setHtml(api.foot, footer);
  }
  requestAnimationFrame(() => overlay.classList.add('in'));
  const first = m.querySelector('input:not([type=checkbox]):not([type=color]), textarea');
  if (first && !full) setTimeout(() => first.focus(), 40);
  return api;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (closeMenu()) return;
    const top = modalStack[modalStack.length - 1];
    if (top) top.close();
  }
});

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: html`<p class="muted">${message}</p>${input ? html`<input class="input" id="confirm-input" placeholder="${input.placeholder || ''}" type="${input.type || 'text'}" value="${input.value || ''}">` : ''}`,
      footer: html`<button class="btn ghost" data-x="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="ok">${confirm}</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const finish = (val) => { done = true; m.close(); resolve(val); };
    m.foot.querySelector('[data-x=cancel]').onclick = () => finish(null);
    m.foot.querySelector('[data-x=ok]').onclick = () => finish(input ? m.el.querySelector('#confirm-input').value : true);
    m.el.querySelector('#confirm-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(e.target.value); });
  });
}

export const promptDialog = (title, { placeholder = '', value = '', confirm = 'Save', message = '', type = 'text' } = {}) =>
  confirmDialog({ title, message, confirm, input: { placeholder, value, type } });

// ---------------------------------------------------------------------------
// Context menus / popovers
// ---------------------------------------------------------------------------
let openMenu = null;
export function closeMenu() {
  if (!openMenu) return false;
  openMenu.remove();
  openMenu = null;
  return true;
}
document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
window.addEventListener('resize', closeMenu);

function placeFloating(el, anchor, ev) {
  document.body.append(el);
  const r = el.getBoundingClientRect();
  let x, y;
  if (ev && ev.type === 'contextmenu') { x = ev.clientX; y = ev.clientY; } else {
    const a = anchor.getBoundingClientRect();
    x = a.left; y = a.bottom + 6;
    if (y + r.height > innerHeight - 8) y = a.top - r.height - 6;
  }
  x = Math.max(8, Math.min(x, innerWidth - r.width - 8));
  y = Math.max(8, Math.min(y, innerHeight - r.height - 8));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// items: [{label, icon, action:fn, danger, divider, hint}]
export function menu(anchor, items, ev) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  for (const it of items.filter(Boolean)) {
    if (it.divider) { el.append(Object.assign(document.createElement('hr'), {})); continue; }
    if (it.header) { const h = document.createElement('div'); h.className = 'menu-header'; h.textContent = it.header; el.append(h); continue; }
    const b = document.createElement('button');
    b.className = `menu-item${it.danger ? ' danger' : ''}${it.active ? ' active' : ''}`;
    b.innerHTML = `<span class="mi-icon">${esc(it.icon || '')}</span><span class="mi-label">${esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}`;
    b.onclick = (e) => { e.stopPropagation(); closeMenu(); Promise.resolve(it.action()).catch((err) => toast(err.message, 'error')); };
    el.append(b);
  }
  placeFloating(el, anchor, ev);
  openMenu = el;
  return el;
}

export function popover(anchor, render, { className = '' } = {}) {
  closeMenu();
  const el = document.createElement('div');
  el.className = `menu popover ${className}`;
  render(el);
  placeFloating(el, anchor);
  openMenu = el;
  return el;
}

export function emojiPicker(anchor, onPick) {
  return popover(anchor, (el) => {
    const cats = Object.keys(EMOJI);
    el.innerHTML = `<input class="input small emoji-search" placeholder="Search… (try a category)">
      <div class="emoji-tabs">${cats.map((c, i) => `<button class="${i ? '' : 'active'}" data-cat="${c}">${EMOJI[c][0]}</button>`).join('')}</div>
      <div class="emoji-grid"></div>`;
    const grid = el.querySelector('.emoji-grid');
    const show = (list) => { grid.innerHTML = list.map((e) => `<button class="emoji-btn">${e}</button>`).join(''); };
    show(EMOJI[cats[0]]);
    el.querySelectorAll('.emoji-tabs button').forEach((b) => b.onclick = () => {
      el.querySelectorAll('.emoji-tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      show(EMOJI[b.dataset.cat]);
    });
    el.querySelector('.emoji-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const cat = cats.find((c) => c.toLowerCase().startsWith(q));
      show(q ? (cat ? EMOJI[cat] : Object.values(EMOJI).flat()) : EMOJI[cats[0]]);
    };
    grid.onclick = (e) => {
      const b = e.target.closest('.emoji-btn');
      if (b) { onPick(b.textContent); if (!e.shiftKey) closeMenu(); }
    };
  }, { className: 'emoji-pop' });
}

// Simple tag/chip input
export function chipInput(container, values, { placeholder = 'Add…', max = 12, onChange } = {}) {
  const list = [...values];
  const render = () => {
    container.innerHTML = '';
    container.className = 'chip-input';
    for (const v of list) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.innerHTML = `${esc(v)} <button aria-label="Remove">✕</button>`;
      c.querySelector('button').onclick = () => { list.splice(list.indexOf(v), 1); render(); onChange?.(list); };
      container.append(c);
    }
    if (list.length < max) {
      const inp = document.createElement('input');
      inp.placeholder = placeholder;
      inp.onkeydown = (e) => {
        if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) {
          e.preventDefault();
          const v = inp.value.trim().replace(/,$/, '');
          if (!list.includes(v)) list.push(v);
          render(); onChange?.(list);
          container.querySelector('input')?.focus();
        } else if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); render(); onChange?.(list); container.querySelector('input')?.focus(); }
      };
      container.append(inp);
    }
  };
  render();
  return { get: () => [...list] };
}

let audioCtx;
export function ping() {
  if (!S.me?.settings.sounds) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.07, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.26);
  } catch { /* audio unavailable */ }
}
