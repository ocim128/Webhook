const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

function generateId(length = 10) {
  const bytes = crypto.randomBytes(length * 2);
  const id = bytes.toString('base64url').slice(0, length);
  return id.length >= length ? id : generateId(length);
}

class FileWebhookStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
    this.logLimit = options.logLimit ?? 50;
    this.state = { hooks: {} };
    this.writePromise = null;
    this.pendingFlush = false;
  }

  async init() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = this.normalizeState(JSON.parse(raw || '{"hooks":{}}'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.mkdir(this.dir, { recursive: true });
        this.state = this.normalizeState(this.state);
        await this.persist();
      } else {
        throw err;
      }
    }
  }

  listHooks() {
    return Object.values(this.state.hooks).map((hook) => ({
      slug: hook.slug,
      description: hook.description,
      metadata: hook.metadata,
      createdAt: hook.createdAt,
      lastHit: hook.lastHit,
      hits: hook.hits,
    }));
  }

  listRecentEntries(limit = 20) {
    const entries = [];
    for (const hook of Object.values(this.state.hooks)) {
      for (const log of hook.logs) {
        entries.push({
          slug: hook.slug,
          timestamp: log.timestamp,
          body: log.body,
          bodyPreview: log.bodyPreview,
          isJson: log.isJson,
          formatted: log.formatted,
          byteSize: log.byteSize,
          reference: log.id,
        });
      }
    }

    entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    return entries.slice(0, safeLimit);
  }

  getHook(slug) {
    const hook = this.state.hooks[slug];
    if (!hook) {
      return null;
    }

    return JSON.parse(JSON.stringify(hook));
  }

  createHook({ slug, description = '', metadata = {} }) {
    if (this.state.hooks[slug]) {
      const err = new Error(`A webhook with slug "${slug}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const hook = {
      id: generateId(10),
      slug,
      description,
      metadata,
      createdAt: new Date().toISOString(),
      lastHit: null,
      hits: 0,
      logs: [],
    };

    this.state.hooks[slug] = hook;
    return this.schedulePersist().then(() => hook);
  }

  deleteHook(slug) {
    if (!this.state.hooks[slug]) {
      return false;
    }

    delete this.state.hooks[slug];
    return this.schedulePersist().then(() => true);
  }

  async recordHit(slug, entry) {
    const hook = this.state.hooks[slug];
    if (!hook) {
      const err = new Error(`Unknown webhook slug "${slug}".`);
      err.statusCode = 404;
      throw err;
    }

    hook.hits += 1;
    hook.lastHit = entry.timestamp;
    hook.logs.unshift(entry);
    if (hook.logs.length > this.logLimit) {
      hook.logs = hook.logs.slice(0, this.logLimit);
    }

    this.schedulePersist();
    return entry;
  }

  async clearLogs(slug) {
    const hook = this.state.hooks[slug];
    if (!hook) {
      const err = new Error(`Unknown webhook slug "${slug}".`);
      err.statusCode = 404;
      throw err;
    }

    hook.logs = [];
    hook.hits = 0;
    hook.lastHit = null;
    await this.schedulePersist();
    return hook;
  }

  async persist() {
    this.state = this.normalizeState(this.state);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  schedulePersist() {
    if (this.writePromise) {
      this.pendingFlush = true;
      return this.writePromise;
    }

    this.writePromise = this.persist()
      .catch((err) => {
        console.error('Failed to persist webhook store:', err);
      })
      .finally(() => {
        this.writePromise = null;
        if (this.pendingFlush) {
          this.pendingFlush = false;
          this.schedulePersist();
        }
      });

    return this.writePromise;
  }

  normalizeState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return { hooks: {} };
    }

    if (!rawState.hooks || typeof rawState.hooks !== 'object') {
      rawState.hooks = {};
    }

    return rawState;
  }

  getStats() {
    const hooks = Object.values(this.state.hooks);
    const totalWebhooks = hooks.length;
    let totalHits = 0;
    let lastPayloadAt = null;
    let lastCreatedAt = null;
    let last24hHits = 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    hooks.forEach((hook) => {
      totalHits += hook.hits || 0;
      const createdAtTs = new Date(hook.createdAt || 0).getTime();
      if (!lastCreatedAt || createdAtTs > lastCreatedAt) {
        lastCreatedAt = createdAtTs;
      }
      (hook.logs || []).forEach((log) => {
        const ts = new Date(log.timestamp || 0).getTime();
        if (!lastPayloadAt || ts > lastPayloadAt) {
          lastPayloadAt = ts;
        }
        if (ts >= cutoff) {
          last24hHits += 1;
        }
      });
    });

    return {
      totalWebhooks,
      totalHits,
      lastPayloadAt: lastPayloadAt ? new Date(lastPayloadAt).toISOString() : null,
      lastWebhookCreatedAt: lastCreatedAt ? new Date(lastCreatedAt).toISOString() : null,
      hitsLast24h: last24hHits,
    };
  }
}

class MongoWebhookStore {
  constructor(options = {}) {
    const {
      mongoUri,
      mongoDbName,
      mongoCollection,
      logLimit,
      mongoClientOptions,
    } = options;

    if (!mongoUri) {
      throw new Error('A MongoDB connection string is required when mongoUri is set.');
    }

    this.mongoUri = mongoUri;
    this.mongoDbName = mongoDbName || 'webhook-relay';
    this.mongoCollection = mongoCollection || 'hooks';
    this.logLimit = logLimit ?? 50;
    this.clientOptions = mongoClientOptions || {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    };
    this.client = null;
    this.collection = null;
  }

  async init() {
    if (this.collection) {
      return;
    }

    this.client = new MongoClient(this.mongoUri, this.clientOptions);
    await this.client.connect();
    const db = this.client.db(this.mongoDbName);
    this.collection = db.collection(this.mongoCollection);
    await this.collection.createIndex({ slug: 1 }, { unique: true });
  }

  async listHooks() {
    const docs = await this.collection
      .find({}, { projection: { logs: 0 } })
      .sort({ slug: 1 })
      .toArray();
    return docs.map((doc) => sanitizeHook(doc));
  }

  async listRecentEntries(limit = 20) {
    const docs = await this.collection
      .find({}, { projection: { slug: 1, logs: 1 } })
      .toArray();

    const entries = [];
    docs.forEach((doc) => {
      (doc.logs || []).forEach((log) => {
        entries.push({
          slug: doc.slug,
          timestamp: log.timestamp,
          body: log.body,
          bodyPreview: log.bodyPreview,
          isJson: log.isJson,
          formatted: log.formatted,
          byteSize: log.byteSize,
          reference: log.id,
        });
      });
    });

    entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    return entries.slice(0, safeLimit);
  }

  async getHook(slug) {
    const hook = await this.collection.findOne({ slug });
    if (!hook) {
      return null;
    }

    return sanitizeHook(hook);
  }

  async createHook({ slug, description = '', metadata = {} }) {
    const hook = {
      id: generateId(10),
      slug,
      description,
      metadata,
      createdAt: new Date().toISOString(),
      lastHit: null,
      hits: 0,
      logs: [],
    };

    try {
      await this.collection.insertOne(hook);
    } catch (err) {
      if (err?.code === 11000) {
        const conflict = new Error(`A webhook with slug "${slug}" already exists.`);
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }

    return sanitizeHook(hook);
  }

  async deleteHook(slug) {
    const result = await this.collection.deleteOne({ slug });
    return result.deletedCount > 0;
  }

  async recordHit(slug, entry) {
    const result = await this.collection.findOneAndUpdate(
      { slug },
      {
        $inc: { hits: 1 },
        $set: { lastHit: entry.timestamp },
        $push: {
          logs: {
            $each: [entry],
            $position: 0,
            $slice: this.logLimit,
          },
        },
      },
      { returnDocument: 'after', projection: { slug: 1 } },
    );
    const doc = extractValue(result);
    if (!doc) {
      const err = new Error(`Unknown webhook slug "${slug}".`);
      err.statusCode = 404;
      throw err;
    }

    return entry;
  }

  async clearLogs(slug) {
    const result = await this.collection.findOneAndUpdate(
      { slug },
      { $set: { logs: [], hits: 0, lastHit: null } },
      { returnDocument: 'after' },
    );
    const doc = extractValue(result);
    if (!doc) {
      const err = new Error(`Unknown webhook slug "${slug}".`);
      err.statusCode = 404;
      throw err;
    }

    return sanitizeHook(doc);
  }

  async getStats() {
    const docs = await this.collection
      .find({}, { projection: { hits: 1, createdAt: 1, lastHit: 1, logs: 1 } })
      .toArray();

    const totalWebhooks = docs.length;
    let totalHits = 0;
    let lastPayloadAt = null;
    let lastCreatedAt = null;
    let last24hHits = 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    docs.forEach((doc) => {
      totalHits += doc.hits || 0;
      const createdAtTs = new Date(doc.createdAt || 0).getTime();
      if (!lastCreatedAt || createdAtTs > lastCreatedAt) {
        lastCreatedAt = createdAtTs;
      }
      (doc.logs || []).forEach((log) => {
        const ts = new Date(log.timestamp || 0).getTime();
        if (!lastPayloadAt || ts > lastPayloadAt) {
          lastPayloadAt = ts;
        }
        if (ts >= cutoff) {
          last24hHits += 1;
        }
      });
    });

    return {
      totalWebhooks,
      totalHits,
      lastPayloadAt: lastPayloadAt ? new Date(lastPayloadAt).toISOString() : null,
      lastWebhookCreatedAt: lastCreatedAt ? new Date(lastCreatedAt).toISOString() : null,
      hitsLast24h: last24hHits,
    };
  }
}

function extractValue(result) {
  if (!result) {
    return null;
  }

  if (typeof result === 'object' && 'value' in result) {
    return result.value;
  }

  return result;
}

function sanitizeHook(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  rest.metadata = rest.metadata || {};
  rest.logs = rest.logs || [];
  return rest;
}

function createWebhookStore(options = {}) {
  const { mongoUri, filePath, logLimit } = options;
  if (mongoUri) {
    return new MongoWebhookStore(options);
  }

  if (!filePath) {
    throw new Error('A filePath must be provided when mongoUri is not set.');
  }

  return new FileWebhookStore(filePath, { logLimit });
}

module.exports = {
  FileWebhookStore,
  MongoWebhookStore,
  WebhookStore: FileWebhookStore,
  createWebhookStore,
};
