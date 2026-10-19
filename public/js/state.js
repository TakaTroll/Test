// Global client state and selectors.

export const S = {
  me: null,
  users: {},
  playrooms: {},
  conversations: {},
  permissions: {},
  aiPoweredBy: 'built-in',
  messages: {}, // channelId -> { list: [], hasMore, loaded }
  typing: {}, // channelId -> { userId: expiresAt }
  route: { view: 'home', sub: 'friends' },
  mentions: {}, // channelId -> count
  rightPanel: true,
  replyTo: null,
  editing: null,
  connected: false,
};

export const user = (id) => S.users[id] || { id, username: 'unknown', displayName: 'Unknown User', profile: { avatarColor: '#888' }, presence: 'offline' };

export function upsertUsers(list) {
  for (const u of list || []) if (u) S.users[u.id] = u;
}

export function memberName(pr, uid) {
  const m = pr?.members?.[uid];
  return (m && m.nickname) || user(uid).displayName;
}

export function memberRoles(pr, uid) {
  const m = pr?.members?.[uid];
  if (!m) return [];
  return m.roles.map((r) => pr.roles.find((x) => x.id === r)).filter(Boolean).sort((a, b) => b.position - a.position);
}

export function roleColor(pr, uid) {
  if (!pr) return '';
  const r = memberRoles(pr, uid).find((x) => x.color);
  return r ? r.color : '';
}

export function topPosition(pr, uid) {
  if (pr.ownerId === uid) return 1e9;
  return Math.max(0, ...memberRoles(pr, uid).map((r) => r.position));
}

export function can(pr, perm) {
  if (!pr) return false;
  return pr.ownerId === S.me.id || pr.myPermissions.includes('ADMINISTRATOR') || pr.myPermissions.includes(perm);
}

export function convName(cv) {
  if (!cv) return '';
  if (cv.type === 'dm') {
    const other = cv.members.find((id) => id !== S.me.id) || S.me.id;
    return user(other).displayName;
  }
  return cv.name || cv.members.filter((id) => id !== S.me.id).map((id) => user(id).displayName).slice(0, 4).join(', ') || 'Empty group';
}

export function dmPartner(cv) {
  return user(cv.members.find((id) => id !== S.me.id) || S.me.id);
}

export function channelInfo(channelId) {
  if (S.conversations[channelId]) return { kind: S.conversations[channelId].type, conv: S.conversations[channelId] };
  for (const pr of Object.values(S.playrooms)) {
    const ch = pr.channels.find((c) => c.id === channelId);
    if (ch) return { kind: 'playroom', pr, channel: ch };
  }
  return null;
}

export function isUnread(channelId, lastMessageAt) {
  if (!lastMessageAt) return false;
  return lastMessageAt > (S.me.settings.reads[channelId] || 0);
}

export function playroomUnread(pr) {
  return pr.channels.some((c) => isUnread(c.id, c.lastMessageAt));
}

export function playroomMentions(pr) {
  return pr.channels.reduce((n, c) => n + (S.mentions[c.id] || 0), 0);
}

export function layoutFor(kind) {
  const l = S.me.settings.layouts;
  return kind === 'playroom' ? l.playroom : kind === 'group' ? l.group : l.dm;
}

export function currentChannelId() {
  const r = S.route;
  if (r.view === 'playroom') return r.channelId;
  if (r.view === 'home' && r.convId) return r.convId;
  return null;
}
