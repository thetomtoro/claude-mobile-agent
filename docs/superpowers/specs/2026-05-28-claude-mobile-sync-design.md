# Claude Mobile Sync — Design Spec
**Date:** 2026-05-28
**Status:** Approved

## Overview

A system that lets Tommy interact with a live Claude Code session from his iPhone, from anywhere, with full two-way chat and push notifications. Works across his Windows PC and Mac without modification — each machine runs an identical local agent.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  PC or Mac                                  │
│                                             │
│  ┌─────────────┐     ┌──────────────────┐  │
│  │ Claude Code │◄────│  Local Agent     │  │
│  │   (CLI)     │     │  (Node.js)       │  │
│  └─────────────┘     │                  │  │
│                      │  - HTTP server   │  │
│                      │  - WebSocket     │  │
│                      │  - ntfy client   │  │
│                      └────────┬─────────┘  │
│                               │ Tailscale  │
└───────────────────────────────┼────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  ntfy.sh             │
                    │  (push relay)        │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  iPhone              │
                    │  PWA (chat UI)       │
                    │  ntfy app            │
                    └──────────────────────┘
```

Three components:
1. **Local Agent** — Node.js process on the active machine. Wraps Claude Code, streams output via WebSocket, serves the PWA, fires push notifications.
2. **Tailscale** — Encrypted private mesh network. Installed on PC, Mac, and iPhone. Each device gets a stable `100.x.x.x` IP accessible from anywhere.
3. **PWA + ntfy** — Mobile chat UI installable to iPhone home screen. Push notifications via ntfy.sh (free, no Apple Developer account needed).

---

## Component: Local Agent

**Entry point:** `agent.js`

**Responsibilities:**
- Spawn Claude Code as a child process via PTY (`node-pty`) so Claude behaves as if running in a real terminal (colors, interactive prompts preserved)
- One Claude session per machine, persistent across phone reconnects
- Buffer last ~500 lines of output; replay to newly connected clients
- Broadcast stdout/stderr to all connected WebSocket clients in real-time
- Accept stdin from WebSocket clients and pipe to Claude Code's PTY
- Detect idle (no output for 3 seconds) and fire ntfy push notification
- Serve the PWA as static files from `public/`
- Expose `GET /info` returning `{ name, platform }` for device picker

**File structure:**
```
claude-mobile-agent/
├── agent.js           # entry point, HTTP + WS server
├── pty-manager.js     # spawns and manages Claude Code PTY
├── ws-server.js       # WebSocket broadcasting and client management
├── notify.js          # ntfy.sh push integration
├── config.json        # token, ntfy topic, port, machine name
└── public/            # PWA static files (index.html, app.js, manifest.json, sw.js)
```

**config.json schema:**
```json
{
  "name": "Tommy's PC",
  "port": 3000,
  "token": "your-shared-secret",
  "ntfyTopic": "tommy-claude-abc123",
  "idleThresholdMs": 3000,
  "outputBufferLines": 500,
  "workingDirectory": "C:\\Users\\Tommy Ong\\your-project"
}
```
`workingDirectory` is the folder Claude Code spawns in. Defaults to the agent's own directory if omitted.

**Starting the agent:**
```bash
node agent.js
```
Identical command on Windows and Mac.

---

## Component: Mobile PWA

Served from `public/` by the agent. Installed to iPhone home screen via Safari → Add to Home Screen.

**UI layout:**
```
┌─────────────────────────┐
│ Tommy's PC          ⚡  │  ← machine name + connection status
├─────────────────────────┤
│                         │
│  ┌───────────────────┐  │
│  │ Claude            │  │
│  │ Here's the plan...│  │
│  └───────────────────┘  │
│                         │
│         ┌─────────────┐ │
│         │ sounds good │ │
│         └─────────────┘ │
│                         │
│  ┌───────────────────┐  │
│  │ Claude            │  │
│  │ Running tests...  │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ [    Type a message   ] │
│                    [▶] │
└─────────────────────────┘
```

**Behaviors:**
- Claude messages render left-aligned, user messages right-aligned (iMessage style)
- Output streams in real-time as Claude produces it
- Long code blocks or file output collapse into expandable sections
- Auto-scrolls to bottom as output arrives; pauses if user scrolls up
- Reconnects automatically and silently on drop (yellow = reconnecting, red = unreachable)
- Tap machine name in header to open device switcher; devices stored in localStorage
- Fullscreen when launched from home screen (no Safari chrome)
- Offline: shows buffered history while reconnecting

**PWA files:**
- `manifest.json` — app name, icon, display: standalone
- `sw.js` — service worker for offline history cache
- `index.html` + `app.js` — chat UI and WebSocket client

---

## Component: Push Notifications (ntfy.sh)

**Service:** ntfy.sh (free, open-source, no account required)
**iPhone:** ntfy iOS app (App Store, free), subscribed to the topic in config.json

**Triggers:**

| Event | Notification |
|---|---|
| Claude idle for 3s after output | "Claude is waiting for input" |
| Claude session exits cleanly | "Session finished on [machine name]" |
| Claude process crashes unexpectedly | "Claude crashed — check your PC" |

**Delivery:** Agent POSTs to `https://ntfy.sh/{topic}` with title and message. ntfy app delivers to iPhone via APNs.

**Topic naming:** Pick a non-obvious string, e.g. `tommy-claude-abc123`. Set once in `config.json`. Same topic on PC and Mac so notifications always reach the same iPhone regardless of which machine is active.

---

## Networking & Security

**Tailscale setup (one time per device):**
1. Install Tailscale on Windows PC, Mac, and iPhone
2. Sign in with the same account on all three
3. PC and Mac each get a stable `100.x.x.x` Tailscale IP

Agent binds to `0.0.0.0:3000`. iPhone accesses via `http://100.x.x.x:3000`.

**Security layers:**

| Layer | Mechanism |
|---|---|
| Network | Tailscale — only enrolled devices can reach the agent |
| Application | Shared token checked on every HTTP request and WebSocket handshake |
| Exposure | Agent never exposed to public internet — no port forwarding needed |

**Multi-machine config:**
Both machines use the same token so the phone can switch between them without re-authenticating. The device switcher in the PWA stores each machine's Tailscale IP in localStorage.

**Runtime requirements (what must be running):**
- Machine on and awake
- Tailscale running (auto-starts as a background service after install)
- Agent started: `node agent.js`
- Claude Code session active in the PTY

---

## Dependencies

| Package | Purpose |
|---|---|
| `node-pty` | PTY for Claude Code child process |
| `ws` | WebSocket server |
| `express` | HTTP server + static file serving |
| `node-fetch` | ntfy.sh POST requests |

Node.js v18+ required. No other runtime dependencies.

---

## Out of Scope

- Multiple simultaneous Claude sessions per machine
- Native iOS app (PWA is sufficient)
- Authentication beyond shared token
- Windows/Mac agent auto-start on boot (can be added later with pm2 or launchd)
