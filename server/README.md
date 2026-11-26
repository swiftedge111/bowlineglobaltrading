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

---

## Architecture

```
src/
├── config/      env.ts (Zod-validated, fails fast), constants.ts
├── lib/         prisma · logger · errors · money · crypto · http · storage
├── middleware/  authenticate · authorize · validate · rate-limit · error-handler · upload
├── modules/     one folder per domain: routes + controller + service + schema
├── services/    ledger · audit · email (cross-cutting business logic)
├── jobs/        cron: expire-pins · accrue-plan-returns
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
| POST | `/subscriptions/:id/cancel` | Returns the principal |

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
npm start
```

Set `NODE_ENV=production`, a real `CORS_ORIGINS`, and `COOKIE_DOMAIN` if the
API and frontend share a parent domain. The app trusts one proxy hop
(`trust proxy: 1`) for correct client IPs behind Render/Vercel/nginx.

`SIGTERM`/`SIGINT` drain connections and disconnect Prisma, with a 10-second
hard timeout.
