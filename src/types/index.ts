/**
 * Shared TypeScript types for the Webhook project
 */

/** A single webhook request entry/hit */
export interface WebhookEntry {
    id: string;
    method: string;
    timestamp: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
    preview?: string;
    size: number;
    ip?: string;
}

/** A webhook endpoint with its configuration and logs */
export interface WebhookHook {
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    url?: string;
    logs: WebhookEntry[];
}

/** Options for creating a new webhook */
export interface CreateHookOptions {
    slug: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

/** Global statistics for the webhook service */
export interface WebhookStats {
    totalHooks: number;
    totalHits: number;
    recentHitsLast24h: number;
}

/** Store configuration options */
export interface StoreOptions {
    filePath?: string;
    logLimit?: number;
    mongoUri?: string;
    mongoDbName?: string;
    mongoCollection?: string;
    mongoClientOptions?: Record<string, unknown>;
}

/** Interface that all webhook stores must implement */
export interface IWebhookStore {
    init(): Promise<void>;
    listHooks(): Promise<WebhookHook[]>;
    listRecentEntries(limit?: number): Promise<Array<WebhookEntry & { slug: string }>>;
    getHook(slug: string): Promise<WebhookHook | null>;
    createHook(options: CreateHookOptions): Promise<WebhookHook>;
    deleteHook(slug: string): Promise<void>;
    recordHit(slug: string, entry: WebhookEntry): Promise<WebhookHook>;
    clearLogs(slug: string): Promise<WebhookHook>;
    getStats(): Promise<WebhookStats>;
}
