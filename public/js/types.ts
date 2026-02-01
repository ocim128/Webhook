/**
 * Shared TypeScript types for the frontend
 * @module types
 */

/** A single webhook log entry */
export interface WebhookLogEntry {
    id: string;
    timestamp: string;
    body?: string;
    bodyPreview?: string;
    isJson?: boolean;
    formatted?: string;
    byteSize?: number;
    method?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    ip?: string;
}

/** A webhook endpoint with its configuration */
export interface WebhookHook {
    id: string;
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    lastHit: string | null;
    hits: number;
    logs: WebhookLogEntry[];
    url?: string;
}

/** Webhook hook summary (without logs) */
export interface WebhookHookSummary {
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    lastHit: string | null;
    hits: number;
}

/** Email payload structure for parsed email data */
export interface EmailPayload {
    from?: string;
    to?: string;
    subject?: string;
    date?: string;
    plainBody?: string;
    htmlBody?: string;
}

/** Global statistics */
export interface WebhookStats {
    totalWebhooks: number;
    totalHits: number;
    lastPayloadAt: string | null;
    lastWebhookCreatedAt: string | null;
    hitsLast24h: number;
}

/** DOM element references for statistics */
export interface StatElements {
    total: HTMLElement | null;
    hits: HTMLElement | null;
    lastHit: HTMLElement | null;
    last24h: HTMLElement | null;
}
