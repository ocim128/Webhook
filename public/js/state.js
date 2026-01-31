/**
 * Shared application state
 * @module state
 */

/** Set of reserved paths that should not be treated as slugs */
export const reservedClientPaths = new Set(['', 'webhooks', 'hooks', 'health', 'meta', 'recent']);

/** Currently active webhook slug */
export let currentSlug = null;

/** Currently selected log ID */
export let activeLogId = null;

/** Cached logs for the current webhook */
export let logsCache = [];

/** Current search query string */
export let searchQuery = '';

/** Active filter type: 'all' | 'email' | 'json' */
export let activeFilter = 'all';

/** Index of keyboard-focused item in log list */
export let keyboardFocusIndex = -1;

/** Filtered logs based on search/filter */
export let filteredLogs = [];

// State update functions
export function setCurrentSlug(value) {
    currentSlug = value;
}

export function setActiveLogId(value) {
    activeLogId = value;
}

export function setLogsCache(value) {
    logsCache = value;
}

export function setSearchQuery(value) {
    searchQuery = value;
}

export function setActiveFilter(value) {
    activeFilter = value;
}

export function setKeyboardFocusIndex(value) {
    keyboardFocusIndex = value;
}

export function setFilteredLogs(value) {
    filteredLogs = value;
}

/**
 * Reset all view-related state
 */
export function resetViewState() {
    logsCache = [];
    activeLogId = null;
    filteredLogs = [];
    keyboardFocusIndex = -1;
}
