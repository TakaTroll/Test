// AI assistant for Playroom creation.
// Works out of the box (and for free) with a built-in template engine. If the
// host sets ANTHROPIC_API_KEY, the assistant uses Claude for richer results
// and silently falls back to the built-in engine on any error.

const THEMES = [
  {
    key: 'gaming', words: ['game', 'gaming', 'gamer', 'esports', 'fps', 'mmo', 'rpg', 'valorant', 'fortnite', 'league', 'lol', 'apex', 'cod', 'overwatch', 'steam', 'console', 'pc', 'nintendo', 'xbox', 'playstation'],
    emoji: '🎮', color: '#ff4fa3', tags: ['gaming', 'lfg'],
    channels: [['🎮 Gaming', [['looking-for-group', 'text', 'Find teammates and squad up'], ['clips-and-highlights', 'text', 'Show off your best plays'], ['game-news', 'announcement', 'Patch notes and updates']]]],
    roles: [['Squad Leader', '#ffb02e'], ['Pro Player', '#4dabf7'], ['Casual', '#51cf66']],
    bots: ['bot_dicey', 'bot_tictac', 'bot_quizzy'],
  },
  {
    key: 'minecraft', words: ['minecraft', 'mc', 'survival', 'redstone', 'smp', 'block'],
    emoji: '⛏️', color: '#5cb85c', tags: ['minecraft', 'smp', 'building'],
    channels: [['⛏️ Server', [['server-status', 'announcement', 'IP, uptime and maintenance'], ['builds', 'text', 'Share your creations'], ['redstone-lab', 'text', 'Contraptions and farms'], ['trading-post', 'text', 'Buy, sell, swap']]]],
    roles: [['Builder', '#8bc34a'], ['Redstoner', '#e53935'], ['Explorer', '#29b6f6']],
    bots: ['bot_dicey', 'bot_scramble'],
  },
  {
    key: 'anime', words: ['anime', 'manga', 'otaku', 'weeb', 'cosplay', 'vtuber', 'webtoon'],
    emoji: '🌸', color: '#ff7eb6', tags: ['anime', 'manga', 'fandom'],
    channels: [['🌸 Anime', [['seasonal-anime', 'text', 'What are you watching this season?'], ['manga-corner', 'text', 'Chapters, spoilers in ||spoiler tags||'], ['fan-art', 'text', 'Share art (credit artists!)'], ['recommendations', 'text', 'Find your next favourite']]]],
    roles: [['Senpai', '#ff7eb6'], ['Artist', '#b197fc'], ['Cosplayer', '#ffd43b']],
    bots: ['bot_quizzy', 'bot_dicey'],
  },
  {
    key: 'art', words: ['art', 'artist', 'draw', 'drawing', 'paint', 'design', 'illustration', 'creative', 'photography', 'photo', '3d', 'animation'],
    emoji: '🎨', color: '#f783ac', tags: ['art', 'creative', 'feedback'],
    channels: [['🎨 Studio', [['showcase', 'text', 'Finished pieces'], ['wip-and-feedback', 'text', 'Works in progress — kind critique only'], ['resources', 'text', 'Brushes, tutorials, references'], ['art-prompts', 'announcement', 'Weekly challenge prompts']]]],
    roles: [['Featured Artist', '#f783ac'], ['Mentor', '#63e6be'], ['Commissions Open', '#ffd43b']],
    bots: ['bot_scramble'],
  },
  {
    key: 'music', words: ['music', 'band', 'producer', 'beats', 'song', 'singer', 'dj', 'rap', 'kpop', 'k-pop', 'rock', 'jazz', 'edm', 'concert'],
    emoji: '🎧', color: '#cc5de8', tags: ['music', 'producers', 'listening'],
    channels: [['🎧 Music', [['now-playing', 'text', 'What are you listening to?'], ['share-your-tracks', 'text', 'Your own productions'], ['gear-and-production', 'text', 'DAWs, plugins, instruments'], ['playlists', 'text', 'Curated vibes']]]],
    roles: [['Producer', '#cc5de8'], ['Vocalist', '#ff8787'], ['Listener', '#74c0fc']],
    bots: ['bot_quizzy', 'bot_dicey'],
  },
  {
    key: 'study', words: ['study', 'school', 'homework', 'exam', 'college', 'university', 'learn', 'learning', 'class', 'math', 'science', 'language', 'tutoring'],
    emoji: '📚', color: '#4dabf7', tags: ['study', 'education', 'productivity'],
    channels: [['📚 Study Hall', [['study-goals', 'text', 'Set today\'s goals and check in'], ['homework-help', 'text', 'Ask questions, show your work'], ['resources', 'text', 'Notes, videos, flashcards'], ['focus-room', 'text', 'Quiet co-working — minimal chatter']]]],
    roles: [['Tutor', '#4dabf7'], ['Study Buddy', '#69db7c'], ['Exam Season', '#ff922b']],
    bots: ['bot_quizzy', 'bot_scramble'],
  },
  {
    key: 'coding', words: ['code', 'coding', 'programming', 'developer', 'dev', 'javascript', 'python', 'software', 'hackathon', 'web', 'tech', 'ai', 'startup'],
    emoji: '💻', color: '#20c997', tags: ['coding', 'tech', 'developers'],
    channels: [['💻 Dev', [['help-desk', 'text', 'Ask coding questions — include your error!'], ['show-and-tell', 'text', 'Ship it and share it'], ['code-review', 'text', 'Get feedback on your code'], ['tech-news', 'announcement', 'Releases and news']]]],
    roles: [['Senior Dev', '#20c997'], ['Helper', '#4dabf7'], ['Learner', '#ffd43b']],
    bots: ['bot_quizzy', 'bot_dicey'],
  },
  {
    key: 'fitness', words: ['fitness', 'gym', 'workout', 'running', 'health', 'yoga', 'sport', 'sports', 'football', 'soccer', 'basketball', 'cycling'],
    emoji: '💪', color: '#ff6b6b', tags: ['fitness', 'health', 'sports'],
    channels: [['💪 Training', [['daily-check-in', 'text', 'Log today\'s workout'], ['progress-pics', 'text', 'Before / after — be kind'], ['nutrition', 'text', 'Meals, macros, recipes'], ['challenges', 'announcement', 'Monthly community challenges']]]],
    roles: [['Coach', '#ff6b6b'], ['Streak 30+', '#ffd43b'], ['Beginner', '#69db7c']],
    bots: ['bot_dicey'],
  },
  {
    key: 'books', words: ['book', 'books', 'reading', 'novel', 'writing', 'writer', 'poetry', 'fanfic', 'story', 'library'],
    emoji: '📖', color: '#e599f7', tags: ['books', 'writing', 'book-club'],
    channels: [['📖 Library', [['currently-reading', 'text', 'What\'s on your nightstand?'], ['book-club', 'text', 'This month\'s pick — spoilers in ||tags||'], ['writing-corner', 'text', 'Share your writing'], ['recommendations', 'text', 'Find your next read']]]],
    roles: [['Librarian', '#e599f7'], ['Author', '#ffa94d'], ['Bookworm', '#74c0fc']],
    bots: ['bot_scramble', 'bot_quizzy'],
  },
  {
    key: 'movies', words: ['movie', 'movies', 'film', 'cinema', 'tv', 'series', 'netflix', 'show', 'shows', 'marvel', 'star wars'],
    emoji: '🍿', color: '#ff922b', tags: ['movies', 'tv', 'watch-party'],
    channels: [['🍿 Cinema', [['watch-parties', 'announcement', 'Upcoming watch parties'], ['reviews', 'text', 'Rate and review'], ['theories-and-spoilers', 'text', 'Use ||spoiler tags||!'], ['what-to-watch', 'text', 'Recommendations']]]],
    roles: [['Critic', '#ff922b'], ['Host', '#ff4fa3'], ['Popcorn Crew', '#ffd43b']],
    bots: ['bot_quizzy', 'bot_dicey'],
  },
  {
    key: 'roleplay', words: ['roleplay', 'rp', 'dnd', 'd&d', 'dungeons', 'tabletop', 'fantasy', 'campaign', 'lore', 'worldbuilding'],
    emoji: '🐉', color: '#9775fa', tags: ['roleplay', 'tabletop', 'fantasy'],
    channels: [['📜 Out of Character', [['character-sheets', 'text', 'Post your characters'], ['session-planning', 'text', 'Scheduling and recaps']]], ['🐉 In Character', [['the-tavern', 'text', 'Stay in character!'], ['the-wilds', 'text', 'Adventure awaits']]]],
    roles: [['Game Master', '#9775fa'], ['Adventurer', '#51cf66'], ['Lore Keeper', '#ffd43b']],
    bots: ['bot_dicey', 'bot_hangry'],
  },
  {
    key: 'pets', words: ['pet', 'pets', 'cat', 'cats', 'dog', 'dogs', 'animal', 'animals', 'bird', 'reptile'],
    emoji: '🐾', color: '#ffa94d', tags: ['pets', 'animals', 'wholesome'],
    channels: [['🐾 Pets', [['pet-pics', 'text', 'Post your babies'], ['pet-advice', 'text', 'Care questions and tips'], ['adoption-corner', 'text', 'Rescues and adoptions']]]],
    roles: [['Cat Person', '#ffa94d'], ['Dog Person', '#74c0fc'], ['Vet / Expert', '#69db7c']],
    bots: ['bot_dicey'],
  },
  {
    key: 'cooking', words: ['food', 'cook', 'cooking', 'recipe', 'recipes', 'baking', 'chef', 'kitchen', 'vegan'],
    emoji: '🍳', color: '#fab005', tags: ['food', 'cooking', 'recipes'],
    channels: [['🍳 Kitchen', [['what-i-cooked', 'text', 'Show off your plate'], ['recipes', 'text', 'Share full recipes'], ['kitchen-help', 'text', 'Ask the community']]]],
    roles: [['Head Chef', '#fab005'], ['Baker', '#f783ac'], ['Taste Tester', '#69db7c']],
    bots: ['bot_scramble'],
  },
  {
    key: 'support', words: ['support', 'mental', 'wellbeing', 'wellness', 'safe space', 'vent', 'lgbt', 'lgbtq', 'queer', 'pride', 'self care'],
    emoji: '💗', color: '#ff8fab', tags: ['support', 'safe-space', 'wholesome'],
    channels: [['💗 Safe Space', [['check-ins', 'text', 'How are you today? 💗'], ['positivity', 'text', 'Wins, big or small'], ['resources', 'announcement', 'Helplines and resources']]]],
    roles: [['Listener', '#ff8fab'], ['Supporter', '#b197fc'], ['Peer Mentor', '#63e6be']],
    bots: [],
  },
];

const GENERIC = {
  key: 'hangout', emoji: '✨', color: '#ff4fa3', tags: ['community', 'hangout', 'friends'],
  channels: [['🎉 Hangout', [['memes', 'text', 'Only the finest'], ['media', 'text', 'Pics, videos, links'], ['bot-games', 'text', 'Play with the game bots']]]],
  roles: [['Regular', '#74c0fc'], ['Event Host', '#ffd43b']],
  bots: ['bot_dicey', 'bot_quizzy'],
};

const NAME_PARTS = {
  prefix: ['The', 'Cozy', 'Neon', 'Pixel', 'Velvet', 'Midnight', 'Sunny', 'Cosmic', 'Candy', 'Lucky'],
  suffix: ['Hub', 'Den', 'Lounge', 'Club', 'Corner', 'Collective', 'Nest', 'Hangout', 'Playroom', 'Society'],
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function detectThemes(prompt) {
  const p = ` ${prompt.toLowerCase()} `;
  const scored = THEMES.map((t) => ({ t, score: t.words.filter((w) => p.includes(w.length <= 3 ? ` ${w} ` : w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x) => x.t);
}

function extractName(prompt, theme) {
  const quoted = prompt.match(/["“'‘]([^"”'’]{2,40})["”'’]/);
  if (quoted) return quoted[1].trim();
  const called = prompt.match(/(?:called|named|name it)\s+([A-Z0-9][\w' -]{1,30})/i);
  if (called) return called[1].trim().replace(/[.,!]$/, '');
  const focus = theme ? cap(theme.key === 'hangout' ? 'Friends' : theme.key) : 'Good Vibes';
  return `${pick(NAME_PARTS.prefix)} ${focus} ${pick(NAME_PARTS.suffix)}`;
}

function templateBlueprint(prompt) {
  const themes = detectThemes(prompt);
  const main = themes[0] || GENERIC;
  const p = prompt.toLowerCase();
  const isPrivate = /private|friends only|small|invite only|close friends/.test(p);
  const kidFriendly = /kid|family|safe|wholesome|teen|school|clean/.test(p);
  const name = extractName(prompt, main);

  const categories = [
    { name: '📌 Start Here', channels: [
      { name: 'welcome', type: 'announcement', topic: `Welcome to ${name}! Read the rules and say hi 💗` },
      { name: 'rules', type: 'announcement', topic: 'Be kind. No spam. Have fun.' },
      { name: 'announcements', type: 'announcement', topic: 'Important news from the team' },
    ] },
    { name: '💬 Community', channels: [
      { name: 'general', type: 'text', topic: 'Chat about anything' },
      { name: 'introductions', type: 'text', topic: 'Tell us about yourself!' },
    ] },
  ];
  for (const t of themes.length ? themes : [GENERIC]) {
    for (const [cname, chans] of t.channels) {
      categories.push({ name: cname, channels: chans.map(([n, type, topic]) => ({ name: n, type, topic })) });
    }
  }
  const bots = [...new Set((themes.length ? themes : [GENERIC]).flatMap((t) => t.bots))];
  if (bots.length && !categories.some((c) => c.channels.some((ch) => ch.name === 'bot-games'))) {
    categories.push({ name: '🕹️ Arcade', channels: [{ name: 'bot-games', type: 'text', topic: 'Type !help to see the game bots' }] });
  }

  const roles = [
    { name: 'Admin', color: '#ff2e88', hoist: true, permissions: ['ADMINISTRATOR'] },
    { name: 'Moderator', color: '#b197fc', hoist: true, permissions: ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'TIMEOUT_MEMBERS', 'VIEW_MOD_LOG', 'MANAGE_AUTOMOD', 'MENTION_EVERYONE'] },
    ...main.roles.map(([n, c]) => ({ name: n, color: c, hoist: false, permissions: [] })),
  ];

  const descriptor = themes.length ? themes.map((t) => t.key).join(' & ') : 'friends and good vibes';
  const description = `${isPrivate ? 'A cozy, invite-only' : 'A welcoming'} Playroom for ${descriptor}. ${prompt.length > 12 ? cap(prompt.trim().replace(/\.$/, '')) + '.' : ''}`.trim();

  return {
    name,
    description: description.slice(0, 300),
    iconEmoji: main.emoji,
    accentColor: main.color,
    tags: [...new Set([...(themes.length ? themes : [GENERIC]).flatMap((t) => t.tags), ...(kidFriendly ? ['family-friendly'] : [])])].slice(0, 6),
    isPublic: !isPrivate,
    welcomeMessage: `Hey {user}, welcome to **${name}**! ${main.emoji} Check out #rules and introduce yourself in #introductions.`,
    categories,
    roles,
    bots,
    automod: { enabled: true, strict: kidFriendly },
    source: 'template',
  };
}

const SYSTEM = `You design community spaces ("Playrooms") for the Xperiences chat app.
Return ONLY a JSON object, no markdown fences, with this exact shape:
{"name": string (<=40 chars), "description": string (<=300 chars), "iconEmoji": single emoji,
 "accentColor": hex color, "tags": string[] (<=6, lowercase, hyphenated),
 "isPublic": boolean, "welcomeMessage": string (may include {user}),
 "categories": [{"name": string (may start with an emoji), "channels": [{"name": lowercase-hyphenated string, "type": "text"|"announcement", "topic": string}]}],
 "roles": [{"name": string, "color": hex, "hoist": boolean, "permissions": string[]}],
 "bots": string[], "automod": {"enabled": boolean, "strict": boolean}}
Roles are ordered highest first. Allowed permissions: ADMINISTRATOR, MANAGE_PLAYROOM, MANAGE_ROLES, MANAGE_CHANNELS,
MANAGE_MESSAGES, MANAGE_BOTS, MANAGE_AUTOMOD, KICK_MEMBERS, BAN_MEMBERS, TIMEOUT_MEMBERS, VIEW_MOD_LOG, MENTION_EVERYONE.
Allowed bots: bot_dicey (dice/8ball), bot_quizzy (trivia), bot_hangry (hangman), bot_tictac (tic-tac-toe), bot_rps (rock paper scissors), bot_scramble (word scramble).
Use 3-6 categories with 2-5 channels each. Always include a welcome/rules area and a general chat.`;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic();
  }
  return client;
}

function sanitize(bp, prompt) {
  const fallback = templateBlueprint(prompt);
  const str = (v, d, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
  const allowedBots = ['bot_dicey', 'bot_quizzy', 'bot_hangry', 'bot_tictac', 'bot_rps', 'bot_scramble'];
  const allowedPerms = require('./permissions').PERMISSIONS;
  const categories = (Array.isArray(bp.categories) ? bp.categories : []).slice(0, 8).map((c) => ({
    name: str(c.name, 'Channels', 40),
    channels: (Array.isArray(c.channels) ? c.channels : []).slice(0, 8).map((ch) => ({
      name: str(ch.name, 'chat', 30).toLowerCase().replace(/[^\w-]+/g, '-'),
      type: ch.type === 'announcement' ? 'announcement' : 'text',
      topic: str(ch.topic, '', 120),
    })),
  })).filter((c) => c.channels.length);
  return {
    name: str(bp.name, fallback.name, 40),
    description: str(bp.description, fallback.description, 300),
    iconEmoji: str(bp.iconEmoji, fallback.iconEmoji, 8),
    accentColor: hex(bp.accentColor, fallback.accentColor),
    tags: (Array.isArray(bp.tags) ? bp.tags : fallback.tags).map((t) => String(t).toLowerCase().slice(0, 24)).slice(0, 6),
    isPublic: bp.isPublic !== false,
    welcomeMessage: str(bp.welcomeMessage, fallback.welcomeMessage, 300),
    categories: categories.length ? categories : fallback.categories,
    roles: (Array.isArray(bp.roles) ? bp.roles : fallback.roles).slice(0, 10).map((r) => ({
      name: str(r.name, 'Member', 32),
      color: hex(r.color, '#99a1b3'),
      hoist: !!r.hoist,
      permissions: (Array.isArray(r.permissions) ? r.permissions : []).filter((p) => allowedPerms[p]),
    })),
    bots: (Array.isArray(bp.bots) ? bp.bots : []).filter((b) => allowedBots.includes(b)),
    automod: { enabled: bp.automod?.enabled !== false, strict: !!bp.automod?.strict },
    source: 'claude',
  };
}

async function generatePlayroom(prompt) {
  prompt = String(prompt || '').slice(0, 1000);
  const c = getClient();
  if (!c) return templateBlueprint(prompt);
  try {
    const response = await c.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Design a Playroom for: ${prompt}` }],
    });
    if (response.stop_reason === 'refusal') return templateBlueprint(prompt);
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return sanitize(JSON.parse(json), prompt);
  } catch (err) {
    console.warn('[ai] Claude unavailable, using template engine:', err.message);
    return templateBlueprint(prompt);
  }
}

module.exports = { generatePlayroom, templateBlueprint };
