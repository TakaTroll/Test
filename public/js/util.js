// Shared helpers: safe HTML templating, markdown, time formatting, presets.

export const APP_NAME = 'Xperiences';

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(String(v));
}

// Tagged template that escapes every interpolation unless wrapped in raw()/html``.
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmt(vals[i]); });
  return new Raw(out);
}

export function setHtml(el, tpl) { el.innerHTML = tpl instanceof Raw ? tpl.s : fmt(tpl); return el; }

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ---------------------------------------------------------------------------
// Markdown-lite: **bold** *italic* __underline__ ~~strike~~ `code` ```block```
// ||spoiler|| > quote, # heading, links, @mentions, :shortcodes:
// ---------------------------------------------------------------------------
const SHORTCODES = {
  ':heart:': '❤️', ':pinkheart:': '💗', ':smile:': '😄', ':joy:': '😂', ':fire:': '🔥', ':star:': '⭐', ':sparkles:': '✨',
  ':thumbsup:': '👍', ':+1:': '👍', ':wave:': '👋', ':eyes:': '👀', ':skull:': '💀', ':sob:': '😭', ':100:': '💯',
  ':party:': '🥳', ':tada:': '🎉', ':cry:': '😢', ':thinking:': '🤔', ':cool:': '😎', ':game:': '🎮', ':rainbow:': '🌈',
  ':cat:': '🐱', ':dog:': '🐶', ':rocket:': '🚀', ':crown:': '👑', ':ok:': '👌', ':clap:': '👏', ':pray:': '🙏',
};

export function markdown(text, { me, users } = {}) {
  if (!text) return '';
  const blocks = [];
  let s = String(text).replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre class="code-block"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = esc(s);
  const inline = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { inline.push(`<code>${c}</code>`); return `\u0001${inline.length - 1}\u0001`; });
  s = s.replace(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g, (u) => { inline.push(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`); return `\u0001${inline.length - 1}\u0001`; });
  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" data-action="spoiler">$1</span>')
    .replace(/:[a-z0-9_+]+:/g, (m) => SHORTCODES[m] || m)
    .replace(/(^|[\s(])@([a-z0-9_.]{2,24}|everyone|here)\b/gi, (m, pre, name) => {
      const lower = name.toLowerCase();
      const isMe = me && (lower === me.username || lower === 'everyone' || lower === 'here');
      const known = users && Object.values(users).find((u) => u.username === lower);
      if (!known && lower !== 'everyone' && lower !== 'here') return m;
      return `${pre}<span class="mention${isMe ? ' me' : ''}" ${known ? `data-action="profile" data-id="${known.id}"` : ''}>@${known ? esc(known.displayName) : lower}</span>`;
    });
  s = s.split('\n').map((line) => {
    if (/^&gt; ?/.test(line)) return `<blockquote>${line.replace(/^&gt; ?/, '')}</blockquote>`;
    const h = line.match(/^(#{1,3}) (.+)/);
    if (h) return `<div class="md-h${h[1].length}">${h[2]}</div>`;
    return line;
  }).join('\n').replace(/<\/blockquote>\n<blockquote>/g, '<br>');
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => inline[i]);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
  return s;
}

export function isEmojiOnly(text) {
  const t = (text || '').trim();
  if (!t || t.length > 24) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
export function timeShort(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function timeLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today at ${timeShort(ts)}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday at ${timeShort(ts)}`;
  return `${d.toLocaleDateString()} ${timeShort(ts)}`;
}
export function dayLabel(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
export function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
export const GRADIENTS = {
  sunset: 'linear-gradient(135deg,#ff4fa3 0%,#ff8e53 100%)',
  bubblegum: 'linear-gradient(135deg,#ff9ad5 0%,#c779ff 100%)',
  aurora: 'linear-gradient(135deg,#43e97b 0%,#38f9d7 40%,#a66bff 100%)',
  midnight: 'linear-gradient(135deg,#232046 0%,#7b2ff7 60%,#ff4fa3 100%)',
  peach: 'linear-gradient(135deg,#ffd1dc 0%,#ffb88c 100%)',
  lagoon: 'linear-gradient(135deg,#00c6fb 0%,#005bea 100%)',
  galaxy: 'radial-gradient(circle at 20% 30%,#ff4fa3 0,transparent 35%),radial-gradient(circle at 80% 70%,#4dabf7 0,transparent 40%),linear-gradient(135deg,#120c1f,#2d1b4e)',
  candy: 'repeating-linear-gradient(45deg,#ff9ad5 0 18px,#ffd6ec 18px 36px)',
  cherry: 'linear-gradient(135deg,#ff0844 0%,#ffb199 100%)',
  mint: 'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)',
  noir: 'linear-gradient(135deg,#1b1622 0%,#3a2f45 100%)',
  holo: 'linear-gradient(120deg,#fbc2eb 0%,#a6c1ee 33%,#c2ffd8 66%,#fbc2eb 100%)',
};

export const CHAT_BACKGROUNDS = {
  none: { label: 'None', css: 'none' },
  hearts: { label: 'Hearts', css: 'radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--accent) 22%, transparent) 0 3px, transparent 4px), radial-gradient(circle at 75% 75%, color-mix(in srgb, var(--accent) 14%, transparent) 0 2px, transparent 3px)', size: '36px 36px' },
  dots: { label: 'Polka dots', css: 'radial-gradient(color-mix(in srgb, var(--text) 10%, transparent) 1.5px, transparent 2px)', size: '22px 22px' },
  grid: { label: 'Grid', css: 'linear-gradient(color-mix(in srgb, var(--text) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--text) 6%, transparent) 1px, transparent 1px)', size: '28px 28px' },
  waves: { label: 'Waves', css: 'repeating-radial-gradient(circle at 0 100%, transparent 0 18px, color-mix(in srgb, var(--accent) 10%, transparent) 19px 20px)', size: '60px 60px' },
  stripes: { label: 'Stripes', css: 'repeating-linear-gradient(-45deg, transparent 0 14px, color-mix(in srgb, var(--accent) 8%, transparent) 14px 28px)' },
  sakura: { label: 'Sakura glow', css: 'radial-gradient(ellipse at top left, color-mix(in srgb, #ff9ad5 35%, transparent), transparent 60%), radial-gradient(ellipse at bottom right, color-mix(in srgb, #c779ff 30%, transparent), transparent 60%)' },
  ocean: { label: 'Ocean glow', css: 'radial-gradient(ellipse at top, color-mix(in srgb, #4dabf7 30%, transparent), transparent 60%), radial-gradient(ellipse at bottom, color-mix(in srgb, #20c997 25%, transparent), transparent 60%)' },
  sunset: { label: 'Sunset', css: 'linear-gradient(180deg, color-mix(in srgb, #ff8e53 22%, transparent), color-mix(in srgb, #ff4fa3 22%, transparent))' },
  starry: { label: 'Starry', css: 'radial-gradient(1px 1px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 80px 10px, #ffd6ec, transparent), radial-gradient(1.5px 1.5px at 50px 70px, #fff, transparent), radial-gradient(1px 1px at 110px 90px, #c7b7ff, transparent), linear-gradient(180deg, #0f0b1d, #2a1840)', size: '130px 110px, 130px 110px, 130px 110px, 130px 110px, 100% 100%' },
};

export const ACCENTS = ['#ff4fa3', '#ff2e88', '#ff6fb5', '#e64980', '#f783ac', '#d63384', '#c2255c', '#ff8fab'];

export const EMOJI = {
  'Smileys': '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 🤔 🤭 🤫 🙄 😬 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 😷 🤒 🤠 😈 👻 💀 👽 🤖 🎃 😺 😸 😹 😻'.split(' '),
  'Hearts': '💗 💖 💕 💞 💓 💘 💝 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💟 ♥️ 🫶 💋'.split(' '),
  'Hands': '👍 👎 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 ✍️ 🫡'.split(' '),
  'Fun': '🎮 🕹️ 🎲 🎯 🎳 🏆 🥇 🎉 🎊 🎈 🎁 ✨ ⭐ 🌟 💫 🔥 💯 🌈 ☀️ 🌙 ⚡ 🍕 🍔 🍟 🍩 🍪 🧁 🍰 🍓 🍒 🍉 🧋 ☕ 🎵 🎶 🎧 🎤 🎨 📚 💻 📸 🚀 👑 💎 🌸 🌺 🌷 🦄 🐱 🐶 🐰 🦊 🐼 🐸'.split(' '),
};
export const QUICK_REACTIONS = ['💗', '😂', '👍', '🔥', '😭', '👀'];

export function initials(name) {
  const letters = String(name || '?').trim().split(/\s+/).map((w) => Array.from(w)[0]).filter((c) => /[\p{L}\p{N}]/u.test(c));
  return letters.slice(0, 2).join('').toUpperCase() || Array.from(String(name || '?').trim())[0] || '?';
}

export function bannerCss(banner, fallback = 'sunset') {
  if (!banner) return GRADIENTS[fallback];
  if (banner.type === 'image' && /^\/uploads\/[\w-]+\.\w+$/.test(banner.value)) return `center ${Number(banner.position) || 50}% / cover no-repeat url("${banner.value}")`;
  if (banner.type === 'color') return /^#[0-9a-f]{6}$/i.test(banner.value) ? banner.value : '#ff4fa3';
  return GRADIENTS[banner.value] || GRADIENTS[fallback];
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
