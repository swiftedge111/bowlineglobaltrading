# Bowline Global Trading

The Next.js frontend lives in `src/`. The Express API and its Prisma schema live in `server/`.

## Local development

Start the API on port 4000 using the [backend setup guide](server/README.md#quick-start). It uses a separate Bowline PostgreSQL database.

In another terminal, from the project root:

```bash
npm ci
# Copy the example only when .env.local does not exist.
cp -n .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If your API runs elsewhere, set `NEXT_PUBLIC_API_URL` in `.env.local` and include the `/api/v1` path.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm --prefix server run lint
npm --prefix server run typecheck
npm --prefix server test
```

See [backend testing](server/README.md#testing) for running the PostgreSQL integration tests.

## Deployment settings

Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_URL` to the new public origins before building. Include `/api/v1` in the API URL. Optional public contact settings are listed in [.env.example](.env.example).

To enable customer live chat, set `NEXT_PUBLIC_SMARTSUPP_KEY` in Vercel's project environment variables and redeploy. The chat widget uses this public key in the browser.

Set the API's `APP_URL` and `CORS_ORIGINS` to the frontend origin, and use the new database and service credentials in [server/.env.example](server/.env.example). Keep local environment files and generated output outside the initial source commit.
