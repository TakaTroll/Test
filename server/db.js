// Tiny JSON-file persistence layer. Everything lives in memory and is flushed
// to disk on a debounce, which is plenty for a self-hosted community app.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.XP_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_MESSAGES_PER_CHANNEL = 1000;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function emptyDb() {
  return {
    users: {},
    sessions: {},
    playrooms: {},
    conversations: {},
    messages: {},
  };
}

let db = emptyDb();
if (fs.existsSync(DB_FILE)) {
  try {
    db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } catch (err) {
    console.error('[db] Could not read database, starting fresh:', err.message);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 400);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

function messagesFor(channelId) {
  if (!db.messages[channelId]) db.messages[channelId] = [];
  return db.messages[channelId];
}

function pushMessage(msg) {
  const list = messagesFor(msg.channelId);
  list.push(msg);
  if (list.length > MAX_MESSAGES_PER_CHANNEL) list.splice(0, list.length - MAX_MESSAGES_PER_CHANNEL);
  save();
  return msg;
}

function findMessage(channelId, messageId) {
  return messagesFor(channelId).find((m) => m.id === messageId);
}

module.exports = {
  get data() { return db; },
  save,
  flush,
  id,
  messagesFor,
  pushMessage,
  findMessage,
  DATA_DIR,
  UPLOAD_DIR,
};
