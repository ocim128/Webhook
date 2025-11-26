## Local Webhook Relay

This project provides a small Express server that lets you create custom webhook parameters (slugs) and capture any traffic that hits them. It is designed for local development now and mirrors the behaviour we plan to back with MongoDB later.

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm (bundled with Node)

### Getting started

```bash
npm install
npm run dev   # starts nodemon for local iteration
# or
npm start     # runs the server once
```

By default the server listens on `http://localhost:4000`. Configure `PORT`, `HOST`, `WEBHOOK_LOG_LIMIT`, or `WEBHOOK_PAYLOAD_LIMIT` through environment variables if needed. Even if the console prints `http://0.0.0.0:4000`, open `http://localhost:4000/` in your browser (or set `PUBLIC_HOST` if you want a different announcement host).

Then open [http://localhost:4000](http://localhost:4000) in your browser. The landing page only shows the "claim username/slug" form along with live stats for total hooks and hits - perfect for production kiosks or a lightweight operator console. Each slug has its own dashboard at `http://localhost:4000/<slug>` where you can copy endpoints, see formatted payloads, refresh logs, reset/delete the webhook, and view hit metrics.

### Managing webhook parameters

1. **Create a slug** (example for backing up `email1@example.com` to `/email1`):

   ```bash
   curl -X POST http://localhost:4000/webhooks \
     -H "Content-Type: application/json" \
     -d '{"slug":"email1"}'
   ```

   The response contains both the short (`/:slug`) and explicit (`/hooks/:slug`) URLs you can send traffic to.

2. **List all registered slugs**:

   ```bash
   curl http://localhost:4000/webhooks
   ```

3. **Inspect logs for a single slug**:

   ```bash
   curl http://localhost:4000/webhooks/email1
   ```

4. **Reset logs / hit counters**:

   ```bash
   curl -X POST http://localhost:4000/webhooks/email1/reset
   ```

5. **Delete a slug** (and free up the path):

   ```bash
   curl -X DELETE http://localhost:4000/webhooks/email1
   ```

### Sending data to a slug

After creating `email1` (or letting the service auto-create it on the first POST), any POST request to `http://localhost:4000/email1` or `http://localhost:4000/hooks/email1` will be captured. Example:

```bash
curl -X POST http://localhost:4000/email1 \
  -H "Content-Type: application/json" \
  -d '{"subject":"Weekly backup","payload":"example"}'
```

You will receive a confirmation response while the raw POST body is stored locally under `data/registry.json` (headers and query strings are intentionally discarded). The service keeps the latest 50 deliveries per slug by default (configure via `WEBHOOK_LOG_LIMIT`). Open `http://localhost:4000/email1` in your browser at any time to see the live list of payloads for that slug.

### Using MongoDB storage

Set `MONGODB_URI` to switch persistence from the local JSON file to MongoDB. Optional overrides:

- `MONGODB_DB_NAME` – Database name (defaults to `webhook-relay`).
- `MONGODB_COLLECTION` – Collection that stores slugs/logs (defaults to `hooks`).

When `MONGODB_URI` is present the service automatically initializes the Mongo-backed store (the file fallback is still available for local-only runs). To prepare MongoDB for the app:

1. Provision a MongoDB deployment (MongoDB Atlas, Render, ScaleGrid, etc.) and copy the connection string.
2. Ensure the user in that connection string has read/write access to the target database.
3. Set `MONGODB_URI`, `MONGODB_DB_NAME`, and `MONGODB_COLLECTION` (optional) in your local `.env`, Render dashboard, or deployment platform.
4. Restart the server. It will create a unique index on `slug` automatically and begin persisting webhooks/logs to the specified collection.

### Locking down management endpoints

Set `ADMIN_ACCESS` to any secret string to protect the `/webhooks` listing endpoint (the one that reveals every registered slug). When enabled, only requests that include the token via the `x-admin-access` header or a `?admin=token` query string can see that list. You can also visit `http://<host>/<ADMIN_ACCESS>` in the browser to open an admin overview of every slug. All other slug-specific actions stay public for easier testing; rotate or remove the token if it ever leaks.

### Health & base info

- `GET /meta` returns basic usage metadata.
- `GET /health` is a simple readiness probe.
- `GET /webhooks/recent?limit=25` returns a JSON feed of the latest stored deliveries across all slugs.
- `GET /webhooks/stats` exposes aggregate counters (total hooks, total hits, hits in the last 24h, and last delivery timestamps) for dashboards/monitoring.
- Only POST requests trigger storage; all other methods on webhook paths return 405 and are ignored.

### Next steps for deployment

- Configure `MONGODB_URI` (and related options) plus `PUBLIC_HOST`/`PORT` on Render so the service writes directly to hosted MongoDB storage.
- Deploy the Express app to Render (or any Node host) and update DNS/webhook senders to target the hosted URL.
- Deploying to Vercel? Use the provided `api/index.js` serverless bridge and `vercel.json` rewrites so every request hits the Express handler. Set the same environment variables in Vercel’s dashboard.
