# Claude Mobile Agent

Chat with [Claude Code](https://claude.com/claude-code) running on your computer
from your phone. The agent runs Claude Code in headless mode on your machine and
streams the conversation to an installable iPhone web app (PWA) over your private
Tailscale network. You get a push notification when Claude finishes responding.

It's essentially a remote control for the Claude Code CLI on your home/work PC:
fire off a prompt from your phone on the couch, get pinged when it's done, read
the reply, keep going.

```
  iPhone PWA  ──WebSocket──>  Node agent  ──spawns──>  claude -p  (Claude Code CLI)
   (browser)   <─stream───      (your PC)   <─stdout──
                                    │
                                    └──> ntfy.sh ──push──> your phone
```

## What you get

- **Full Claude Code on your phone** - runs the real `claude` CLI on your PC with
  access to your projects and files.
- **Installable iOS app** - "Add to Home Screen" gives you a standalone app, no
  App Store needed.
- **Push notifications** - get pinged via [ntfy.sh](https://ntfy.sh) when Claude
  finishes (so you can put your phone down while it works).
- **Session browser** - resume any past Claude Code conversation from your phone,
  or start a fresh one.
- **Multi-device** - save several PCs (by Tailscale IP) and switch between them
  from the app.
- **Private by default** - traffic stays on your Tailscale network; access is
  gated by a shared token.

---

## Prerequisites

Before you start, install these on the **PC that will run the agent** (the
machine where your code lives):

1. **[Node.js](https://nodejs.org)** 18 or newer.
2. **[Claude Code CLI](https://claude.com/claude-code)** - installed and logged
   in. Verify with:
   ```sh
   claude --version
   ```
   The agent shells out to this `claude` binary, so it must be on your `PATH` and
   already authenticated.
3. **[Tailscale](https://tailscale.com)** - installed on *both* the PC and your
   phone, signed into the same tailnet. This is how your phone reaches the PC
   securely without exposing anything to the public internet. Free for personal
   use.
4. An **[ntfy.sh](https://ntfy.sh) topic** - just make up a unique, hard-to-guess
   string (e.g. `myname-claude-7fa2c9`). No signup required. You'll install the
   ntfy app on your phone and subscribe to this topic to receive notifications.

> **Note on platform:** this was built and tested on **Windows**. It also has a
> macOS/Linux code path (it spawns `claude` directly instead of via `cmd.exe`),
> but it's less battle-tested there. See [Configuration](#configuration) notes.

---

## Setup

```sh
git clone https://github.com/thetomtoro/claude-mobile-agent.git
cd claude-mobile-agent
npm install
```

Create your config from the example:

```sh
# Windows (PowerShell)
copy config.example.json config.json

# macOS / Linux
cp config.example.json config.json
```

Then edit `config.json`:

```json
{
  "name": "My PC",
  "port": 3000,
  "token": "replace-with-a-long-random-string",
  "ntfyTopic": "myname-claude-replace-with-random-suffix",
  "idleThresholdMs": 3000,
  "outputBufferLines": 500,
  "workingDirectory": "C:\\Users\\you\\your-project"
}
```

| Field               | What it's for                                                                 |
|---------------------|-------------------------------------------------------------------------------|
| `name`              | Display name shown in the app header.                                         |
| `port`              | Port the agent listens on. `3000` is fine.                                    |
| `token`             | **Shared secret.** Generate something long and random - this is your only auth. |
| `ntfyTopic`         | Your ntfy.sh topic for push notifications. Keep it secret-ish.                |
| `idleThresholdMs`   | Reserved for output-batching tuning.                                          |
| `outputBufferLines` | Reserved for output-buffer tuning.                                            |
| `workingDirectory`  | The project folder Claude starts in. On Windows, escape backslashes (`\\`).   |

> **Generate a good token.** For example:
> ```sh
> node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
> ```

`config.json` and `.phone-session-id` are gitignored, so your secrets and session
state stay local.

---

## Running it

```sh
npm start
```

You'll see something like:

```
Claude Mobile Agent started
Local:  http://localhost:3000?token=YOUR_TOKEN
Phone:  http://<tailscale-ip>:3000?token=YOUR_TOKEN
```

Find your PC's Tailscale IP (`100.x.x.x`) with `tailscale ip -4`, or from the
Tailscale admin console.

### Open it on your phone

1. Make sure Tailscale is connected on your phone.
2. Open Safari and go to:
   ```
   http://<tailscale-ip>:3000?token=YOUR_TOKEN
   ```
3. Tap **Share → Add to Home Screen** to install it as an app.

The token is stored by the app after the first load, so you don't need to type it
in the URL every time once it's saved.

### Get push notifications

Install the **ntfy** app ([iOS](https://apps.apple.com/app/ntfy/id1625396347)) and
subscribe to the `ntfyTopic` you put in `config.json`. You'll get a push every time
Claude finishes responding.

---

## Using the app

- **Type a message** and send - it runs as a prompt in Claude Code on your PC.
- **☰ (Sessions)** - browse and resume any past Claude Code conversation on that
  machine, or pick up where you left off.
- **＋ (New chat)** - start a fresh session.
- **Device button** (top-left) - add and switch between multiple PCs by Tailscale
  IP, so one app can drive several machines.

The phone uses its **own dedicated Claude Code session** (`.phone-session-id`),
kept separate from whatever you're doing in your terminal, so the two don't step
on each other.

---

## Security - please read

This tool is designed to run **only over Tailscale**, not the public internet.
Understand what it does:

- **It runs Claude Code with `--permission-mode bypassPermissions`.** Claude will
  execute commands and edit files **without asking for confirmation**. Anyone who
  can reach the agent with a valid token can make Claude do anything on your PC.
- **It grants access to all your drives.** On Windows it passes every logical
  drive (`C:\`, `D:\`, …) to Claude via `--add-dir`, so the whole machine is in
  scope, not just `workingDirectory`.
- **Auth is a single shared token** passed as a query parameter / `x-token`
  header, compared in constant time. That's adequate *behind Tailscale*. Do **not**
  port-forward this to the open internet or put it behind a public reverse proxy.

Keep your `token` long and secret, keep the agent on Tailscale, and treat the
phone like a key to your computer.

---

## Project structure

| File                | Responsibility                                                        |
|---------------------|-----------------------------------------------------------------------|
| `agent.js`          | Entry point. Express server, wires up WebSocket + Claude + notify.    |
| `claude-runner.js`  | Spawns the `claude` CLI, manages the phone's session id, streams output. |
| `ws-server.js`      | WebSocket server: token-gated connections, broadcast to clients.      |
| `auth.js`           | Constant-time token validation + Express auth middleware.             |
| `notify.js`         | Sends push notifications via ntfy.sh.                                  |
| `session-store.js`  | Reads `~/.claude/projects` to list and load past Claude Code sessions. |
| `public/`           | The PWA frontend (HTML/CSS/JS, manifest, service worker).             |
| `config.json`       | Your local config (gitignored).                                       |

---

## Troubleshooting

- **"claude: command not found" / agent errors on send** - the `claude` CLI isn't
  on `PATH` or isn't logged in. Run `claude --version` and `claude` in a terminal
  from the same account first.
- **Phone can't connect** - confirm both devices show as connected in Tailscale,
  and you're using the `100.x.x.x` Tailscale IP (not `localhost`). Check the PC
  firewall allows inbound on your `port`.
- **401 Unauthorized** - token in the URL/app doesn't match `config.json`.
- **No notifications** - make sure the ntfy app is subscribed to the exact
  `ntfyTopic` string, and that the PC has outbound internet to `ntfy.sh`.
- **Session list is empty** - you have no prior Claude Code conversations in
  `~/.claude/projects` yet. Start a chat first.

---

## Notes for setting this up on a different machine

If you're cloning this to run on your own PC (not Tommy's):

- Replace **every** value in `config.json` with your own - especially `token` and
  `ntfyTopic`. The example file ships with placeholder values; don't reuse them.
- Set `workingDirectory` to your own project path (remember `\\` on Windows).
- The session browser reads from **your** `~/.claude/projects`, so it'll show
  your conversations automatically.
- On macOS/Linux the agent calls `claude` directly; on Windows it goes through
  `cmd.exe`. Both are handled automatically based on the OS.
