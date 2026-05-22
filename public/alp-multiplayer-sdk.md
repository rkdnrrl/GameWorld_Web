# ALP Platform — Multiplayer SDK Reference (AI-readable)

> Add this file to your game project as `AGENTS.md` or `CLAUDE.md`.
> AI assistants will read it automatically and know how to implement
> multiplayer for the ALP platform without further explanation.

---

## Platform Overview

- Games are **static HTML/JS files** hosted on Cloudflare R2 at `play.airliveplay.com/{slug}/`
- Multiplayer is handled by **Supabase Realtime** via `window.ALPMultiplayer`
- The SDK is injected at `/_alp/sdk.js` by the Cloudflare Worker — no npm install, no bundler
- Channel isolation: `game:{slug}:{roomId}` — games never cross-contaminate

---

## Setup (copy-paste into `index.html`)

```html
<head>
  <!-- Load BEFORE your game script. Defines window.ALPMultiplayer. -->
  <script src="/_alp/sdk.js"></script>
</head>
```

The Worker injects `window.__ALP_SUPABASE_URL__`, `window.__ALP_SUPABASE_ANON_KEY__`,
and `window.__ALP_GAME_SLUG__` automatically. Do NOT hardcode credentials.

---

## Critical Call Order

```
WRONG ❌                          CORRECT ✅
──────────────────────────────    ──────────────────────────────
mp = new ALPMultiplayer()         mp = new ALPMultiplayer()
await mp.joinRoom(...)            mp.on('move', handler)       ← FIRST
mp.on('move', handler)            mp.onPlayers(handler)        ← FIRST
mp.onPlayers(handler)             await mp.joinRoom(...)       ← LAST
```

`onPlayers()` uses Supabase Presence, which must be registered before `subscribe()`.
The SDK queues callbacks internally — but only if called before `joinRoom()`.

---

## Full API

### `new ALPMultiplayer()`
Creates a multiplayer instance. One instance = one room connection.

---

### `mp.on(event, callback)` → `this`
Register a broadcast listener. Safe to call before OR after `joinRoom()`.

```js
mp.on('move',   (payload) => { /* payload = what the sender passed to send() */ });
mp.on('attack', (payload) => { });
mp.on('chat',   ({ text }) => { });
```

---

### `mp.onPlayers(callback)` → `this`
Called whenever the room's player list changes (join / leave / disconnect).
**Must be called before `joinRoom()`.**

```js
mp.onPlayers((players) => {
  // players: array of playerInfo objects passed to joinRoom()
  // Departed players are automatically removed
  renderPlayerList(players);
});
```

---

### `await mp.joinRoom(roomId, playerInfo?)` → `Promise<void>`
Connect to the room. Loads Supabase JS from CDN on first call.

```js
await mp.joinRoom('room1', {
  id:    crypto.randomUUID(),   // required for de-duplication
  name:  'Player 1',
  color: '#ff6b6b',
  x: 100, y: 200               // any extra fields you need
});
```

- `roomId` — string, shared by players who want to be in the same room
- `playerInfo` — any JSON-serializable object; broadcasted to others via Presence
- Channel name: `game:{window.__ALP_GAME_SLUG__}:{roomId}`

---

### `mp.send(event, payload)` → `Promise<void>`
Broadcast an event to **all other players** in the room. Does NOT fire on sender.

```js
mp.send('move',   { id: myId, x: 150, y: 300 });
mp.send('attack', { id: myId, targetId: 'abc', damage: 10 });
mp.send('chat',   { text: 'hello!' });
```

**Rate limit: max 20 messages/sec (50 ms interval).** Throttle with:
```js
let lastSend = 0;
function maybeSend(event, payload) {
  const now = performance.now();
  if (now - lastSend < 50) return;
  mp.send(event, payload);
  lastSend = now;
}
```

---

### `await mp.updatePlayer(info)` → `Promise<void>`
Replace the current player's Presence info. Triggers `onPlayers()` on all clients.

```js
await mp.updatePlayer({ id: myId, name: 'Player 1', score: 42 });
```

---

### `await mp.leave()` → `Promise<void>`
Disconnect from the room. Automatically triggers `onPlayers()` on all other clients.
Call on page unload or when the player exits:

```js
window.addEventListener('beforeunload', () => mp.leave());
```

---

## Minimal Working Game (copy-paste complete)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="/_alp/sdk.js"></script>
</head>
<body>
  <canvas id="c" width="600" height="400" style="background:#111"></canvas>
  <script>
    const ctx  = document.getElementById('c').getContext('2d');
    const myId = crypto.randomUUID();
    const myColor = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
    let myX = 300, myY = 200;

    // Other players: id → { x, y, tx, ty, color }
    const others = new Map();

    async function main() {
      const mp = new ALPMultiplayer();

      // 1. Register callbacks BEFORE joinRoom
      mp.on('move', ({ id, x, y, color }) => {
        const o = others.get(id);
        if (o) { o.tx = x; o.ty = y; }
        else     others.set(id, { x, y, tx: x, ty: y, color });
      });

      mp.onPlayers((players) => {
        const live = new Set(players.map(p => p.id));
        for (const id of others.keys()) if (!live.has(id)) others.delete(id);
      });

      // 2. Join room
      await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

      // 3. Input
      const keys = new Set();
      window.addEventListener('keydown', e => keys.add(e.code));
      window.addEventListener('keyup',   e => keys.delete(e.code));

      // 4. Game loop
      let lastSend = 0;
      function loop(now) {
        const spd = 3;
        if (keys.has('ArrowLeft'))  myX -= spd;
        if (keys.has('ArrowRight')) myX += spd;
        if (keys.has('ArrowUp'))    myY -= spd;
        if (keys.has('ArrowDown'))  myY += spd;

        // Lerp other players (smooth movement between network updates)
        for (const o of others.values()) {
          o.x += (o.tx - o.x) * 0.2;
          o.y += (o.ty - o.y) * 0.2;
        }

        // Send at 20 fps max
        if (now - lastSend > 50) {
          mp.send('move', { id: myId, color: myColor, x: Math.round(myX), y: Math.round(myY) });
          lastSend = now;
        }

        // Render
        ctx.fillStyle = '#111'; ctx.fillRect(0,0,600,400);
        for (const o of others.values()) dot(o.x, o.y, o.color);
        dot(myX, myY, myColor);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }

    function dot(x, y, color) {
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
    }

    main();
  </script>
</body>
</html>
```

---

## Smooth Movement Pattern (Lerp)

Network sends happen every 50 ms. To avoid jitter, store `tx`/`ty` (target)
and lerp `x`/`y` every frame:

```js
// On receive:
other.tx = payload.x;
other.ty = payload.y;

// Every frame (requestAnimationFrame):
other.x += (other.tx - other.x) * 0.2;   // factor 0.2 = ~8 frames to reach target
other.y += (other.ty - other.y) * 0.2;

// Render at other.x, other.y (not tx/ty)
```

---

## Limits

| Item | Free plan | Pro plan |
|------|-----------|----------|
| Total concurrent connections | 200 | 500 |
| Messages / second (total) | 500 | 2,500 |
| Per-channel player limit | none* | none* |
| Max message size | 2 MB | 2 MB |

*Effectively limited by the total connection ceiling.

Recommended players per room by game type:
- Turn-based (board, puzzle): up to 50
- Co-op / exploration: up to 20
- Real-time action: up to 10

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `onPlayers()` called after `joinRoom()` | Always call before `joinRoom()` |
| Sending every frame (60/sec) | Throttle to 20/sec (50 ms) |
| Jumping to received position directly | Lerp: `x += (tx - x) * 0.2` each frame |
| Reacting to your own `send()` | SDK sets `self: false` — you won't receive your own events |
| Hardcoding Supabase credentials | Use `window.__ALP_SUPABASE_URL__` injected by SDK |

---

## Platform APIs (for persistent data)

These are HTTP APIs on the platform backend (`window.__ALP_PLATFORM_API__`).
Multiplayer realtime uses ALPMultiplayer above; use these for save data.

```
GET  /api/game-state/{slug}          → { data: {} }
PUT  /api/game-state/{slug}          body: { data: {...} }   (full replace)
PATCH /api/game-state/{slug}         body: { data: {...} }   (shallow merge)

GET  /api/catches/inventory          → { items: [...] }
POST /api/inventory                  → add item to shared inventory
```

Auth header required: `Authorization: Bearer {token}`
Token available from parent frame via postMessage or `window.__ALP_TOKEN__`.

---

## Window Globals (injected by SDK)

| Variable | Value |
|----------|-------|
| `window.__ALP_SUPABASE_URL__` | Supabase project URL |
| `window.__ALP_SUPABASE_ANON_KEY__` | Supabase anon (public) key |
| `window.__ALP_GAME_SLUG__` | Current game slug (from URL path) |
| `window.__ALP_PLATFORM_API__` | Platform API base URL |
| `window.ALPMultiplayer` | The multiplayer class |
