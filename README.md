# OH Arbitrage System — Backend

Real Node/Express API for the parking arbitrage tracker: SQLite database, role-based
auth, and a Telegram bot that broadcasts server-side (no CORS issues, unlike calling
Telegram directly from a browser).

## What this does vs. the artifact prototype

The React artifact I built earlier runs entirely in your browser and can't reliably send
Telegram messages or run background jobs. This backend fixes both: it's a real server
process, so Telegram sends work normally and the daily digest actually runs on schedule.
The frontend artifact would need to be pointed at this API instead of `window.storage`
to use it — see "Connecting the frontend" below.

## 1. Local setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- `JWT_SECRET` — any long random string
- `TELEGRAM_BOT_TOKEN` — from @BotFather in Telegram (`/newbot`, follow the prompts)
- `TELEGRAM_CHAT_ID` — add your bot as admin to your channel, then find the chat ID
  (easiest: forward a channel message to @userinfobot, or call the Bot API's
  `getUpdates` endpoint after posting in the channel)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your first login, created automatically on boot

```bash
npm start
```

Server runs on `http://localhost:4000`. `GET /health` should return `{"ok":true}`.

## 2. Deploying somewhere that stays running

This needs a host that keeps a Node process alive — a browser artifact can't do that.
Reasonable options, roughly easiest first:

- **Railway** or **Render** — connect a GitHub repo, set the env vars from `.env.example`
  in their dashboard, deploy. Both have free/low-cost tiers sufficient for this.
- **Fly.io** — `fly launch` in this folder, set secrets with `fly secrets set KEY=value`.
- **A small VPS** (DigitalOcean, Linode, etc.) — run with `pm2` or a systemd service so
  it restarts on crash/reboot.

The SQLite file (`data.sqlite`) needs to live on persistent storage — on Railway/Render/Fly
that usually means attaching a volume, since their filesystems are ephemeral by default.

## 3. Auth

- First boot seeds one admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `POST /api/auth/login` → `{ email, password }` → returns a JWT. Send it as
  `Authorization: Bearer <token>` on every other request.
- Admin can create more users: `POST /api/auth/users` → `{ email, password, role, region }`.
  `role` is `admin` or `analyst`. Give analysts a `region` to scope them to it — they'll
  only see/edit events in that region; admins see everything.

## 4. Events API

- `GET /api/events?region=&state=&priority=&status=&category=` — list + filter, computed
  fields (`stubhub_fee_adjusted_price`, `best_buy_price`, `best_buy_platform`,
  `arbitrage_spread_dollar`, `arbitrage_spread_percent`) included automatically.
- `POST /api/events` — create. Triggers the "new event" Telegram broadcast if enabled.
- `PATCH /api/events/:id` — update any editable field. Setting `status` to `Priced` or
  `Confirmed` triggers the arbitrage-alert broadcast if the spread clears your threshold.
- `DELETE /api/events/:id` — admin only.
- `POST /api/events/import` — bulk import, body `{ rows: [...] }` matching the schema.
- `GET /api/events/dashboard/summary` — the numbers the Dashboard view needs.

## 5. Settings API

- `GET /api/settings` — current broadcast config.
- `PATCH /api/settings` — admin only. Fields: `notify_new_event`, `notify_priced_positive`,
  `only_high_priority`, `spread_threshold_percent`, `digest_time` (HH:mm), `digest_enabled`.
- `POST /api/settings/test-telegram` — admin only, sends a test message.

## 6. Research Assistant

`POST /api/research` → `{ region, state, month }` (e.g. `{"region":"West","state":"CA","month":"September 2026"}`)

Calls Claude with the web_search tool to find 15,000+ capacity venues (or NFL/NBA/NHL/MLB/MLS
home venues, or major tour stops) in that state, then confirmed events at those venues in the
target month. Returns `{ rows: [...], notes: "..." }` with pricing fields intentionally blank —
review the rows, then `POST /api/events/import` with the ones you want to keep.

Requires `ANTHROPIC_API_KEY` in `.env` (get one at https://console.anthropic.com — this is
billed to your own account per request, separate from anything in this chat). The model is
instructed to never invent events or guess prices; if it can't confirm something via search it
says so in `notes` instead of fabricating a row. Still worth spot-checking `source_url` on
anything before you act on it.

## 7. Daily digest

A cron job checks every minute against `digest_time` (server's local timezone) and, when
it matches, sends a summary of High-priority events still `Needs Pricing`. This only fires
while the server process is running continuously — it will not run on a machine that sleeps
or a serverless function that spins down between requests.

## Connecting the frontend artifact

The artifact currently persists to `window.storage`. To point it at this API instead:
replace the `loadEvents`/`saveEvents`/`loadSettings`/`saveSettings` functions with `fetch`
calls to these endpoints, and add a login screen that stores the JWT (e.g. in React state,
not localStorage — artifacts can't use browser storage APIs). Happy to write that
integration layer if you get the backend deployed and give me the base URL.

## What's intentionally not included

- Automated purchasing/checkout on any platform — out of scope by design.
- Live scraping of StubHub/SpotHero/ParkWhiz/Parking.com/ParkMobile — pricing is always
  entered by a person.
- Two-way Telegram behavior — this bot only sends, it never reads replies or commands.
