# ALP Platform — Multiplayer SDK Reference (AI-readable)

> Add this file to your game project as `AGENTS.md` or `CLAUDE.md`.
> AI assistants will read it automatically and know how to implement
> multiplayer for the ALP platform without further explanation.

---

## Platform Overview

- Games are **static HTML/JS files** hosted on Cloudflare R2 at `play.airliveplay.com/{slug}/`
- Multiplayer is handled by **Cloudflare Durable Objects** via WebSocket
- Each room = one Durable Object instance. No hard concurrent connection limit.
- The SDK is served at `/_alp/sdk.js` by the Cloudflare Worker — no npm install, no bundler
- WebSocket endpoint: `wss://play.airliveplay.com/_alp/ws?room={slug}:{roomId}`

---

## Setup (copy-paste into `index.html`)

```html
<head>
  <!-- Load BEFORE your game script. Defines window.ALPMultiplayer. -->
  <script src="/_alp/sdk.js"></script>
</head>
```

The Worker serves the SDK automatically. No credentials needed in game code.

---

## Call Order

No strict ordering requirement. All methods can be called before or after `joinRoom()`.

```js
const mp = new ALPMultiplayer();

// Register callbacks (recommended before joinRoom, but not required)
mp.on('move', handler);
mp.onPlayers(handler);

// Join room last
await mp.joinRoom('room1', playerInfo);
```

If `onPlayers()` is registered after `joinRoom()`, it immediately receives the current player list.

---

## Full API

### `new ALPMultiplayer()`
Creates a multiplayer instance. One instance = one room connection.

---

### `mp.on(event, callback, options?)` → `this`
Register a broadcast listener. Safe to call before OR after `joinRoom()`.

```js
mp.on('move',   (payload) => { /* payload = what sender passed to send() */ });
mp.on('attack', (payload) => { });
mp.on('chat',   ({ text }) => { });
```

**`options.predict = true`** — Interpolation buffer mode (recommended for position sync):
- SDK buffers received positions with timestamps
- Renders 50ms behind current time, linearly interpolating between two buffered samples
- Callback fires at 60fps with smoothly interpolated x/y values
- No lerp code needed in the game loop
- Options: `id` (default: `'id'`), `x` (default: `'x'`), `y` (default: `'y'`)

```js
// Without predict: game must lerp manually
mp.on('move', (p) => { other.tx = p.x; other.ty = p.y; });
// game loop: other.x += (other.tx - other.x) * 0.2;

// With predict: SDK handles interpolation, callback gets smooth values at 60fps
mp.on('move', (p) => {
  const o = others.get(p.id);
  if (o) { o.x = p.x; o.y = p.y; }  // already interpolated
}, { predict: true });
// game loop: just read o.x, o.y and render
```

---

### `mp.onPlayers(callback)` → `this`
Called whenever the room's player list changes (join / leave / disconnect).
Can be called before OR after `joinRoom()`.

```js
mp.onPlayers((players) => {
  // players: array of playerInfo objects passed to joinRoom()
  // Departed players are automatically removed
  renderPlayerList(players);
});
```

---

### `await mp.joinRoom(roomId, playerInfo?, options?)` → `Promise<void>`
Connect to the room via WebSocket to Cloudflare Durable Objects.
Resolves when the server sends `welcome` (player is fully joined).

```js
await mp.joinRoom('room1', {
  id:    crypto.randomUUID(),   // recommended for de-duplication
  name:  'Player 1',
  color: '#ff6b6b',
  x: 100, y: 200               // any extra fields you need
});
```

**Password-protected rooms:**
```js
// Create a password-protected room (first joiner sets the password)
await mp.joinRoom('room1', playerInfo, { password: '1234' });

// Join with password — rejects if wrong
try {
  await mp.joinRoom('room1', playerInfo, { password: userInput });
} catch (e) {
  // e.message === '[ALP] 비밀번호가 틀렸습니다.'
  showError('Wrong password');
}
```

- `roomId` — string, shared by players who want to be in the same room
- `playerInfo` — any JSON-serializable object; sent to others via Presence
- `options.password` — string. First joiner sets the password; later joiners must match it.
- Channel: `game:{window.__ALP_GAME_SLUG__}:{roomId}`

---

### `mp.send(event, payload)` → `void`
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

Note: `send()` returns `void`, not a Promise. Do not `await` it.

---

### `mp.updatePlayer(info)` → `void`
Replace the current player's Presence info. Triggers `onPlayers()` on all clients.

```js
mp.updatePlayer({ id: myId, name: 'Player 1', score: 42 });
```

---

### `await mp.leave()` → `Promise<void>`
Disconnect from the room. Automatically triggers `onPlayers()` on all other clients.

```js
window.addEventListener('beforeunload', () => mp.leave());
```

---

### `ALPMultiplayer.getRooms(slug?)` → `Promise<{id: string, count: number}[]>`
Fetch the list of currently active rooms for this game. **Static method — no instance needed.**

```js
// Static call (no instance required)
const rooms = await ALPMultiplayer.getRooms();
// → [{ id: 'room1', count: 3 }, { id: 'room2', count: 1 }]
// Sorted by player count descending

// Instance call (same result)
const mp = new ALPMultiplayer();
const rooms = await mp.getRooms();
```

- `slug` — optional override. Defaults to `window.__ALP_GAME_SLUG__` (auto-set by the platform).
- Returns `[]` if no rooms are active.
- Rooms with 0 players are automatically removed from the list (within 2 minutes).

**Lobby UI example:**
```js
async function refreshRooms() {
  const rooms = await ALPMultiplayer.getRooms();
  // rooms: [{ id, count }, ...]
  renderLobby(rooms);
}
refreshRooms();
setInterval(refreshRooms, 5000); // poll every 5 seconds

// After player selects a room:
const mp = new ALPMultiplayer();
await mp.joinRoom(selectedRoomId, { id: myId, name: 'Player' });
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

      mp.on('move', ({ id, x, y, color }) => {
        const o = others.get(id);
        if (o) { o.tx = x; o.ty = y; }
        else     others.set(id, { x, y, tx: x, ty: y, color });
      });

      mp.onPlayers((players) => {
        const live = new Set(players.map(p => p.id));
        for (const id of others.keys()) if (!live.has(id)) others.delete(id);
      });

      await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

      const keys = new Set();
      window.addEventListener('keydown', e => keys.add(e.code));
      window.addEventListener('keyup',   e => keys.delete(e.code));

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
other.x += (other.tx - other.x) * 0.2;
other.y += (other.ty - other.y) * 0.2;

// Render at other.x, other.y (not tx/ty)
```

---

## Limits

| Item | Value |
|------|-------|
| Concurrent connections | No hard limit (Durable Objects scale automatically) |
| Messages / second | Max 20 per player (50ms throttle) |
| Max message size | 1 MB |
| Cost model | $5/month base + usage (very cheap at small scale) |

Recommended players per room by game type:
- Turn-based (board, puzzle): up to 50
- Co-op / exploration: up to 20
- Real-time action: up to 10

Multiple rooms per game are supported. Player limits above are per room.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `await mp.send(...)` | `send()` returns void, not a Promise |
| Jumping to received position directly | Lerp: `x += (tx - x) * 0.2` each frame |
| Sending every frame (60/sec) | Throttle to 20/sec (50ms) |
| Reacting to your own `send()` | SDK sets `self: false` — you won't receive your own events |

---

## Window Globals (set by SDK)

| Variable | Value |
|----------|-------|
| `window.__ALP_GAME_SLUG__` | Current game slug (from URL path) |
| `window.__ALP_PLATFORM_API__` | Platform API base URL |
| `window.ALPMultiplayer` | The multiplayer class |

---

## Platform APIs (for persistent data)

Use these for save data. Auth header required: `Authorization: Bearer {token}`

```
GET   /api/game-state/{slug}   → { data: {} }
PUT   /api/game-state/{slug}   body: { data: {...} }   (full replace)
PATCH /api/game-state/{slug}   body: { data: {...} }   (shallow merge)

GET   /api/catches/inventory   → { items: [...] }
POST  /api/inventory           → add item to shared inventory
```
