const fs = require('fs/promises');
const path = require('path');
const { nanoid } = require('nanoid');

/**
 * Lightweight file-backed store that emulates the MongoDB collections we plan
 * to use in production. It keeps everything in memory for fast access and
 * flushes to disk after each mutation so data survives restarts while testing.
 */
class WebhookStore {
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
      id: nanoid(10),
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

module.exports = {
  WebhookStore,
};
