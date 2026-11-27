# Bowline Global Trading API

The Bowline Global Trading REST API uses Node 22+, TypeScript, Express 5, and PostgreSQL via Prisma.

---

## Quick start

Create an empty PostgreSQL database for Bowline. The initial migration creates
the schema and enables `citext` for case-insensitive usernames. It contains no
customer accounts, transactions, or payment destinations.

```bash
createdb bowline_global_trading
cd server
cp -n .env.example .env       # configure the database URL and JWT secrets
npm ci
npm run prisma:deploy
npm run seed                  # optional plans and configured admin account
npm run dev                   # http://localhost:4000
```

Verify it is up:

```bash
curl http://localhost:4000/api/v1/health
# {"success":true,"data":{"status":"healthy","database":true}}
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Watch mode via tsx |
| `npm run build` | Generate Prisma client + compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run prisma:migrate` | Create + apply a migration |
| `npm run prisma:studio` | Browse the database |
| `npm run seed` | Seed admin + plans (idempotent) |
| `npm run db:lockdown` | Close the Supabase Data API off from every table (see [Supabase lockdown](#supabase-lockdown)) |

---

## Architecture

```
src/
├── config/      env.ts (Zod-validated, fails fast), constants.ts
├── lib/         prisma · logger · errors · money · crypto · http · storage
├── middleware/  authenticate · authorize · validate · rate-limit · error-handler · upload
├── modules/     one folder per domain: routes + controller + service + schema
├── services/    ledger · audit · email (cross-cutting business logic)
├── jobs/        in-process schedule: accrue-plan-returns (hourly + at startup)
├── app.ts       Express assembly
└── index.ts     bootstrap
```

**The layering rule:** controllers handle HTTP only — parse the request, call a
service, shape the response. Services hold business logic and never touch
`req`/`res`. Only services talk to Prisma. Keeping to this is what makes the
codebase navigable.

### The ledger

`src/services/ledger.service.ts` is the single source of truth for money.

```
balance   = Σ(COMPLETED CREDIT) − Σ(COMPLETED DEBIT)
available = balance − Σ(PENDING DEBIT)
```

Each account balance is calculated from the `Transaction` table on read, so
the ledger remains the source of truth for deposits and withdrawals.

Pending debits are subtracted from `available`, so requesting a withdrawal
reserves the funds immediately.

`debit()` takes a `SELECT … FOR UPDATE` row lock on the user and re-checks the
balance **inside** the same transaction that inserts the row, which is what
makes concurrent withdrawals safe.

**Money is `Decimal(18,2)` everywhere — never a JS float.**

---

## API

Base path `/api/v1`. Every response uses one envelope:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "INSUFFICIENT_FUNDS", "message": "…", "details": [] } }
```

Error codes: `VALIDATION_ERROR` `UNAUTHENTICATED` `INVALID_CREDENTIALS`
`TOKEN_EXPIRED` `FORBIDDEN` `NOT_FOUND` `CONFLICT` `INSUFFICIENT_FUNDS`
`INVALID_PIN` `RATE_LIMITED` `PAYLOAD_TOO_LARGE` `UNSUPPORTED_MEDIA_TYPE`
`SERVICE_UNAVAILABLE` `INTERNAL_ERROR`

### Auth

Access token in `Authorization: Bearer <token>` (15 min default). Refresh token
in an httpOnly `bowline_refresh` cookie (30 days), rotated on every use. Requests
that touch the cookie need `credentials: "include"`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | Rate limited 10/15min |
| POST | `/auth/login` | — | Accepts email **or** username as `identifier` |
| POST | `/auth/refresh` | cookie | Rotates the refresh token |
| POST | `/auth/logout` | cookie | Revokes this session |
| POST | `/auth/logout-all` | token | Revokes every session |
| POST | `/auth/forgot-password` | — | Always 200, never reveals whether the address exists |
| POST | `/auth/reset-password` | — | Token is single-use; signs out all devices |
| GET | `/auth/me` | token | Current user |

### User

| Method | Path | Notes |
|---|---|---|
| GET / PATCH | `/users/me` | Profile |
| POST | `/users/me/change-password` | Signs out all devices |
| GET | `/portfolio` | Balances + holdings + derived figures |
| GET | `/portfolio/performance?period=7d\|1m\|3m\|1y\|all` | UTC-bucketed, zero-filled series |
| GET | `/transactions?page&limit&type&status&category` | Paginated ledger |
| GET | `/holdings` | Active positions |
| GET | `/deposits/methods` | Where to send money |
| POST / GET | `/deposits` | Submit request (multipart, `proof` file) / list own |
| POST / GET | `/withdrawals` | Requires `pin`; reserves funds |
| POST | `/withdrawals/:id/cancel` | While still pending |
| GET | `/plans` | **Public** |
| GET / POST | `/subscriptions` | Subscribe to a plan |
| POST | `/subscriptions/:id/cancel` | Pays any owed periods, then returns the principal |

### Admin — `requireRole('ADMIN')` on every route

`/admin/stats` · `/admin/users` (paginated + search) · `/admin/users/:uid` ·
`PATCH /admin/users/:uid/status` · `POST /admin/users/:uid/adjustments`
(credit **or** debit) · holdings CRUD · `/admin/deposits` +
`/admin/deposits/:id/process` + `/admin/deposits/:id/proof` (signed URL) ·
`/admin/withdrawals` + `/admin/withdrawals/:id/process` ·
`POST /admin/users/:uid/pins` · `GET|DELETE /admin/pins` ·
`/admin/payment-methods/{bank,crypto,wallets}` · `/admin/audit-logs`

### Withdrawal flow

1. Admin issues a PIN: `POST /admin/users/:uid/pins` → raw PIN returned **once**.
2. User submits `POST /withdrawals` with the PIN in the body. In one database
   transaction the API verifies the PIN (right owner, active, unexpired), marks
   it `USED`, re-checks the available balance, and inserts a `PENDING` debit
   that reserves the funds.
3. Admin approves (`COMPLETED`, money stays gone) or rejects (`REJECTED`,
   reservation released). Both send email and write an audit log entry.

PINs need no expiry job. `consumePin` and the share link check `expiresAt`
themselves, and lapsed PINs are marked `EXPIRED` whenever an admin lists,
issues or revokes PINs, so the admin view is always accurate.

### Plan returns

A plan pays its daily return **once per full 24 hours after the subscription
starts**. Period *k* ends at `startedAt + k days`, so a 30-day plan pays exactly
30 times, then returns the principal. Subscribing at 23:59 does not earn a day's
return at midnight.

`accruePlanReturns()` works out what each subscription is owed from the clock
and `accruedPeriods`, the count already paid, and pays all of it:

- **Late runs catch up.** Every missed period is paid, each as its own ledger
  entry dated to when it was earned, so balances, the performance chart and
  "today's profit" stay right however late the job runs.
- **Repeat runs are safe.** Each subscription is claimed with a compare-and-swap
  on `accruedPeriods`, so concurrent or repeated runs never pay a period twice.
- **Cancelling settles first.** Owed periods are paid before the principal is
  returned. A plan whose term has already ended completes instead.

It is triggered three ways, and none of them needs to be punctual:

1. In-process, hourly at :05 (`src/jobs/index.ts`).
2. Once at startup, which catches up after downtime or sleep.
3. `POST /api/v1/internal/jobs/accrue-plan-returns` with
   `Authorization: Bearer $CRON_SECRET`, for an external scheduler. This wakes
   an instance that a host has idled. [`prisma/supabase-cron.sql`](prisma/supabase-cron.sql)
   sets it up with Supabase pg_cron. Without `CRON_SECRET` the endpoint returns
   404.

---

## Environment

See `.env.example`. Startup validates everything and exits with a readable
message if anything is missing.

Notes:

- `DATABASE_URL` is the connection to the fresh Bowline PostgreSQL database.
  Set `DIRECT_URL` to a direct connection to the same database if the runtime
  connection uses a transaction pooler. The migration role must be able to
  enable `citext`, or the database provider must enable it beforehand.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must differ. Generate with
  `openssl rand -base64 48`.
- `SUPABASE_*` and `RESEND_API_KEY` are optional in development (uploads and
  email degrade to no-ops) and **required** in production.
- `CRON_SECRET` (32+ characters) enables the internal job endpoint. Set it on
  the API and in Supabase Vault (see `prisma/supabase-cron.sql`) to the same
  value. Generate with `openssl rand -base64 48`.

---

## Testing

```bash
npm test                                            # logic tests only
TEST_DATABASE_URL="postgresql://…" npm test         # + ledger and PIN suites
```

The ledger and PIN suites need a real Postgres — they exercise row locks,
isolation levels and concurrent transactions, which no in-memory fake
reproduces. Use a scratch database:

```bash
createdb bowline_global_trading_test
test_database_url="postgresql://$USER@127.0.0.1:5432/bowline_global_trading_test"
DIRECT_URL="$test_database_url" DATABASE_URL="$test_database_url" npm run prisma:deploy
TEST_DATABASE_URL="$test_database_url" npm test
```

---

## Deployment

```bash
npm ci
npm run build
npx prisma migrate deploy
npm run db:lockdown
npm start
```

### Supabase lockdown

Supabase serves the `public` schema over its Data API. This backend doesn't
use that API, so `npm run db:lockdown` closes it off. It runs
[`prisma/supabase-lockdown.sql`](prisma/supabase-lockdown.sql), which enables
row-level security on every table and revokes the `anon` and `authenticated`
roles' access, including on tables that later migrations create. The backend
owns the tables, so it bypasses RLS and is unaffected.

Run it after every `migrate deploy`. It is idempotent and takes a second. If
you forget, new tables are still unreadable through the API, because the
default privileges are already revoked, but RLS stays off on them until the
script runs again. On plain PostgreSQL it only enables RLS.

Set `NODE_ENV=production`, a real `CORS_ORIGINS`, and `COOKIE_DOMAIN` if the
API and frontend share a parent domain. The app trusts one proxy hop
(`trust proxy: 1`) for correct client IPs behind Render/Vercel/nginx.

`SIGTERM`/`SIGINT` drain connections and disconnect Prisma, with a 10-second
hard timeout.
