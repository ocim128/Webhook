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

### Health & base info

- `GET /meta` returns basic usage metadata.
- `GET /health` is a simple readiness probe.
- `GET /webhooks/recent?limit=25` returns a JSON feed of the latest stored deliveries across all slugs.
- `GET /webhooks/stats` exposes aggregate counters (total hooks, total hits, hits in the last 24h, and last delivery timestamps) for dashboards/monitoring.
- Only POST requests trigger storage; all other methods on webhook paths return 405 and are ignored.

### Next steps for deployment

- Swap the `WebhookStore` implementation with a MongoDB-backed variant while keeping the same API contract.
- Deploy the Express app to Render (or any Node host) and update DNS/webhook senders to target the hosted URL.
