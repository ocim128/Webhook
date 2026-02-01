/**
 * Shared application state
 * @module state
 */

import type { WebhookLogEntry } from './types';

/** Set of reserved paths that should not be treated as slugs */
export const reservedClientPaths = new Set(['', 'webhooks', 'hooks', 'health', 'meta', 'recent', 'favicon.ico']);

/** Currently active webhook slug */
export let currentSlug: string | null = null;

/** Currently selected log ID */
export let activeLogId: string | null = null;

/** Cached logs for the current webhook */
export let logsCache: WebhookLogEntry[] = [];

/** Current search query string */
export let searchQuery = '';

/** Active filter type */
export type FilterType = 'all' | 'email' | 'json';
export let activeFilter: FilterType = 'all';

/** Index of keyboard-focused item in log list */
export let keyboardFocusIndex = -1;

/** Filtered logs based on search/filter */
export let filteredLogs: WebhookLogEntry[] = [];

// State update functions
export function setCurrentSlug(value: string | null): void {
    currentSlug = value;
}

export function setActiveLogId(value: string | null): void {
    activeLogId = value;
}

export function setLogsCache(value: WebhookLogEntry[]): void {
    logsCache = value;
}

export function setSearchQuery(value: string): void {
    searchQuery = value;
}

export function setActiveFilter(value: FilterType): void {
    activeFilter = value;
}

export function setKeyboardFocusIndex(value: number): void {
    keyboardFocusIndex = value;
}

export function setFilteredLogs(value: WebhookLogEntry[]): void {
    filteredLogs = value;
}

/**
 * Reset all view-related state
 */
export function resetViewState(): void {
    logsCache = [];
    activeLogId = null;
    filteredLogs = [];
    keyboardFocusIndex = -1;
}
