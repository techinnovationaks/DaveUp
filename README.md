# DaveUp

Church-based discipleship app. A disciple and a discipler walk together through a repeating cycle: a 12-area baseline assessment, a growth plan, weekly practice and reflection, regular meetings, and a monthly check to see what changed.

Churches register on DaveUp and approve their own members and disciplers. Each church's data is isolated from every other church's at the database level.

> Status: MVP in progress. See [What is built](#what-is-built) and [Not built yet](#not-built-yet).

---

## Contents

- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Sign-in modes](#sign-in-modes)
- [Database](#database)
- [Testing](#testing)
- [What is built](#what-is-built)
- [Chat, cells, calls and files](#chat-cells-calls-and-files)
- [DaveUp staff console](#daveup-staff-console)
- [Key product rules](#key-product-rules)
- [API overview](#api-overview)
- [Web app](#web-app)
- [Not built yet](#not-built-yet)
- [Conventions](#conventions)
- [Troubleshooting](#troubleshooting)

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (npm workspaces monorepo) |
| API | Node 22, Fastify 5, Kysely (typed SQL), Zod validation |
| Database | PostgreSQL 16 with row-level security (one database, `church_id` on every church-scoped row) |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS 3 |
| Shared | `@daveup/shared`: question bank, scoring, cycle rules, request schemas and response types used by API, web and the future mobile app |
| Tests | Vitest (unit tests, plus API integration tests against a real Postgres) |
| Mobile (planned) | React Native / Expo, reusing `@daveup/shared` |

## Repository layout

```
daveup/
├─ apps/
│  ├─ api/                      Fastify API
│  │  ├─ src/
│  │  │  ├─ config.ts           Environment and defaults
│  │  │  ├─ server.ts           Plugins, auth hook, error handler, routes
│  │  │  ├─ index.ts            Starts the server (port 4000)
│  │  │  ├─ db/
│  │  │  │  ├─ migrations/      Forward-only SQL migrations (0001, 0002, ...)
│  │  │  │  ├─ migrate.ts       Migration runner
│  │  │  │  ├─ pool.ts          Owner and app connections, withTenant()
│  │  │  │  └─ types.ts         Kysely table types
│  │  │  ├─ lib/                Auth context, crypto, OTP senders, audit, errors
│  │  │  └─ modules/            auth, church, disciplers (incl. admin), relationships,
│  │  │                         assessments, cycles, plans, meetings
│  │  └─ test/                  Integration tests (core-flow.test.ts)
│  └─ web/                      Next.js web app (member app and Church console)
│     ├─ app/                   Routes (see Web app below)
│     ├─ components/            UI kit, app shell, console shell, relationship panels
│     └─ lib/                   API client, session and guards, labels and formatting
├─ packages/
│  └─ shared/                   Domain rules shared by every client
│     └─ src/                   areas, questions, scoring, cycle, plans, domain, api-types
├─ infra/postgres/init/         Creates the app role and the test database (first boot only)
├─ docker-compose.yml           Local Postgres
└─ tsconfig.base.json
```

## Getting started

### Prerequisites

- Node.js 20 or newer (22 recommended)
- Docker Desktop (for local Postgres)

### 1. Install

```sh
npm install
```

### 2. Start Postgres

```sh
npm run db:up
```

Postgres runs on host port **5433** (not 5432, to avoid clashing with a local install). On first boot, `infra/postgres/init/01-roles.sql` creates:

- `daveup_owner`: owns the schema and runs migrations
- `daveup_app`: what the API uses for church data; subject to row-level security
- `daveup_test`: a separate database used only by the automated tests

### 3. Run migrations

```sh
npm run db:migrate
```

### 4. Run the API and the web app (two terminals)

```sh
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:3000
```

Open **http://localhost:3000**. The web app forwards `/api/*` to the API, so the session cookie stays same-origin.

### 5. First use

There is no seed data. Everything is created through the app:

1. Sign in with any phone number (see [Sign-in modes](#sign-in-modes)).
2. Choose **Register a church**. You become its administrator and land in the **Church console**, which shows the church code.
3. Others sign in, choose **I have a church code**, and wait for approval in the console.
4. Members ask for discipler status; the administrator approves it.
5. A member chooses a discipler (or a discipler invites them); both complete the baseline assessment.

## Configuration

The API reads its settings from environment variables. Local development works with no variables set. In production, every value marked "required in production" must be set, or the server refuses to start.

**Env files**

- **API:** copy `apps/api/.env.example` to `apps/api/.env`. The API loads it on start, including for migrations.
- **Web app:** copy `apps/web/.env.example` to `apps/web/.env.local`. Next.js loads it on start.
- **Restart** the server after editing either file.

How they behave:

- **Precedence:** variables already set in your shell or on the host always win over the file.
- **Tests:** they never read `.env`, so they always use the `daveup_test` database.
- **Git:** the real files are ignored; only the `.example` files are committed.

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

| Variable | Default (development) | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `OWNER_DATABASE_URL` | `postgres://daveup_owner:daveup_owner_dev@localhost:5433/daveup` | Required in production. Migrations, sign-in, church lookup. Bypasses RLS. |
| `APP_DATABASE_URL` | `postgres://daveup_app:daveup_app_dev@localhost:5433/daveup` | Required in production. All church-scoped requests. Subject to RLS. |
| `AUTH_SECRET` | `local-dev-secret-not-for-production` | Required in production. Hashes sign-in codes and session tokens. |
| `SESSION_DAYS` | `30` | Session lifetime |
| `BREVO_API_KEY` | (unset) | Brevo transactional email. Production needs Brevo or an SMTP server. Without either, development prints emails (and sign-in codes) in the API terminal. |
| `EMAIL_FROM` | `no-reply@daveup.local` | Required in production. Must be a sender verified in Brevo. |
| `EMAIL_FROM_NAME` | `DaveUp` | |
| `APP_URL` | `http://localhost:3000` | Required in production. Public web address, used for links in emails. |
| `APP_TIMEZONE` | `Africa/Lagos` | Time zone for dates written in emails |
| `EMAIL_PROVIDER` | `brevo` if a key is set, else `smtp` if `SMTP_HOST` is set, else `console` | `brevo`, `smtp` (Nodemailer) or `console`. `console` is refused in production. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | (unset), `587` | Any SMTP server through Nodemailer, for example Gmail with an app password (`smtp.gmail.com`, port `465`). With no host in development, a free Ethereal test mailbox is used and the API terminal prints a link to view each email. |
| `NOTIFICATION_WORKER` | `on` | `off` when a separate worker process sends the email queue |
| `OTP_PROVIDER` | `none` (or `termii` if `TERMII_API_KEY` is set) | Phone codes: `termii`, `console` or `none`. See [Sign-in modes](#sign-in-modes). |
| `TERMII_API_KEY` | (unset) | Setting it switches sign-in codes on |
| `TERMII_SENDER_ID` | `DaveUp` | |
| `TERMII_BASE_URL` | `https://api.ng.termii.com` | |
| `TERMII_CHANNEL` | `dnd` | `dnd` (SMS), `whatsapp` or `generic` |
| `ALLOW_PHONE_ONLY_SIGNIN` | (unset) | Must be `true` to run production without sign-in codes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | (unset) | Sign in with Google. Set both or neither. See [Sign-in modes](#sign-in-modes). |
| `SUPER_ADMIN_EMAILS` | (unset) | Comma-separated emails of DaveUp staff. A person whose **verified** email is listed can open the staff console. See [DaveUp staff console](#daveup-staff-console). |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | (unset) | Audio and video calls. Calls are off (buttons hidden) until all three are set. See [Calls](#calls). |
| `STORAGE_PROVIDER` | `s3` if `S3_BUCKET` is set, else `local` in development | Where shared files are kept: `s3` or `local`. `local` is refused in production; with no bucket in production, file sharing is off. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | (unset), `auto` | Any S3-compatible bucket: Cloudflare R2, AWS S3, Backblaze B2. See [Files](#files). |
| `LOCAL_STORAGE_DIR` | `apps/api/.uploads` | Development only: folder for shared files |
| `NODE_ENV` | | `test` switches to the `daveup_test` database; `production` enables secure cookies and the checks above |

The web app has one setting:

| Variable | Default | Notes |
|---|---|---|
| `API_ORIGIN` | `http://localhost:4000` | Where `/api/*` (including the `/api/realtime` WebSocket) is forwarded. Read by `next dev`, and **baked in at `next build`** for `next start`: set it before building. |

## Sign-in modes

**Email (primary).**

- **How it works:** enter your email and receive a 6-digit code (valid 10 minutes). The same step creates the account the first time. There are no passwords.
- **Codes:** stored hashed, 5 attempts allowed, and limited to 5 requests per 15 minutes per address.
- **Verified emails only:** only an email proven with a code identifies an account. Changing your email in the profile needs a code sent to the new address.
- **Sending:** codes go through Brevo, or the API terminal in development.

**Google.** "Sign in with Google" and "Sign up with Google" appear on both pages once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

- **How it works:** the API sends the browser to Google (authorisation code with PKCE, state kept in a 10-minute signed cookie) and back to `/api/auth/google/callback`. It then opens a session and continues at `/start`.
- **Accounts:** the first time, a Google account joins the DaveUp account with the same verified email, or creates one and uses the Google name. After that it is found by Google's account id (`person.google_sub`, migration 0008), so changing either email does not lock anyone out. Google accounts whose email Google has not verified are refused.
- **Setup:** in Google Cloud Console, open APIs & Services → Credentials and create an OAuth client ID of type *Web application*:
  - Authorised JavaScript origin: `https://daveup.app`.
  - Authorised redirect URI: `https://daveup.app/api/auth/google/callback`. For local testing, also add `http://localhost:3000/api/auth/google/callback` with `APP_URL=http://localhost:3000`.
  - The OAuth consent screen needs the app name, support email and the `email`, `profile` and `openid` scopes. Publish it ("In production") so anyone can sign in, not only test users.

**Phone (alternative).** Nigerian numbers are accepted as `0803 000 0000`, `+234803...` or `234803...` and stored in E.164 form.

| Mode | When | Behaviour |
|---|---|---|
| `none` | Default while no message service is set up | Phone number only, no code. **Anyone who knows a number can sign in as that person.** Production refuses this unless `ALLOW_PHONE_ONLY_SIGNIN=true`. |
| `termii` | `TERMII_API_KEY` is set | A 6-digit code by SMS or WhatsApp. Codes are stored hashed, expire after 5 minutes, allow 5 attempts, and are limited to 5 requests per 15 minutes per number. |
| `console` | `OTP_PROVIDER=console`, development only | The code is printed to the API server's terminal, never returned over HTTP. Refused in production. |

The web app asks `GET /auth/methods` and shows the code step only when codes are on. Sessions are opaque tokens: an httpOnly cookie for the web, and a bearer token for the mobile app.

## Database

### Tenancy and row-level security

- Every church-scoped table has a `church_id` and a `tenant_isolation` policy.
- Church-scoped requests run through `withTenant(churchId, fn)`. This opens a transaction as `daveup_app` and sets `app.church_id`, so a query cannot read or write another church's rows even if a `WHERE` clause is forgotten.
- With no tenant set, `daveup_app` sees nothing: the policies fail closed.
- `daveup_app` has no access to the session or sign-in code tables, and only selected columns of `person`.
- `daveup_owner` bypasses RLS. It is used only for migrations, sign-in, church registration and code lookup.

### Migrations

- Migrations are plain SQL files in `apps/api/src/db/migrations/`, applied in order and recorded in `schema_migration`.
- They are forward-only and additive: add columns with defaults and new tables, never rename or drop in place. This keeps deployments free of downtime.

```sh
npm run db:migrate                                 # apply new migrations
node node_modules/tsx/dist/cli.mjs apps/api/src/db/migrate.ts --reset   # drop and rebuild (refused in production)
```

| Migration | Adds |
|---|---|
| `0001_core.sql` | Tables: person, sign-in codes, sessions, churches, memberships, discipler status, relationships, assessments and answers, audit log. Also the RLS policies and grants. |
| `0002_cycle_plan_meetings.sql` | Monthly assessment cycles, growth plans, practices and the practice log, weekly reflections, meetings and their records |
| `0003_church_proposals.sql` | Church-suggested pairings: `initiated_by = 'church'`, plus each person's acceptance |
| `0004_email_and_notifications.sql` | Email sign-in (phone optional, verified unique email), email codes, and the `notification` outbox |

## Testing

```sh
npm test            # shared unit tests, then API integration tests
npm run typecheck   # all workspaces
```

- **Shared tests** cover scoring, "no occasion yet", gap levels, phone parsing, cycle timing and grace, the question rotation, and progress wording.
- **API tests** (`apps/api/test/core-flow.test.ts`) rebuild the `daveup_test` database and drive the real HTTP API through the whole flow:
  - sign-in, church registration, joining and approvals, and the admin members list and overview
  - relationship consent, the 12-disciple limit, independent baselines revealed together, and ending with a concern
  - row-level security between churches
  - monthly checks, growth plans and meetings
- **Test data:** the tests create their own data in `daveup_test` only. The development database never receives sample data.

## What is built

**Member app**
- **Sign-in and onboarding:** phone sign-in, profile, then register a church or join with a church code (pending until approved).
- **Disciplers and relationships:**
  - Members ask for discipler status, and the church approves it.
  - A disciple chooses an approved discipler, or a discipler invites a member. The disciple confirms a disclosure of what will be shared.
- **Baseline assessment:**
  - 60 questions about yourself (Test B) and 60 by the discipler about the disciple (Test A).
  - Answered alone, saved as you go, and revealed together.
  - The comparison shows per-area scores out of 20, gaps, and a suggested starting point.
- **Growth plan:**
  - One to three focus areas, 30, 60 or 90 days, and weekly practices from templates or your own.
  - Both people confirm it. The disciple ticks practice days and writes a weekly reflection that the discipler can read.
- **Meetings:** schedule, a guided 8-step meeting, and a one-minute record (editable for 24 hours) that can schedule the next meeting.
- **Monthly check:**
  - 12 questions each month (the full 60 every third month), answered alone and revealed together.
  - 14 days of grace, and progress described in words.
- **Layout and screens:**
  - Responsive: phone layout under 768px, icon rail on tablets, full sidebar on desktop.
  - Home screen with "Me" and "My disciples" views.
  - Assessments hub.

**Church console** (administrators)
- **Overview:** counts, what needs attention, discipleship coverage and the church code.
- **Approvals:** new members and discipler requests.
- **Members:** everyone registered, with roles, discipler, how many people they disciple, and when they joined. Search and filters. Tick members without a discipler to suggest one for all of them at once.
- **Member page:**
  - Edit the department and grant or remove the administrator role (the last administrator can't be removed).
  - Suspend, reinstate or revoke discipler status.
  - Suggest a discipler, or withdraw a suggestion.
  - See the history of admin and discipleship decisions.
  - Remove them from the church.
- **Settings:** church details, the administrator's account, and sign out.
- **Cells:** create cells, choose their leaders and members, archive or reopen them. See [Chat, cells, calls and files](#chat-cells-calls-and-files).
- **Privacy:** the console shows counts and roles only, never assessment answers or reflections.

**Messages and cells** (everyone): direct chats, cell chats, shared files and documents, voice and video calls. See [Chat, cells, calls and files](#chat-cells-calls-and-files).

**DaveUp staff console** (super administrators): verify, suspend and reinstate churches, change plans, find people, grant staff access. See [DaveUp staff console](#daveup-staff-console).

## Chat, cells, calls and files

**Who can talk to whom**
- **Direct chats:** any approved member can message any other approved member of the **same church**. Never across churches (row-level security enforces it, like everything else).
- **Cells** are small groups with their own chat, shared files and group calls. Church administrators create cells and choose their leaders. Leaders and administrators add and remove members, rename the cell and make other leaders. Members can leave. A cell always keeps at least one leader.
- **Administrators** manage any cell from the Church console, but can only read a cell's messages and files if they are in it (they can add themselves).
- **Archived cells** stay readable but nobody can post or call.

**Messages**
- Text up to 4,000 characters, links made clickable, editable by the sender for 24 hours.
- The sender can delete their own message; in a cell, leaders and administrators can delete any message. Deleting erases the text (and the file) for good.
- Unread counts per conversation and in the navigation. People added to a cell start "caught up" and can scroll back through the history.
- People added to a cell get an email (if they have email notifications on).

**Realtime.** Each browser tab keeps one WebSocket to `/api/realtime` (forwarded by Next.js like the rest of `/api`, so the session cookie works). The API publishes events with Postgres `NOTIFY`, inside the transaction that made the change, so nothing is announced for a change that rolled back. Every API instance `LISTEN`s and forwards events to the people connected to it, so it scales across instances with no Redis. Events carry ids and names only: clients fetch content over HTTP, where access is checked.

### Calls

Voice and video calls in any direct chat or cell, through [LiveKit](https://livekit.io): up to 50 people, screen sharing on desktop, mute and camera controls, and a minimised view so people can keep chatting.

- Starting a call posts a call message and rings the other members. A one-to-one call stops ringing after 45 seconds, and ends when either person hangs up or the other declines.
- A cell call carries on until everyone has left. The API checks LiveKit every 30 seconds, so a call ends even if someone just closes the tab.
- The API signs a short-lived LiveKit token per person (no LiveKit SDK on the server). The browser downloads the LiveKit client only when a call starts.

**Set up:** create a project at [cloud.livekit.io](https://cloud.livekit.io) (free tier) or self-host LiveKit, then set `LIVEKIT_URL` (`wss://…`), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the API.

**Local development:** run a LiveKit dev server with `livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1`, then set `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey` and `LIVEKIT_API_SECRET=secret`. On a Mac, run the native binary (`brew install livekit`), not Docker: Docker Desktop's networking breaks WebRTC media between the browser and the container.

### Files

Share files and documents (up to 50 MB each) in any chat or cell: attach, drag and drop, or paste. Images show in the chat. PDFs, video and audio open in the browser; anything else downloads. HTML, SVG and other active content is always downloaded, never shown. Each conversation's **Files** tab lists everything shared there.

- The browser uploads straight to the bucket with a signed link valid for 15 minutes. The API then checks the stored size before posting the file.
- Downloads go through `/api/files/:id/download`, which checks that the person is in the conversation, then redirects to a signed link valid for 5 minutes.
- Object keys are made from ids only (`church/conversation/file`). Uploads that are never confirmed are removed after a day.

**Set up (Cloudflare R2 example):**
1. Create a bucket and an R2 API token with read and write access to it.
2. Set `S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` on the API.
3. Add a CORS rule to the bucket so browsers can upload from your site:

```json
[{ "AllowedOrigins": ["https://daveup.app"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

For AWS S3 use `S3_ENDPOINT=https://s3.<region>.amazonaws.com` and the bucket's region. In development, files go to `apps/api/.uploads` (ignored by Git).

## Plans and billing (Paystack)

Plans follow PRD section 17. Basic is free: 3 disciplers, 36 disciples and 3 cells. Standard is ₦70,000 a month at the founding price, locked for 12 months from a church's first payment (list price ₦100,000), with 12 disciplers, 144 disciples and unlimited cells. An extra capacity block costs ₦30,000 a month and adds 3 disciplers, 36 disciples and 3 cells. Yearly billing charges 10 months. DaveUp staff set Pro and Network plans by hand in the staff console, along with pilots. Prices and limits are in `packages/shared/src/billing.ts`.

- **Limits** only stop new additions: approving a discipler, accepting a disciple, creating a cell. Nobody already in loses access.
- **Checkout:** the administrator chooses a plan under **Billing** in the church console and pays on Paystack's own page by card, bank transfer or USSD. A payment is applied once, after Paystack confirms the exact amount. Confirmation comes when the administrator returns to `/admin/billing/return`, or through the webhook, whichever is first.
- **Changes:** anything that adds capacity, or moves to yearly, is paid now, with credit for the unused part of the current period. Smaller plans and cancellations take effect when the paid period ends.
- **Renewals:** a background job in the API (every 5 minutes) charges the saved card when a period ends. Churches without a card get an email 3 days before. A failed or unpaid renewal starts 14 days of grace, with a daily retry; after that the church returns to Basic. Staff grants with an end date also return to Basic when they end.
- **Emails:** receipts, payment problems and the end of a plan go to church administrators even if they turned notifications off. "Talk to us" enquiries go to DaveUp staff.

**Set up:**
1. In the Paystack dashboard, copy the **secret key** from Settings → API Keys & Webhooks. Use `sk_test_…` while testing and `sk_live_…` for real money. Set it as `PAYSTACK_SECRET_KEY` on the API.
2. On the same page, set the **Webhook URL** to `https://daveup.app/api/billing/paystack/webhook`.
3. Optional: when the founding offer closes, set `FOUNDING_PRICE_OPEN=false`. Churches already on the founding price keep it until their 12 months end.

Without a secret key, online payment is off: the billing screens show plans and usage, and ask churches to contact DaveUp.

## DaveUp staff console

The staff console (`/staff`) is for DaveUp's own team, not churches.

- **Overview:** churches by status, people, members, cells, and messages, calls and storage used.
- **Churches:** search and filter. Verify a new church, suspend it (a reason is required), or reinstate it. A suspended church's members see "Access paused" and the API refuses their requests; nothing is deleted. The church's administrators are emailed on verify, suspend and reinstate. Change the plan.
- **People & staff:** find anyone by name, email or phone, and give or remove staff access. Staff need a verified email.
- **Activity:** every staff action, newest first. Everything is in the audit log.

Staff see who belongs where and how much DaveUp is used. They never see message text, files, assessment answers, reflections or meeting notes.

**The first staff member:** set `SUPER_ADMIN_EMAILS=you@example.org` on the API and sign in with that email. Staff named there can't be removed from inside the app; others can be added and removed in the console. Staff who are not in a church land in the staff console after signing in; staff who are church members reach it from the sidebar or Account settings.

## Email notifications

Events queue a row in the `notification` table **in the same transaction** as the change, so nothing is lost and nothing is sent for a change that rolled back. A background sender in the API process (`lib/notify.ts`) delivers the queue through Brevo:

- **Timing:** it runs every 5 seconds.
- **Scaling:** rows are claimed with `SKIP LOCKED`, so several API servers can share the queue.
- **Retries:** after 1, 5, 30 and 120 minutes, then the row is marked `failed`.
- **Skipping:** people with no verified email, or with notifications turned off, are skipped.

| Event | Who gets it |
|---|---|
| Someone asks to join / asks for discipler status | Church administrators |
| Membership approved, discipler status decided | That person |
| Discipleship request, invitation or church suggestion | The person asked (both for a suggestion) |
| Accepted, results ready, plan proposed / started | The other person / both |
| Meeting scheduled, monthly check open | The other person / both |
| Relationship ended | The other person (never the reason or a concern) |

Emails contain names and a link only. They never include scores, answers, reflections or meeting notes. People switch them off under Account settings.

## Key product rules

These are enforced in the API and the database, not only in the UI.

| Rule | Where |
|---|---|
| A discipler has at most 12 places; accepted, active and paused relationships each use one | `relationships.ts` (row lock on discipler status) |
| A church can suggest a discipler, but nobody is paired without agreeing: both people accept and the disciple confirms disclosure | `admin-members.ts`, accept route |
| A church always keeps at least one administrator; removal ends church access only, never the account | `admin-members.ts` |
| A disciple has one current discipler | Unique partial index `relationship_one_primary` |
| The disciple must confirm what the discipler will see | `CreateRelationshipSchema`, accept route |
| Answers are visible only to the person who wrote them | `requireOwnAssessment` returns 404 to anyone else |
| Results appear only when both have finished | `progressPoints`, comparison route |
| "No occasion yet" is left out of the area score | `scoreAreas` in `@daveup/shared` |
| A self-assessment can be reused as a baseline within 30 days; monthly checks never count as baselines | `linkBaselinesAndActivate` |
| Plans, practice and reflection open only when the relationship is active; meetings from acceptance | `party.ts` |
| Only the disciple ticks practice and writes the reflection | `plans.ts` |
| A missed check never locks anything or ends a relationship | `cycles.ts` (`ensureOpenCycle`) |
| Progress is described in words, never as a total score | `describeProgress` |
| Every decision is written to the audit log | `lib/audit.ts` |

## API overview

All routes return JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

| Area | Routes |
|---|---|
| Health | `GET /health`, `GET /ready` |
| Auth | `GET /auth/methods`, `POST /auth/email/request`, `POST /auth/email/verify`, `POST /auth/phone`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout` |
| Me and church | `GET/PATCH /me` (name, `notifyEmail`), `POST /me/email/request`, `POST /me/email/verify`, `PATCH /me/participation`, `POST /churches`, `GET /church`, `GET /churches/lookup?code=`, `POST /churches/join`, `GET /members/search?q=` |
| Disciplers | `POST /discipler-status/request`, `GET /disciplers` |
| Admin | `GET /admin/overview`, `GET /admin/approvals`, `GET /admin/members`, `GET/PATCH /admin/members/:id`, `POST /admin/members/:id/{approve,reject,remove}`, `POST /admin/discipler-status/:id/{approve,reject,suspend,revoke,reinstate}`, `POST /admin/relationships` (suggest a discipler), `POST /admin/relationships/:id/withdraw` |
| Relationships | `GET /relationships`, `GET /relationships/:id`, `POST /relationships`, `POST /relationships/:id/{accept,decline,end}` |
| Assessments | `GET /assessments`, `POST /assessments`, `GET /assessments/:id`, `PUT /assessments/:id/answers/:itemId`, `POST /assessments/:id/submit`, `GET /relationships/:id/comparison` |
| Monthly cycle | `GET /relationships/:id/progress`, `POST /cycles/:id/start` |
| Growth plan | `GET /relationships/:id/plan`, `PUT /relationships/:id/plan/draft`, `POST /relationships/:id/plan/draft/confirm`, `DELETE /relationships/:id/plan/draft`, `PUT /practices/:id/days/:day`, `PUT /relationships/:id/reflection` |
| Meetings | `GET /relationships/:id/meetings`, `POST /relationships/:id/meetings`, `POST /meetings/:id/record`, `POST /meetings/:id/cancel` |
| Chat | `GET /chat/features`, `GET /people/directory?q=`, `GET /conversations`, `GET /conversations/unread`, `POST /conversations/direct`, `GET /conversations/:id`, `GET/POST /conversations/:id/messages` (`?before=` / `?after=` seq), `POST /conversations/:id/read`, `GET/PATCH/DELETE /messages/:id` |
| Cells | `GET/POST /cells` (admins), `PATCH /cells/:id`, `POST /cells/:id/{archive,unarchive}`, `POST /cells/:id/members`, `PATCH/DELETE /cells/:id/members/:personId` |
| Files | `POST /conversations/:id/files` (upload ticket), `PUT /files/:id/content` (local storage only), `POST /files/:id/complete`, `GET /files/:id/download?inline=1`, `GET /conversations/:id/files` |
| Calls | `POST /conversations/:id/calls` (start or join), `GET /conversations/:id/call`, `POST /calls/:id/{join,leave,decline}` |
| Realtime | `GET /realtime` (WebSocket) |
| Staff | `GET /staff/overview`, `GET /staff/churches?status=&q=`, `GET /staff/churches/:id`, `POST /staff/churches/:id/{status,plan}`, `GET /staff/people?q=` (`?staff=1` lists staff), `POST /staff/super-admins`, `GET /staff/audit` |

Request schemas and response types live in `packages/shared/src/domain.ts`, `plans.ts`, `api-types.ts` and `chat.ts`.

## Web app

| Route | Screen |
|---|---|
| `/` | Welcome |
| `/signin`, `/profile`, `/start`, `/join`, `/register-church`, `/pending` | Sign-in and onboarding |
| `/home` | Member home ("Me" and "My disciples") |
| `/disciplers`, `/invite`, `/discipler-request` | Choose a discipler, invite someone, ask for discipler status |
| `/relationships/[id]` | Request, baseline, then the Results, Growth plan and Meetings tabs (`#plan`, `#meetings`) |
| `/assessments`, `/assessments/[id]` | Assessments hub and the question flow |
| `/account` | Member account |
| `/messages`, `/messages/[id]` | Messages and cells: the list beside the open conversation (phones show one at a time) |
| `/admin`, `/admin/approvals`, `/admin/members`, `/admin/members/[id]`, `/admin/cells`, `/admin/cells/[id]`, `/admin/settings` | Church console |
| `/staff`, `/staff/churches`, `/staff/churches/[id]`, `/staff/people`, `/staff/activity` | DaveUp staff console |

Administrators land in the Church console after signing in. A "Member app" link takes them to the member side if they also disciple people.

Breakpoints follow the desktop design guide:

- 1024px and up: sidebar with labels
- 768–1023px: icon-only rail
- below 768px: phone layout with a bottom tab bar
- 1280px and up: a right-hand context column on some screens

## Homepage and pictures

The public homepage is `apps/web/app/page.tsx`. Its copy describes only what DaveUp does today, and the features still being built are listed under "Coming next".

Every picture on it is listed in **`apps/web/lib/site-images.ts`**, one entry per slot. To add or replace a picture:

1. Save a web-sized copy in `apps/web/public/images/home/`: about 2000px wide and under 1 MB. On a Mac: `sips -Z 2000 -s formatOptions 74 photo.jpg --out apps/web/public/images/home/photo.jpg`.
2. Set that slot's `src`, and describe the picture in `alt` for screen readers.

Slots with `src: null` (church team, family, app preview) show a navy panel with an icon until a picture is added. Next.js serves smaller versions of each picture per screen size automatically.

## Not built yet

- **Brevo account:** set `BREVO_API_KEY` and a verified `EMAIL_FROM` before real users. SMS codes for phone sign-in still need a Termii account.
- **Reminders and background jobs:** check reminders at 3 and 7 days, telling the other person at 14 days, and the weekly brief.
- **AI features:** plan drafts, meeting preparation and summaries, and the meeting recording pipeline.
- **More console features:** member import, departments as structures, analytics, a church-wide audit log screen, and two-factor sign-in for admins.
- **Other member features:** departments, family circle, stories, Storehouse, Bible, trainings, sermon packs, push notifications, and email digests of unread messages.
- **DaveUp staff console:** disputes, support and billing operations.
- **Mobile app:** Expo.
- **Infrastructure:** CI, deployment, backups and monitoring.

## Conventions

- **No sample data:** no seed scripts, demo churches or fake codes. Data enters only through real flows, and the tests use their own database.
- **Shared rules live in `@daveup/shared`:** the API and every client use the same question bank, scoring, schemas and types.
- **Not found and not yours look the same:** routes return 404 rather than 403 for someone else's records, so IDs can't be probed.
- **Additive migrations:** never edit an applied migration; add a new numbered file.
- **Wording from the PRD:** scores are framed as development indicators, never grades or rankings. Template suggestions are labelled "for review".

## Troubleshooting

**`npm run …` fails with `diagnostics.tracingChannel is not a function`.**
npm is picking up an old Node (19) from a `node_modules` folder in a parent directory, often `~/node_modules/node`. Remove that folder, or run the tools with your shell's Node directly:

```sh
node node_modules/tsx/dist/cli.mjs watch apps/api/src/index.ts              # API
(cd apps/web && node ../../node_modules/next/dist/bin/next dev -p 3000)    # web
(cd apps/api && NODE_ENV=test node ../../node_modules/vitest/vitest.mjs run) # API tests
```

**Port 5432 is already in use.**
That's expected: DaveUp's Postgres uses 5433.

**Docker commands hang.**
Docker Desktop may have stopped responding, for example after the disk filled up. Free some space and restart Docker Desktop, then run `npm run db:up` again.

**`daveup_test` or the `daveup_app` role is missing.**
The init script runs only when the Postgres volume is first created. Run `npm run db:down`, remove the `pgdata` volume (this deletes local data), then run `npm run db:up` and migrate again.
