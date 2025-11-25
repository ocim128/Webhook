const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const getRawBody = require('raw-body');
const { WebhookStore } = require('./store');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const DISPLAY_HOST = process.env.PUBLIC_HOST || (HOST === '0.0.0.0' ? 'localhost' : HOST);
const RESERVED_PATHS = new Set([
  'webhooks',
  'hooks',
  'health',
  'favicon.ico',
  'meta',
  'recent',
]);
const MAX_SLUG_LENGTH = 64;
const MIN_SLUG_LENGTH = 2;

async function bootstrap() {
  const app = express();
  const store = new WebhookStore(
    path.join(__dirname, '..', 'data', 'registry.json'),
    { logLimit: Number(process.env.WEBHOOK_LOG_LIMIT || 50) },
  );

  await store.init();

  const publicDir = path.join(__dirname, '..', 'public');
  const indexFile = path.join(publicDir, 'index.html');

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.static(publicDir));

  app.get('/', (_req, res) => {
    res.sendFile(indexFile);
  });

  app.get('/meta', (req, res) => {
    res.json({
      name: 'Local Webhook Relay',
      ready: true,
      management: {
        list: `${req.protocol}://${req.get('host')}/webhooks`,
        create: `${req.protocol}://${req.get('host')}/webhooks`,
        detail: `${req.protocol}://${req.get('host')}/webhooks/:slug`,
      },
      dynamicEndpointExample: `${req.protocol}://${req.get('host')}/email1`,
      note:
        'Create a slug under /webhooks first, then send any request to /:slug or /hooks/:slug to have it captured.',
      stats: store.getStats(),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/:slug', (req, res, next) => {
    const slug = normaliseSlug(req.params.slug);
    if (!slug || RESERVED_PATHS.has(slug)) {
      return next();
    }

    return res.sendFile(indexFile);
  });

  const managementRouter = express.Router();
  managementRouter.use(express.json({ limit: '1mb' }));

  managementRouter.get('/', (_req, res) => {
    res.json({ items: store.listHooks() });
  });

  managementRouter.get('/recent', (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    res.json({ items: store.listRecentEntries(limit) });
  });

  managementRouter.get('/stats', (_req, res) => {
    res.json({ stats: store.getStats() });
  });

  managementRouter.post('/', async (req, res, next) => {
    try {
      const { slug, description = '', metadata = {} } = req.body || {};
      const normalisedSlug = normaliseSlug(slug);
      validateSlug(normalisedSlug);
      ensureMetadata(metadata);
      guardReservedSlug(normalisedSlug);

      const existing = store.getHook(normalisedSlug);
      if (existing) {
        return res.status(200).json({
          hook: existing,
          endpoint: buildHookUrl(req, normalisedSlug),
          alreadyExisted: true,
        });
      }

      const hook = await store.createHook({
        slug: normalisedSlug,
        description: description?.trim() || '',
        metadata,
      });

      res.status(201).json({
        hook,
        endpoint: buildHookUrl(req, normalisedSlug),
        alreadyExisted: false,
      });
    } catch (err) {
      next(err);
    }
  });

  managementRouter.get('/:slug', (req, res) => {
    const slug = normaliseSlug(req.params.slug);
    const hook = store.getHook(slug);
    if (!hook) {
      return res.status(404).json({ error: `Webhook "${slug}" not found.` });
    }

    return res.json({ hook });
  });

  managementRouter.delete('/:slug', async (req, res) => {
    const slug = normaliseSlug(req.params.slug);
    const deleted = await store.deleteHook(slug);
    if (!deleted) {
      return res.status(404).json({ error: `Webhook "${slug}" not found.` });
    }

    return res.json({ deleted: true, slug });
  });

  managementRouter.post('/:slug/reset', async (req, res, next) => {
    try {
      const slug = normaliseSlug(req.params.slug);
      const hook = await store.clearLogs(slug);
      res.json({ reset: true, hook });
    } catch (err) {
      next(err);
    }
  });

  app.use('/webhooks', managementRouter);

  const hookHandler = createDynamicHandler(store);
  app.all('/hooks/:slug', hookHandler);
  app.all('/:slug', hookHandler);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Unexpected server error',
    });
  });

  app.listen(PORT, HOST, () => {
    console.log(
      `Webhook server listening on http://${HOST}:${PORT} (open http://${DISPLAY_HOST}:${PORT}/ in your browser)`,
    );
  });
}

function buildHookUrl(req, slug) {
  const host = req.get('host');
  const protocol = req.protocol;
  return {
    short: `${protocol}://${host}/${slug}`,
    explicit: `${protocol}://${host}/hooks/${slug}`,
  };
}

function normaliseSlug(value) {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateSlug(slug) {
  if (!slug) {
    const err = new Error('A slug is required.');
    err.statusCode = 400;
    throw err;
  }

  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) {
    const err = new Error(
      `Slug must be between ${MIN_SLUG_LENGTH} and ${MAX_SLUG_LENGTH} characters.`,
    );
    err.statusCode = 400;
    throw err;
  }

  const valid = /^[a-z0-9@._-]+$/.test(slug);
  if (!valid) {
    const err = new Error(
      'Slug may only contain letters, numbers, @, ., _, and - characters.',
    );
    err.statusCode = 400;
    throw err;
  }
}

function guardReservedSlug(slug) {
  if (RESERVED_PATHS.has(slug)) {
    const err = new Error(`The slug "${slug}" is reserved.`);
    err.statusCode = 400;
    throw err;
  }
}

function ensureMetadata(metadata) {
  if (metadata === null || metadata === undefined) {
    return;
  }

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    const err = new Error('Metadata must be an object.');
    err.statusCode = 400;
    throw err;
  }
}

function createDynamicHandler(store) {
  return async (req, res, next) => {
    const slug = normaliseSlug(req.params.slug);
    if (!slug || RESERVED_PATHS.has(slug)) {
      return next();
    }

    if (req.method?.toUpperCase() !== 'POST') {
      return res.status(405).json({
        error: 'Only POST requests are accepted on this webhook endpoint.',
      });
    }

    const hook = store.getHook(slug);
    let targetHook = hook;
    if (!targetHook) {
      try {
        targetHook = await store.createHook({
          slug,
          description: '',
          metadata: {},
        });
      } catch (err) {
        return next(err);
      }
    }

    try {
      const rawBody = await safeReadBody(req);
      const payloadSummary = summarisePayload(rawBody);
      const entry = {
        id: Date.now().toString(36),
        timestamp: new Date().toISOString(),
        ...payloadSummary,
      };
      await store.recordHit(slug, entry);

      return res.json({
        stored: true,
        slug,
        reference: entry.id,
        receivedAt: entry.timestamp,
        size: entry.byteSize,
        isJson: entry.isJson,
        note: 'Payload captured successfully.',
      });
    } catch (err) {
      return next(err);
    }
  };
}

async function safeReadBody(req) {
  if (req.readableEnded) {
    return '';
  }

  try {
    const buffer = await getRawBody(req, {
      encoding: true,
      limit: process.env.WEBHOOK_PAYLOAD_LIMIT || '2mb',
    });
    return buffer;
  } catch (err) {
    if (err.type === 'entity.too.large') {
      err.statusCode = 413;
    }
    throw err;
  }
}

function summarisePayload(rawBody) {
  const body = typeof rawBody === 'string' ? rawBody : rawBody?.toString?.() ?? '';
  const byteSize = Buffer.byteLength(body || '', 'utf8');
  let isJson = false;
  let formatted = null;

  if (body) {
    try {
      const parsed = JSON.parse(body);
      formatted = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch (err) {
      formatted = null;
    }
  }

  const bodyPreview = (formatted || body || '').slice(0, 600);

  return {
    body,
    bodyPreview,
    formatted,
    isJson,
    byteSize,
  };
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

module.exports = { bootstrap };
