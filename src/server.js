const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const getRawBody = require('raw-body');
const { createWebhookStore } = require('./store');

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
const ADMIN_ACCESS_TOKEN = (process.env.ADMIN_ACCESS || '').trim();
const ADMIN_ACCESS_SLUG = ADMIN_ACCESS_TOKEN ? normaliseSlug(ADMIN_ACCESS_TOKEN) : '';

async function bootstrap() {
  const app = express();
  const logLimit = Number(process.env.WEBHOOK_LOG_LIMIT || 50);
  const store = createWebhookStore({
    mongoUri: process.env.MONGODB_URI,
    mongoDbName: process.env.MONGODB_DB_NAME,
    mongoCollection: process.env.MONGODB_COLLECTION,
    filePath: path.join(__dirname, '..', 'data', 'registry.json'),
    logLimit,
  });

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

  app.get(
    '/meta',
    asyncHandler(async (req, res) => {
      const stats = await store.getStats();
      res.json({
        name: 'Local Webhook Relay',
        ready: true,
        adminProtected: Boolean(ADMIN_ACCESS_TOKEN),
        management: {
          list: `${req.protocol}://${req.get('host')}/webhooks`,
          create: `${req.protocol}://${req.get('host')}/webhooks`,
          detail: `${req.protocol}://${req.get('host')}/webhooks/:slug`,
        },
        dynamicEndpointExample: `${req.protocol}://${req.get('host')}/email1`,
        note:
          'Create a slug under /webhooks first, then send any request to /:slug or /hooks/:slug to have it captured.',
        stats,
      });
    }),
  );

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

  managementRouter.get(
    '/',
    enforceAdminAccess,
    asyncHandler(async (_req, res) => {
      const items = await store.listHooks();
      res.json({ items });
    }),
  );

  managementRouter.get(
    '/recent',
    asyncHandler(async (req, res) => {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
      const items = await store.listRecentEntries(limit);
      res.json({ items });
    }),
  );

  managementRouter.get(
    '/stats',
    asyncHandler(async (_req, res) => {
      const stats = await store.getStats();
      res.json({ stats });
    }),
  );

  managementRouter.post(
    '/',
    asyncHandler(async (req, res) => {
      const { slug, description = '', metadata = {} } = req.body || {};
      const normalisedSlug = normaliseSlug(slug);
      validateSlug(normalisedSlug);
      ensureMetadata(metadata);
      guardReservedSlug(normalisedSlug);

      const existing = await store.getHook(normalisedSlug);
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
    }),
  );

  managementRouter.get(
    '/:slug',
    asyncHandler(async (req, res) => {
      const rawSlug = req.params.slug || '';
      const slug = normaliseSlug(rawSlug);
      const isAdminSlug = ADMIN_ACCESS_SLUG && slug && slug === ADMIN_ACCESS_SLUG;
      if (isAdminSlug) {
        const hooks = await store.listHooks();
        return res.json({ admin: true, hooks });
      }

      const hook = await store.getHook(slug);
      if (!hook) {
        return res.status(404).json({ error: `Webhook "${slug}" not found.` });
      }

      return res.json({ hook });
    }),
  );

  managementRouter.delete(
    '/:slug',
    asyncHandler(async (req, res) => {
      const slug = normaliseSlug(req.params.slug);
      const deleted = await store.deleteHook(slug);
      if (!deleted) {
        return res.status(404).json({ error: `Webhook "${slug}" not found.` });
      }

      return res.json({ deleted: true, slug });
    }),
  );

  managementRouter.post(
    '/:slug/reset',
    asyncHandler(async (req, res) => {
      const slug = normaliseSlug(req.params.slug);
      const hook = await store.clearLogs(slug);
      res.json({ reset: true, hook });
    }),
  );

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

    let targetHook;
    try {
      targetHook = await store.getHook(slug);
    } catch (err) {
      return next(err);
    }
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

function enforceAdminAccess(req, res, next) {
  if (!ADMIN_ACCESS_TOKEN) {
    return next();
  }

  const token = (req.get('x-admin-access') || req.query.admin || '').trim();
  if (token && token === ADMIN_ACCESS_TOKEN) {
    return next();
  }

  return res.status(401).json({ error: 'Admin access token required.' });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
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
