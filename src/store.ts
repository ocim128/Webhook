import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { MongoClient, Collection, Db, MongoClientOptions, ObjectId } from 'mongodb';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface WebhookEntry {
    id: string;
    method?: string;
    timestamp: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    bodyPreview?: string;
    isJson?: boolean;
    formatted?: string;
    byteSize?: number;
    size?: number;
    ip?: string;
}

export interface WebhookHook {
    id: string;
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    lastHit: string | null;
    hits: number;
    logs: WebhookEntry[];
    url?: string;
}

export interface WebhookHookSummary {
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    lastHit: string | null;
    hits: number;
}

export interface RecentEntry {
    slug: string;
    timestamp: string;
    body?: unknown;
    bodyPreview?: string;
    isJson?: boolean;
    formatted?: string;
    byteSize?: number;
    reference: string;
}

export interface WebhookStats {
    totalWebhooks: number;
    totalHits: number;
    lastPayloadAt: string | null;
    lastWebhookCreatedAt: string | null;
    hitsLast24h: number;
}

export interface CreateHookOptions {
    slug: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

export interface StoreOptions {
    filePath?: string;
    logLimit?: number;
    mongoUri?: string;
    mongoDbName?: string;
    mongoCollection?: string;
    mongoClientOptions?: MongoClientOptions;
}

interface StoreState {
    hooks: Record<string, WebhookHook>;
}

interface StoreError extends Error {
    statusCode?: number;
    code?: string | number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function generateId(length = 10): string {
    const bytes = crypto.randomBytes(length * 2);
    const id = bytes.toString('base64url').slice(0, length);
    return id.length >= length ? id : generateId(length);
}

function createStoreError(message: string, statusCode: number): StoreError {
    const err: StoreError = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ────────────────────────────────────────────────────────────────────────────
// FileWebhookStore
// ────────────────────────────────────────────────────────────────────────────

export class FileWebhookStore {
    private filePath: string;
    private dir: string;
    private logLimit: number;
    private state: StoreState;
    private writePromise: Promise<void> | null;
    private pendingFlush: boolean;

    constructor(filePath: string, options: { logLimit?: number } = {}) {
        this.filePath = filePath;
        this.dir = path.dirname(filePath);
        this.logLimit = options.logLimit ?? 50;
        this.state = { hooks: {} };
        this.writePromise = null;
        this.pendingFlush = false;
    }

    async init(): Promise<void> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            this.state = this.normalizeState(JSON.parse(raw || '{"hooks":{}}'));
        } catch (err) {
            const nodeErr = err as NodeJS.ErrnoException;
            if (nodeErr.code === 'ENOENT') {
                try {
                    await fs.mkdir(this.dir, { recursive: true });
                    this.state = this.normalizeState(this.state);
                    await this.persist();
                } catch (persistErr) {
                    console.warn('Warning: Could not initialize storage directory or file. This is expected on read-only environments like Vercel if MongoDB is not used.', persistErr);
                    // Continue anyway, it will just live in memory for this invocation
                }
            } else {
                throw err;
            }
        }
    }

    listHooks(): WebhookHookSummary[] {
        return Object.values(this.state.hooks).map((hook) => ({
            slug: hook.slug,
            description: hook.description,
            metadata: hook.metadata,
            createdAt: hook.createdAt,
            lastHit: hook.lastHit,
            hits: hook.hits,
        }));
    }

    listRecentEntries(limit = 20): RecentEntry[] {
        const entries: RecentEntry[] = [];
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

    getHook(slug: string): WebhookHook | null {
        const hook = this.state.hooks[slug];
        if (!hook) {
            return null;
        }

        return JSON.parse(JSON.stringify(hook));
    }

    async createHook({ slug, description = '', metadata = {} }: CreateHookOptions): Promise<WebhookHook> {
        if (this.state.hooks[slug]) {
            throw createStoreError(`A webhook with slug "${slug}" already exists.`, 409);
        }

        const hook: WebhookHook = {
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
        await this.schedulePersist();
        return hook;
    }

    async deleteHook(slug: string): Promise<boolean> {
        if (!this.state.hooks[slug]) {
            return false;
        }

        delete this.state.hooks[slug];
        await this.schedulePersist();
        return true;
    }

    async recordHit(slug: string, entry: WebhookEntry): Promise<WebhookEntry> {
        const hook = this.state.hooks[slug];
        if (!hook) {
            throw createStoreError(`Unknown webhook slug "${slug}".`, 404);
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

    async clearLogs(slug: string): Promise<WebhookHook> {
        const hook = this.state.hooks[slug];
        if (!hook) {
            throw createStoreError(`Unknown webhook slug "${slug}".`, 404);
        }

        hook.logs = [];
        hook.hits = 0;
        hook.lastHit = null;
        await this.schedulePersist();
        return hook;
    }

    private async persist(): Promise<void> {
        this.state = this.normalizeState(this.state);
        await fs.mkdir(this.dir, { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2));
    }

    private schedulePersist(): Promise<void> {
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

    private normalizeState(rawState: unknown): StoreState {
        if (!rawState || typeof rawState !== 'object') {
            return { hooks: {} };
        }

        const state = rawState as StoreState;
        if (!state.hooks || typeof state.hooks !== 'object') {
            state.hooks = {};
        }

        return state;
    }

    getStats(): WebhookStats {
        const hooks = Object.values(this.state.hooks);
        const totalWebhooks = hooks.length;
        let totalHits = 0;
        let lastPayloadAt: number | null = null;
        let lastCreatedAt: number | null = null;
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

// ────────────────────────────────────────────────────────────────────────────
// MongoWebhookStore
// ────────────────────────────────────────────────────────────────────────────

interface MongoHookDocument {
    _id?: ObjectId;
    id: string;
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    lastHit: string | null;
    hits: number;
    logs: WebhookEntry[];
}

export class MongoWebhookStore {
    private mongoUri: string;
    private mongoDbName: string;
    private mongoCollection: string;
    private logLimit: number;
    private clientOptions: MongoClientOptions;
    private client: MongoClient | null;
    private collection: Collection<MongoHookDocument> | null;

    constructor(options: StoreOptions = {}) {
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

    async init(): Promise<void> {
        if (this.collection) {
            return;
        }

        this.client = new MongoClient(this.mongoUri, this.clientOptions);
        await this.client.connect();
        const db: Db = this.client.db(this.mongoDbName);
        this.collection = db.collection<MongoHookDocument>(this.mongoCollection);
        await this.collection.createIndex({ slug: 1 }, { unique: true });
    }

    async listHooks(): Promise<WebhookHookSummary[]> {
        if (!this.collection) throw new Error('Store not initialized');
        const docs = await this.collection
            .find({}, { projection: { logs: 0 } })
            .sort({ slug: 1 })
            .toArray();
        return docs.map((doc) => sanitizeHook(doc)).filter((h): h is WebhookHook => h !== null);
    }

    async listRecentEntries(limit = 20): Promise<RecentEntry[]> {
        if (!this.collection) throw new Error('Store not initialized');
        const docs = await this.collection
            .find({}, { projection: { slug: 1, logs: 1 } })
            .toArray();

        const entries: RecentEntry[] = [];
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

    async getHook(slug: string): Promise<WebhookHook | null> {
        if (!this.collection) throw new Error('Store not initialized');
        const hook = await this.collection.findOne({ slug });
        if (!hook) {
            return null;
        }

        return sanitizeHook(hook);
    }

    async createHook({ slug, description = '', metadata = {} }: CreateHookOptions): Promise<WebhookHook> {
        if (!this.collection) throw new Error('Store not initialized');
        const hook: MongoHookDocument = {
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
            const mongoErr = err as { code?: number };
            if (mongoErr?.code === 11000) {
                throw createStoreError(`A webhook with slug "${slug}" already exists.`, 409);
            }
            throw err;
        }

        return sanitizeHook(hook)!;
    }

    async deleteHook(slug: string): Promise<boolean> {
        if (!this.collection) throw new Error('Store not initialized');
        const result = await this.collection.deleteOne({ slug });
        return result.deletedCount > 0;
    }

    async recordHit(slug: string, entry: WebhookEntry): Promise<WebhookEntry> {
        if (!this.collection) throw new Error('Store not initialized');
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
                    } as unknown as WebhookEntry,
                },
            },
            { returnDocument: 'after', projection: { slug: 1 } },
        );
        const doc = extractValue(result);
        if (!doc) {
            throw createStoreError(`Unknown webhook slug "${slug}".`, 404);
        }

        return entry;
    }

    async clearLogs(slug: string): Promise<WebhookHook> {
        if (!this.collection) throw new Error('Store not initialized');
        const result = await this.collection.findOneAndUpdate(
            { slug },
            { $set: { logs: [], hits: 0, lastHit: null } },
            { returnDocument: 'after' },
        );
        const doc = extractValue(result);
        if (!doc) {
            throw createStoreError(`Unknown webhook slug "${slug}".`, 404);
        }

        return sanitizeHook(doc as MongoHookDocument)!;
    }

    async getStats(): Promise<WebhookStats> {
        if (!this.collection) throw new Error('Store not initialized');
        const docs = await this.collection
            .find({}, { projection: { hits: 1, createdAt: 1, lastHit: 1, logs: 1 } })
            .toArray();

        const totalWebhooks = docs.length;
        let totalHits = 0;
        let lastPayloadAt: number | null = null;
        let lastCreatedAt: number | null = null;
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

// ────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────

function extractValue<T>(result: T | { value: T } | null): T | null {
    if (!result) {
        return null;
    }

    if (typeof result === 'object' && 'value' in result) {
        return (result as { value: T }).value;
    }

    return result;
}

function sanitizeHook(doc: MongoHookDocument | null): WebhookHook | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return {
        ...rest,
        metadata: rest.metadata || {},
        logs: rest.logs || [],
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export type WebhookStore = FileWebhookStore | MongoWebhookStore;

export function createWebhookStore(options: StoreOptions = {}): FileWebhookStore | MongoWebhookStore {
    const { mongoUri, filePath, logLimit } = options;
    if (mongoUri) {
        return new MongoWebhookStore(options);
    }

    if (!filePath) {
        throw new Error('A filePath must be provided when mongoUri is not set.');
    }

    return new FileWebhookStore(filePath, { logLimit });
}

