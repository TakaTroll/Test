// Profile cards (view) — the editor lives in settings.js.
import { html, raw, setHtml, esc, bannerCss, markdown, ago } from './util.js';
import * as api from './api.js';
import { S, user, upsertUsers } from './state.js';
import { avatar, nameStyle, modal, toast, statusLabel, registerActions } from './ui.js';
import { navigate } from './app.js';

export function badgesFor(u) {
  const b = [];
  if (u.isBot) b.push(['🤖', 'Game Bot']);
  if (u.isGuest) b.push(['👻', 'Guest']);
  if (!u.isGuest && !u.isBot) b.push(['💗', 'Xperiencer']);
  if (Date.now() - u.createdAt < 7 * 86400000 && !u.isBot) b.push(['🌱', 'New here']);
  if (u.profile.decoration && u.profile.decoration !== 'none') b.push(['✨', 'Styled']);
  if ((u.profile.links || []).length >= 3) b.push(['🔗', 'Connected']);
  return b;
}

export function profileCardHtml(u, { compact = false, extra = null } = {}) {
  const p = u.profile || {};
  const ns = nameStyle(u);
  const t1 = (p.themeColors || [])[0] || '#ff4fa3';
  const t2 = (p.themeColors || [])[1] || '#7b2ff7';
  return html`<div class="profile-card ${compact ? 'compact' : ''} fx-${p.cardEffect || 'none'}" style="--t1:${t1};--t2:${t2}">
    <div class="pc-banner" style="background:${raw(bannerCss(p.banner))}"></div>
    <div class="pc-avatar">${avatar(u, compact ? 76 : 96, { status: true })}</div>
    <div class="pc-badges">${badgesFor(u).map(([i, t]) => html`<span title="${t}">${i}</span>`)}</div>
    <div class="pc-inner">
      <div class="pc-names">
        <h2 class="${ns.cls}" style="${ns.style}">${u.displayName}</h2>
        <div class="pc-sub">@${u.username}${p.pronouns ? html` · ${p.pronouns}` : ''}${u.isBot ? html` <span class="tag-bot">BOT</span>` : ''}</div>
      </div>
      ${p.customStatus || p.statusEmoji ? html`<div class="pc-status">${p.statusEmoji} ${p.customStatus}</div>` : ''}
      ${p.nowPlaying ? html`<div class="pc-section"><h4>Now playing</h4><div class="pc-playing">🎮 ${p.nowPlaying}</div></div>` : ''}
      ${p.bio ? html`<div class="pc-section"><h4>About me</h4><div class="pc-bio">${raw(markdown(p.bio))}</div></div>` : ''}
      ${p.mood || p.location || p.birthday ? html`<div class="pc-facts">${p.mood ? html`<span>💭 ${p.mood}</span>` : ''}${p.location ? html`<span>📍 ${p.location}</span>` : ''}${p.birthday ? html`<span>🎂 ${p.birthday}</span>` : ''}</div>` : ''}
      ${p.interests?.length ? html`<div class="pc-section"><h4>Interests</h4><div class="pc-chips">${p.interests.map((i) => html`<span>${i}</span>`)}</div></div>` : ''}
      ${!compact && p.favoriteGames?.length ? html`<div class="pc-section"><h4>Favorite games</h4><div class="pc-chips games">${p.favoriteGames.map((i) => html`<span>🎮 ${i}</span>`)}</div></div>` : ''}
      ${!compact && p.showcase?.length ? html`<div class="pc-section"><h4>Showcase</h4><div class="pc-showcase">${p.showcase.map((i) => html`<span>${i}</span>`)}</div></div>` : ''}
      ${p.links?.length ? html`<div class="pc-section"><h4>Links</h4><div class="pc-links">${p.links.map((l) => html`<a href="${l.url}" target="_blank" rel="noopener noreferrer">🔗 ${l.label}</a>`)}</div></div>` : ''}
      ${u.isBot && u.bot ? html`<div class="pc-section"><h4>Commands</h4><ul class="bot-cmds">${u.bot.commands.map(([c, d]) => html`<li><code>${c}</code><span>${d}</span></li>`)}</ul></div>` : ''}
      <div class="pc-section"><h4>Member since</h4><div class="muted small">${new Date(u.createdAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })} · ${statusLabel(u.presence)}</div></div>
      ${extra || ''}
    </div>
  </div>`;
}

export async function openProfile(userId) {
  let data;
  try { data = await api.req('user.get', { userId }); } catch (err) { return toast(err.message, 'error'); }
  const u = data.user;
  upsertUsers([u]);
  const isMe = u.id === S.me.id;
  const friend = S.me.friends.includes(u.id);
  const pendingOut = S.me.outgoing.includes(u.id);
  const pendingIn = S.me.incoming.includes(u.id);
  const blocked = S.me.blocked.includes(u.id);
  const mutual = html`${data.mutualPlayrooms.length && !isMe ? html`<div class="pc-section"><h4>Mutual Playrooms — ${data.mutualPlayrooms.length}</h4><div class="pc-chips">${data.mutualPlayrooms.map((p) => html`<a href="#/p/${p.id}" class="chip-link">${p.iconEmoji} ${p.name}</a>`)}</div></div>` : ''}
    ${data.mutualFriends.length && !isMe ? html`<div class="pc-section"><h4>Mutual friends — ${data.mutualFriends.length}</h4><div class="mutual-avs">${data.mutualFriends.slice(0, 8).map((id) => html`<span data-action="profile" data-id="${id}" title="${user(id).displayName}">${avatar(user(id), 28, { deco: false })}</span>`)}</div></div>` : ''}`;
  const m = modal({
    className: 'profile-modal',
    body: html`${profileCardHtml(u, { extra: mutual })}
      <div class="pc-actions">
        ${isMe ? html`<button class="btn primary" data-action="edit-profile">🎨 Edit profile</button>` : ''}
        ${!isMe && !u.deleted ? html`<button class="btn primary" data-action="pc-dm" data-id="${u.id}">💬 Message</button>` : ''}
        ${!isMe && !u.isBot && !u.deleted && !S.me.isGuest ? (friend ? html`<button class="btn ghost" data-action="remove-friend" data-id="${u.id}">💔 Unfriend</button>`
          : pendingIn ? html`<button class="btn ghost" data-action="accept-friend" data-id="${u.id}">✅ Accept request</button>`
          : pendingOut ? html`<button class="btn ghost" disabled>⏳ Request sent</button>`
          : html`<button class="btn ghost" data-action="pc-add" data-id="${u.username}">➕ Add friend</button>`) : ''}
        ${!isMe && !u.isBot && !u.deleted ? html`<button class="btn ghost" data-action="pc-block" data-id="${u.id}" data-block="${blocked ? '0' : '1'}">${blocked ? 'Unblock' : '🚫 Block'}</button>` : ''}
      </div>`,
  });
  m.el.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"], [data-action=pc-dm], [data-action=edit-profile]')) setTimeout(m.close, 0); });
}

registerActions({
  'pc-dm': async (el) => { const cv = await api.req('dm.open', { userId: el.dataset.id }); S.conversations[cv.id] = cv; navigate(`#/home/${cv.id}`); },
  'pc-add': async (el) => { await api.req('friends.request', { username: el.dataset.id }); toast('Friend request sent 💌'); },
  'pc-block': async (el) => { await api.req('user.block', { userId: el.dataset.id, block: el.dataset.block === '1' }); toast(el.dataset.block === '1' ? 'User blocked' : 'User unblocked'); },
  'edit-profile': () => import('./settings.js').then((s) => s.openSettings('profile')),
});
