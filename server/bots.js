// Publicly available game bots. Every bot is a real user account (isBot) that
// can be added to any Playroom or group chat. Bots react to "!" commands and
// keep per-channel game state in memory.

const BOTS = [
  {
    id: 'bot_dicey',
    username: 'dicey',
    displayName: 'Dicey',
    emoji: '🎲',
    color: '#ff5fa2',
    tagline: 'Dice, coins, 8-ball and tiny luck games.',
    commands: [
      ['!roll [NdM]', 'Roll dice, e.g. !roll 2d20'],
      ['!flip', 'Flip a coin'],
      ['!8ball <question>', 'Ask the magic 8-ball'],
      ['!choose a | b | c', 'Pick one option for you'],
      ['!slots', 'Spin the (free, pointless) slot machine'],
    ],
  },
  {
    id: 'bot_quizzy',
    username: 'quizzy',
    displayName: 'Quizzy',
    emoji: '🧠',
    color: '#a66bff',
    tagline: 'Trivia rounds with a live scoreboard.',
    commands: [
      ['!trivia', 'Start a trivia question'],
      ['!answer <1-4>', 'Answer the current question (or just type 1-4)'],
      ['!scores', 'Show the channel scoreboard'],
    ],
  },
  {
    id: 'bot_hangry',
    username: 'hangry',
    displayName: 'Hangry',
    emoji: '🪢',
    color: '#ffb02e',
    tagline: 'Co-op hangman for the whole chat.',
    commands: [
      ['!hangman', 'Start a new game'],
      ['!guess <letter|word>', 'Guess a letter or the whole word'],
    ],
  },
  {
    id: 'bot_tictac',
    username: 'tictac',
    displayName: 'TicTac',
    emoji: '⭕',
    color: '#2ec4b6',
    tagline: 'Challenge a friend to tic-tac-toe.',
    commands: [
      ['!ttt @user', 'Challenge someone'],
      ['!place <1-9>', 'Place your mark'],
      ['!ttt stop', 'End the current game'],
    ],
  },
  {
    id: 'bot_rps',
    username: 'rpsbot',
    displayName: 'Rock Paper Bot',
    emoji: '✂️',
    color: '#4dabf7',
    tagline: 'Rock, paper, scissors — against the bot.',
    commands: [['!rps <rock|paper|scissors>', 'Play a round'], ['!rps stats', 'Your record']],
  },
  {
    id: 'bot_scramble',
    username: 'scramble',
    displayName: 'Scramble',
    emoji: '🔤',
    color: '#51cf66',
    tagline: 'Unscramble the word first to win.',
    commands: [['!scramble', 'Start a round, then just type your answer'], ['!giveup', 'Reveal the answer']],
  },
];

const TRIVIA = [
  ['What is the largest planet in our solar system?', ['Saturn', 'Jupiter', 'Neptune', 'Earth'], 1],
  ['Which element has the chemical symbol "O"?', ['Gold', 'Osmium', 'Oxygen', 'Oganesson'], 2],
  ['How many sides does a hexagon have?', ['5', '6', '7', '8'], 1],
  ['Which ocean is the largest?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
  ['What year did the first Moon landing happen?', ['1965', '1969', '1972', '1959'], 1],
  ['Which animal is known as the "King of the Jungle"?', ['Tiger', 'Elephant', 'Lion', 'Gorilla'], 2],
  ['What is the hardest natural substance?', ['Diamond', 'Quartz', 'Iron', 'Granite'], 0],
  ['How many continents are there?', ['5', '6', '7', '8'], 2],
  ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Mercury', 'Jupiter'], 1],
  ['What is the capital of Japan?', ['Osaka', 'Kyoto', 'Tokyo', 'Seoul'], 2],
  ['Which instrument has 88 keys?', ['Organ', 'Piano', 'Accordion', 'Harp'], 1],
  ['What gas do plants absorb from the air?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], 2],
  ['In which game do you "build, mine and craft" with blocks?', ['Fortnite', 'Minecraft', 'Tetris', 'Roblox'], 1],
  ['How many players are on a soccer team on the field?', ['9', '10', '11', '12'], 2],
  ['What is the fastest land animal?', ['Cheetah', 'Horse', 'Lion', 'Gazelle'], 0],
  ['Which language has the most native speakers?', ['English', 'Spanish', 'Hindi', 'Mandarin Chinese'], 3],
  ['What does "CPU" stand for?', ['Central Processing Unit', 'Computer Power Unit', 'Core Program Utility', 'Central Pixel Unit'], 0],
  ['Which famous plumber wears a red cap?', ['Luigi', 'Wario', 'Mario', 'Toad'], 2],
  ['What is frozen water called?', ['Steam', 'Ice', 'Dew', 'Fog'], 1],
  ['How many minutes are in a full day?', ['1,440', '1,200', '2,400', '960'], 0],
  ['Which color do you get mixing blue and yellow?', ['Purple', 'Orange', 'Green', 'Brown'], 2],
  ['Who painted the Mona Lisa?', ['Van Gogh', 'Leonardo da Vinci', 'Picasso', 'Michelangelo'], 1],
];

const WORDS = ['playroom', 'galaxy', 'pixel', 'rainbow', 'keyboard', 'dragon', 'castle', 'puzzle', 'banana',
  'volcano', 'penguin', 'unicorn', 'quest', 'arcade', 'sparkle', 'thunder', 'cookie', 'blossom', 'meteor',
  'treasure', 'wizard', 'joystick', 'avocado', 'lantern', 'harmony', 'kitten', 'jungle', 'rocket'];

const EIGHT_BALL = ['It is certain. ✨', 'Without a doubt.', 'Yes — definitely.', 'You may rely on it.',
  'Most likely.', 'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
  'Better not tell you now.', 'Cannot predict now.', 'Don\'t count on it.', 'My reply is no.',
  'Outlook not so good.', 'Very doubtful.'];

const state = { trivia: new Map(), scores: new Map(), hangman: new Map(), ttt: new Map(), rps: new Map(), scramble: new Map() };

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

function shuffleWord(w) {
  let s = w;
  for (let i = 0; i < 10 && s === w; i++) s = w.split('').sort(() => Math.random() - 0.5).join('');
  return s;
}

function addScore(channelId, user, pts) {
  const board = state.scores.get(channelId) || {};
  board[user.id] = board[user.id] || { name: user.displayName, pts: 0 };
  board[user.id].name = user.displayName;
  board[user.id].pts += pts;
  state.scores.set(channelId, board);
  return board[user.id].pts;
}

const HANG_ART = ['', '😐', '😐 👕', '😐 👕 👖', '😟 👕 👖 👟', '😨 👕 👖 👟👟', '😵 — game over'];

function hangView(g) {
  return g.word.split('').map((c) => (g.found.has(c) ? c.toUpperCase() : '＿')).join(' ');
}

function tttBoard(g) {
  const sym = (v, i) => (v === 'X' ? '❌' : v === 'O' ? '⭕' : ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][i]);
  const b = g.board.map(sym);
  return `${b[0]}${b[1]}${b[2]}\n${b[3]}${b[4]}${b[5]}\n${b[6]}${b[7]}${b[8]}`;
}
function tttWinner(b) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}

// ctx: { channelId, bots: [botIds present], author, content, reply(botId, {content, embed}), findUser(name) }
function handle(ctx) {
  const { channelId, author, bots } = ctx;
  const text = (ctx.content || '').trim();
  if (!text || author.isBot) return;
  const lower = text.toLowerCase();
  const [cmd, ...rest] = lower.split(/\s+/);
  const argRaw = text.slice(cmd.length).trim();
  const on = (id) => bots.includes(id);

  // --- Dicey -------------------------------------------------------------
  if (on('bot_dicey')) {
    const say = (embed) => ctx.reply('bot_dicey', { embed: { color: '#ff5fa2', ...embed } });
    if (cmd === '!roll') {
      const m = (rest[0] || '1d6').match(/^(\d{0,2})d(\d{1,4})$/);
      const n = Math.min(20, Math.max(1, parseInt(m?.[1] || '1', 10)));
      const sides = Math.min(1000, Math.max(2, parseInt(m?.[2] || '6', 10)));
      const rolls = Array.from({ length: n }, () => 1 + rand(sides));
      return say({ title: `🎲 ${author.displayName} rolled ${n}d${sides}`, description: `**${rolls.reduce((a, b) => a + b, 0)}**  (${rolls.join(', ')})` });
    }
    if (cmd === '!flip') return say({ title: '🪙 Coin flip', description: `It's **${pick(['Heads', 'Tails'])}**!` });
    if (cmd === '!8ball') {
      if (!argRaw) return say({ description: 'Ask me a question, e.g. `!8ball will I win?`' });
      return say({ title: `🎱 ${argRaw}`, description: pick(EIGHT_BALL) });
    }
    if (cmd === '!choose') {
      const opts = argRaw.split(/\||,| or /i).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return say({ description: 'Give me at least two options: `!choose pizza | tacos`' });
      return say({ title: '🤔 I choose…', description: `**${pick(opts)}**` });
    }
    if (cmd === '!slots') {
      const icons = ['🍒', '🍋', '💗', '⭐', '🍇', '7️⃣'];
      const r = [pick(icons), pick(icons), pick(icons)];
      const win = r[0] === r[1] && r[1] === r[2];
      const two = !win && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]);
      return say({ title: '🎰 Slots', description: `| ${r.join(' | ')} |\n${win ? '**JACKPOT!** 🎉' : two ? 'So close — a pair!' : 'No luck this time.'}` });
    }
  }

  // --- Quizzy ------------------------------------------------------------
  if (on('bot_quizzy')) {
    const say = (embed) => ctx.reply('bot_quizzy', { embed: { color: '#a66bff', ...embed } });
    const cur = state.trivia.get(channelId);
    if (cmd === '!trivia') {
      if (cur && Date.now() - cur.t < 60000) return say({ description: 'A question is already running! Answer with `1`-`4`.' });
      const [q, opts, ans] = pick(TRIVIA);
      state.trivia.set(channelId, { q, opts, ans, t: Date.now(), tried: new Set() });
      return say({ title: `🧠 ${q}`, description: opts.map((o, i) => `**${i + 1}.** ${o}`).join('\n'), footer: 'Type 1-4 or !answer <n> • one guess each • 60s' });
    }
    if (cmd === '!scores') {
      const board = Object.values(state.scores.get(channelId) || {}).sort((a, b) => b.pts - a.pts).slice(0, 10);
      return say({ title: '🏆 Scoreboard', description: board.length ? board.map((s, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${s.name} — **${s.pts}**`).join('\n') : 'No points yet. Start with `!trivia`!' });
    }
    const guess = cmd === '!answer' ? rest[0] : /^[1-4]$/.test(lower) ? lower : null;
    if (cur && guess) {
      if (Date.now() - cur.t > 60000) { state.trivia.delete(channelId); return say({ description: `⏰ Time's up! The answer was **${cur.opts[cur.ans]}**.` }); }
      if (cur.tried.has(author.id)) return;
      cur.tried.add(author.id);
      if (parseInt(guess, 10) - 1 === cur.ans) {
        state.trivia.delete(channelId);
        const pts = addScore(channelId, author, 10);
        return say({ title: '✅ Correct!', description: `${author.displayName} got it — **${cur.opts[cur.ans]}**. (+10, total ${pts})` });
      }
      return say({ description: `❌ Not quite, ${author.displayName}.` });
    }
  }

  // --- Hangry ------------------------------------------------------------
  if (on('bot_hangry')) {
    const say = (embed) => ctx.reply('bot_hangry', { embed: { color: '#ffb02e', ...embed } });
    const g = state.hangman.get(channelId);
    if (cmd === '!hangman') {
      const ng = { word: pick(WORDS), found: new Set(), misses: [] };
      state.hangman.set(channelId, ng);
      return say({ title: '🪢 Hangman', description: `\`${hangView(ng)}\`\nGuess with \`!guess <letter>\` — 6 lives.` });
    }
    if (cmd === '!guess') {
      if (!g) return say({ description: 'No game running. Start one with `!hangman`.' });
      const gu = (rest[0] || '').replace(/[^a-z]/g, '');
      if (!gu) return;
      if (gu.length > 1) {
        if (gu === g.word) { state.hangman.delete(channelId); addScore(channelId, author, 15); return say({ title: '🎉 Solved!', description: `${author.displayName} guessed **${g.word.toUpperCase()}** (+15)` }); }
        g.misses.push(gu);
      } else if (g.word.includes(gu)) g.found.add(gu);
      else if (!g.misses.includes(gu)) g.misses.push(gu);
      if (g.word.split('').every((c) => g.found.has(c))) {
        state.hangman.delete(channelId); addScore(channelId, author, 10);
        return say({ title: '🎉 Solved!', description: `The word was **${g.word.toUpperCase()}**. Final letter by ${author.displayName} (+10)` });
      }
      if (g.misses.length >= 6) { state.hangman.delete(channelId); return say({ title: '💀 Game over', description: `The word was **${g.word.toUpperCase()}**.` }); }
      return say({ description: `\`${hangView(g)}\`\n${HANG_ART[g.misses.length]}  Misses: ${g.misses.join(', ') || '—'} (${6 - g.misses.length} lives left)` });
    }
  }

  // --- TicTac ------------------------------------------------------------
  if (on('bot_tictac')) {
    const say = (embed) => ctx.reply('bot_tictac', { embed: { color: '#2ec4b6', ...embed } });
    const g = state.ttt.get(channelId);
    if (cmd === '!ttt') {
      if (rest[0] === 'stop') { state.ttt.delete(channelId); return say({ description: 'Game ended.' }); }
      if (g) return say({ description: 'A game is already running here. Use `!ttt stop` to end it.' });
      const name = (rest[0] || '').replace(/^@/, '');
      const opp = name ? ctx.findUser(name) : null;
      if (!opp || opp.id === author.id) return say({ description: 'Challenge someone else: `!ttt @username`' });
      const ng = { board: Array(9).fill(null), players: { X: author, O: opp }, turn: 'X' };
      state.ttt.set(channelId, ng);
      return say({ title: `⭕ ${author.displayName} vs ${opp.displayName}`, description: `${tttBoard(ng)}\n${author.displayName} (❌) goes first — \`!place <1-9>\`` });
    }
    if (cmd === '!place' && g) {
      const p = g.players[g.turn];
      if (p.id !== author.id) return;
      const i = parseInt(rest[0], 10) - 1;
      if (!(i >= 0 && i < 9) || g.board[i]) return say({ description: 'Pick an empty square 1-9.' });
      g.board[i] = g.turn;
      const w = tttWinner(g.board);
      if (w) {
        state.ttt.delete(channelId);
        if (w !== 'draw') addScore(channelId, g.players[w], 10);
        return say({ title: w === 'draw' ? "🤝 It's a draw!" : `🏆 ${g.players[w].displayName} wins!`, description: tttBoard(g) });
      }
      g.turn = g.turn === 'X' ? 'O' : 'X';
      return say({ description: `${tttBoard(g)}\n${g.players[g.turn].displayName}'s turn (${g.turn === 'X' ? '❌' : '⭕'})` });
    }
  }

  // --- Rock Paper Bot ----------------------------------------------------
  if (on('bot_rps') && cmd === '!rps') {
    const say = (embed) => ctx.reply('bot_rps', { embed: { color: '#4dabf7', ...embed } });
    const stats = state.rps.get(author.id) || { w: 0, l: 0, d: 0 };
    state.rps.set(author.id, stats);
    if (rest[0] === 'stats') return say({ description: `${author.displayName}: **${stats.w}W / ${stats.l}L / ${stats.d}D**` });
    const map = { rock: '🪨', paper: '📄', scissors: '✂️', r: '🪨', p: '📄', s: '✂️' };
    const norm = { r: 'rock', p: 'paper', s: 'scissors' };
    const you = norm[rest[0]] || rest[0];
    if (!map[you]) return say({ description: 'Use `!rps rock`, `!rps paper` or `!rps scissors`.' });
    const me = pick(['rock', 'paper', 'scissors']);
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    let res;
    if (you === me) { res = "It's a draw!"; stats.d++; } else if (beats[you] === me) { res = 'You win! 🎉'; stats.w++; } else { res = 'I win! 😎'; stats.l++; }
    return say({ description: `${map[you]} vs ${map[me]} — **${res}**` });
  }

  // --- Scramble ----------------------------------------------------------
  if (on('bot_scramble')) {
    const say = (embed) => ctx.reply('bot_scramble', { embed: { color: '#51cf66', ...embed } });
    const g = state.scramble.get(channelId);
    if (cmd === '!scramble') {
      const word = pick(WORDS);
      state.scramble.set(channelId, { word });
      return say({ title: '🔤 Unscramble this!', description: `**${shuffleWord(word).toUpperCase()}**\nJust type your answer.` });
    }
    if (cmd === '!giveup' && g) { state.scramble.delete(channelId); return say({ description: `The word was **${g.word.toUpperCase()}**.` }); }
    if (g && lower === g.word) {
      state.scramble.delete(channelId);
      const pts = addScore(channelId, author, 10);
      return say({ title: '🎉 Correct!', description: `${author.displayName} unscrambled **${g.word.toUpperCase()}** (+10, total ${pts})` });
    }
  }

  if (cmd === '!help' && bots.length) {
    const lines = BOTS.filter((b) => on(b.id)).map((b) => `${b.emoji} **${b.displayName}** — ${b.commands.map((c) => `\`${c[0]}\``).join(' ')}`);
    ctx.reply(bots[0], { embed: { color: '#ff5fa2', title: '🎮 Game bots here', description: lines.join('\n') } });
  }
}

module.exports = { BOTS, handle };
