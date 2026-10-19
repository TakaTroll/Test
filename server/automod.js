// Automoderator: per-Playroom, fully toggleable rules evaluated before a
// message is stored. Returns null when the message is fine, otherwise a
// { rule, reason } verdict.
const perms = require('./permissions');

function defaultAutomod() {
  return {
    enabled: false,
    action: 'block', // 'block' | 'block_timeout'
    timeoutMinutes: 5,
    exemptRoles: [],
    exemptAdmins: true,
    rules: {
      bannedWords: { enabled: true, words: [] },
      invites: { enabled: true },
      links: { enabled: false, allow: [] },
      mentions: { enabled: true, max: 5 },
      caps: { enabled: false, percent: 70, minLength: 12 },
      spam: { enabled: true, max: 6, seconds: 6 },
      duplicates: { enabled: true, max: 3 },
      zalgo: { enabled: true },
    },
  };
}

const recent = new Map(); // `${prId}:${userId}` -> [{t, content}]

const INVITE_RE = /(discord\.gg|discord(app)?\.com\/invite|xperiences\.app\/invite|xp\.gg)\/[\w-]+/i;
const LINK_RE = /https?:\/\/([^\s/]+)/gi;
const ZALGO_RE = /[̀-ͯ҉]{4,}/;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function wordMatches(content, word) {
  word = word.trim();
  if (!word) return false;
  if (word.includes('*')) {
    const re = new RegExp(word.split('*').map(escapeRe).join('\\w*'), 'i');
    return re.test(content);
  }
  return new RegExp(`(^|\\W)${escapeRe(word)}($|\\W)`, 'i').test(content);
}

function check(pr, userId, content) {
  const am = pr.automod;
  if (!am || !am.enabled) return null;
  if (am.exemptAdmins && (perms.isAdmin(pr, userId) || perms.has(pr, userId, 'MANAGE_MESSAGES'))) return null;
  const member = pr.members[userId];
  if (member && am.exemptRoles.some((r) => member.roles.includes(r))) return null;
  const r = am.rules;
  const text = content || '';

  if (r.bannedWords.enabled) {
    const hit = r.bannedWords.words.find((w) => wordMatches(text, w));
    if (hit) return { rule: 'bannedWords', reason: 'Message contains a blocked word or phrase.' };
  }
  if (r.invites.enabled && INVITE_RE.test(text)) {
    return { rule: 'invites', reason: 'Invite links to other communities aren\'t allowed here.' };
  }
  if (r.links.enabled) {
    const allow = (r.links.allow || []).map((d) => d.toLowerCase().trim()).filter(Boolean);
    for (const m of text.matchAll(LINK_RE)) {
      const host = m[1].toLowerCase();
      if (!allow.some((d) => host === d || host.endsWith('.' + d))) {
        return { rule: 'links', reason: 'Links aren\'t allowed in this Playroom.' };
      }
    }
  }
  if (r.mentions.enabled) {
    const count = (text.match(/@[\w.-]+/g) || []).length;
    if (count > r.mentions.max) return { rule: 'mentions', reason: `Too many mentions (max ${r.mentions.max}).` };
  }
  if (r.caps.enabled) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= r.caps.minLength) {
      const upper = letters.replace(/[^A-Z]/g, '').length;
      if ((upper / letters.length) * 100 >= r.caps.percent) {
        return { rule: 'caps', reason: 'Please don\'t shout — too many capital letters.' };
      }
    }
  }
  if (r.zalgo.enabled && ZALGO_RE.test(text)) {
    return { rule: 'zalgo', reason: 'Glitch / zalgo text isn\'t allowed.' };
  }

  const key = `${pr.id}:${userId}`;
  const now = Date.now();
  const hist = (recent.get(key) || []).filter((h) => now - h.t < 60000);
  if (r.spam.enabled) {
    const windowed = hist.filter((h) => now - h.t < r.spam.seconds * 1000);
    if (windowed.length >= r.spam.max) {
      return { rule: 'spam', reason: 'You\'re sending messages too quickly.' };
    }
  }
  if (r.duplicates.enabled && text.length > 0) {
    const dupes = hist.filter((h) => h.content === text).length;
    if (dupes >= r.duplicates.max) return { rule: 'duplicates', reason: 'Repeated message detected.' };
  }
  hist.push({ t: now, content: text });
  recent.set(key, hist.slice(-30));
  return null;
}

module.exports = { defaultAutomod, check };
