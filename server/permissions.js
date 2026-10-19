// Playroom roles, permissions and hierarchy.
// Roles are ordered by `position`: higher number = higher in the hierarchy.
// The @everyone role always has id === playroom.id and position 0.

const PERMISSIONS = {
  ADMINISTRATOR: 'Administrator — bypasses every permission check',
  MANAGE_PLAYROOM: 'Edit the Playroom name, icon, banner, look and discovery settings',
  MANAGE_ROLES: 'Create, edit and reorder roles below their own top role',
  MANAGE_CHANNELS: 'Create, edit, reorder and delete channels and categories',
  MANAGE_MESSAGES: 'Delete and pin other people\'s messages',
  MANAGE_BOTS: 'Add or remove game bots',
  MANAGE_AUTOMOD: 'Configure the Automoderator',
  KICK_MEMBERS: 'Kick members below their own top role',
  BAN_MEMBERS: 'Ban members below their own top role',
  TIMEOUT_MEMBERS: 'Temporarily mute members below their own top role',
  VIEW_MOD_LOG: 'View the moderation log',
  CREATE_INVITE: 'Create invite codes',
  SEND_MESSAGES: 'Send messages in text channels',
  ATTACH_FILES: 'Upload images and files',
  ADD_REACTIONS: 'React to messages',
  MENTION_EVERYONE: 'Use @everyone',
  CHANGE_NICKNAME: 'Change their own nickname',
};

const DEFAULT_EVERYONE = ['SEND_MESSAGES', 'ATTACH_FILES', 'ADD_REACTIONS', 'CREATE_INVITE', 'CHANGE_NICKNAME'];

function getRole(pr, roleId) {
  return pr.roles.find((r) => r.id === roleId);
}

function memberRoles(pr, userId) {
  const m = pr.members[userId];
  if (!m) return [];
  const roles = [getRole(pr, pr.id)];
  for (const rid of m.roles) {
    const r = getRole(pr, rid);
    if (r) roles.push(r);
  }
  return roles.filter(Boolean);
}

function topPosition(pr, userId) {
  if (pr.ownerId === userId) return Infinity;
  return Math.max(0, ...memberRoles(pr, userId).map((r) => r.position));
}

function has(pr, userId, perm) {
  if (!pr.members[userId]) return false;
  if (pr.ownerId === userId) return true;
  const roles = memberRoles(pr, userId);
  if (roles.some((r) => r.permissions.includes('ADMINISTRATOR'))) return true;
  return roles.some((r) => r.permissions.includes(perm));
}

function isAdmin(pr, userId) {
  return pr.ownerId === userId || memberRoles(pr, userId).some((r) => r.permissions.includes('ADMINISTRATOR'));
}

// Can `actorId` act on `targetId` (kick/ban/timeout/assign roles)?
function outranks(pr, actorId, targetId) {
  if (actorId === targetId) return false;
  if (targetId === pr.ownerId) return false;
  return topPosition(pr, actorId) > topPosition(pr, targetId);
}

function canManageRole(pr, actorId, role) {
  if (!has(pr, actorId, 'MANAGE_ROLES')) return false;
  return topPosition(pr, actorId) > role.position;
}

function canViewChannel(pr, userId, channel) {
  if (!pr.members[userId]) return false;
  if (!channel.viewRoles || channel.viewRoles.length === 0) return true;
  if (isAdmin(pr, userId) || has(pr, userId, 'MANAGE_CHANNELS')) return true;
  const mine = pr.members[userId].roles;
  return channel.viewRoles.some((r) => mine.includes(r));
}

function canSendInChannel(pr, userId, channel) {
  if (!canViewChannel(pr, userId, channel)) return false;
  if (isAdmin(pr, userId)) return true;
  const m = pr.members[userId];
  if (m.timeoutUntil && m.timeoutUntil > Date.now()) return false;
  if (channel.type === 'announcement' && !has(pr, userId, 'MANAGE_CHANNELS')) {
    return (channel.writeRoles || []).some((r) => m.roles.includes(r));
  }
  if (channel.writeRoles && channel.writeRoles.length && channel.type !== 'announcement') {
    if (!channel.writeRoles.some((r) => m.roles.includes(r))) return false;
  }
  return has(pr, userId, 'SEND_MESSAGES');
}

function memberPermissions(pr, userId) {
  if (isAdmin(pr, userId)) return Object.keys(PERMISSIONS);
  const set = new Set();
  for (const r of memberRoles(pr, userId)) r.permissions.forEach((p) => set.add(p));
  return [...set];
}

module.exports = {
  PERMISSIONS,
  DEFAULT_EVERYONE,
  getRole,
  memberRoles,
  topPosition,
  has,
  isAdmin,
  outranks,
  canManageRole,
  canViewChannel,
  canSendInChannel,
  memberPermissions,
};
