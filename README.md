# 💗 Xperiences

A free communication & communities app: chat with friends, build **Playrooms**, play with game bots and customize everything. There is no paywall. Every feature is available to everyone.

> The name is set in one place, `APP_NAME` in `public/js/util.js`. Change it to `TakIt Chat` (or anything else) if you like that better.

## Features

| | |
|---|---|
| 🏰 **Playrooms** | Community spaces (like servers) with categories, text and 📢 announcement channels, topics, slowmode, private (role-locked) channels and role-restricted posting |
| 🏷️ **Roles & hierarchy** | Unlimited roles with colors, icons, hoisting and 17 permissions. Roles are ordered: members can only manage roles and people *below* their own top role, and nobody can grant a permission they don't have. The owner 👑 sits above everything. |
| 🛡️ **Automod (toggleable)** | Per Playroom: blocked words (with `*` wildcards), invite links, all links (with an allow-list), mass mentions, excessive caps, spam/flooding, repeated messages and zalgo text. It can block, or block and time out, supports exempt roles, and has presets (Chill / Balanced / Strict). |
| 🤖 **AI Playroom assistant** | Describe your community and it designs the name, description, tags, channels, roles, bots and Automod. You review and tweak before creating. Works for free with a built-in engine. Set `ANTHROPIC_API_KEY` to use Claude. |
| 🧭 **Discover** | Search public Playrooms, filter by tag, sort by popular / active / new, preview before joining, join with invite links or codes |
| 🕹️ **Public game bots** | Dicey (dice, 8-ball, slots), Quizzy (trivia + scoreboard), Hangry (hangman), TicTac (tic-tac-toe), Rock Paper Bot, Scramble. Add them to Playrooms or group chats, or DM them to play solo. |
| 💬 **DMs & group chats** | Friends system, DMs, group chats of up to 50 people with names/icons, owner controls and bots |
| 👤 **Accounts & guests** | Register, or continue as a guest with one click. Guests can chat, join Playrooms and play. They can claim their account at any time and keep everything. Unclaimed guests are cleaned up after 7 days of inactivity. |
| 🎨 **Profile studio** | Banners (gradients, colors, uploaded images/GIFs), avatar uploads or emoji avatars, **avatar decorations** (hearts, sparkle, neon ring, crown, petals, halo, flame), **name styles** (gradient, glow, rainbow, shimmer, outline), name fonts, two-color card themes, **card effects** (sparkles, floating hearts, glow, aurora, glass), pronouns, bio (markdown), custom status, now-playing, mood, location, birthday, interests, favorite games, a showcase and up to 6 links, all with a live preview |
| 🌗 **Look & feel** | Pink accent by default (any shade you want), dark / light / system themes, text size, reduced motion |
| 🧩 **Layouts per chat type** | Choose **Bubbles**, **Classic**, **Compact** or **Cozy cards** separately for DMs, group chats and Playrooms |
| 🖼️ **Chat backgrounds** | Personal backgrounds per conversation, per Playroom or as a default: patterns, gradients, solid colors or your own image, with dim and blur |
| ✨ **Chat goodies** | Markdown (`**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``, code blocks, `> quotes`, `\|\|spoilers\|\|`), @mention autocomplete, replies, reactions, edits (↑ edits your last message), pins, in-chat search, image/file uploads (paste or drag & drop), typing indicators, unread markers, mention badges, sounds and desktop notifications, and a Ctrl/⌘+K quick switcher |

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `XP_DATA_DIR` | `./data` | Where the JSON database and uploads are stored |
| `ANTHROPIC_API_KEY` | – | Lets the AI Playroom assistant use Claude. Without it, the built-in template engine is used, which is free and works offline. |

## Tests

```bash
npm test
```

This starts a real server on a temporary data directory and covers accounts, guests, the AI assistant, discovery, messaging, bots, roles and hierarchy, Automod, private channels, friends, DMs, group chats and settings.

## Project layout

```
server/
  index.js        Express (auth, uploads, discovery, AI) + Socket.IO actions
  db.js           JSON-file persistence (debounced, atomic writes)
  permissions.js  Roles, permissions, hierarchy, channel access
  automod.js      Toggleable Automoderator rules
  bots.js         Public game bots
  ai.js           AI Playroom assistant (built-in engine + optional Claude)
public/
  index.html, css/styles.css
  js/app.js       Boot, routing, shell (top bar, sidebar, panels)
  js/chat.js      Chat view, 4 layouts, composer, backgrounds
  js/views.js     Friends, Discover, Arcade, member lists
  js/profile.js   Profile cards
  js/settings.js  Profile studio & user settings
  js/prsettings.js Playroom settings (roles, automod, invites…)
  js/create.js    Create Playroom (AI), groups, DMs
test/server.test.js
```
