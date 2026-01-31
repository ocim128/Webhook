/**
 * Search, filter, and keyboard navigation
 * @module search
 */

import { searchInput, searchClear, searchStats, filterChips, slugView, logListEl } from './dom';
import {
    logsCache, searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    filteredLogs, setFilteredLogs, keyboardFocusIndex, setKeyboardFocusIndex,
    currentSlug, activeLogId, setActiveLogId, FilterType
} from './state';
import type { WebhookLogEntry } from './types';

// Forward declarations for circular imports
let extractEmailPayload: ((log: WebhookLogEntry) => EmailPayload | null) | null = null;
let renderFilteredLogs: ((logs: WebhookLogEntry[]) => void) | null = null;
let selectLog: ((logId: string | null) => void) | null = null;
let updateKeyboardFocus: (() => void) | null = null;

interface EmailPayload {
    from?: string;
    to?: string;
    subject?: string;
    plainBody?: string;
    htmlBody?: string;
}

// Late-bound references
let _showToast: ((message: string) => void) | null = null;
let _loadDetail: ((slug: string, options?: { updateUrl?: boolean }) => Promise<void>) | null = null;

/**
 * Set references (called from app.js to break circular dependency)
 */
export function setSearchDeps(refs: {
    showToast?: (message: string) => void;
    loadDetail?: (slug: string, options?: { updateUrl?: boolean }) => Promise<void>;
}): void {
    _showToast = refs.showToast ?? null;
    _loadDetail = refs.loadDetail ?? null;
}

/**
 * Set email module references
 */
export function setEmailRefs(refs: {
    extractEmailPayload?: (log: WebhookLogEntry) => EmailPayload | null;
}): void {
    extractEmailPayload = refs.extractEmailPayload ?? null;
}

/**
 * Set logs module references
 */
export function setLogsRefs(refs: {
    renderFilteredLogs?: (logs: WebhookLogEntry[]) => void;
    selectLog?: (logId: string | null) => void;
    updateKeyboardFocus?: () => void;
}): void {
    renderFilteredLogs = refs.renderFilteredLogs ?? null;
    selectLog = refs.selectLog ?? null;
    updateKeyboardFocus = refs.updateKeyboardFocus ?? null;
}

/**
 * Initialize search and filter features
 */
export function initSearch(): void {
    setupSearch();
    setupFilters();
    setupKeyboardNavigation();
}

/**
 * Setup search input handlers
 */
function setupSearch(): void {
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        setSearchQuery(target.value.toLowerCase().trim());
        applySearchAndFilter();
    });

    searchClear?.addEventListener('click', () => {
        if (!searchInput) return;
        searchInput.value = '';
        setSearchQuery('');
        applySearchAndFilter();
        searchInput.focus();
    });
}

/**
 * Setup filter chip handlers
 */
function setupFilters(): void {
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const filter = chip.getAttribute('data-filter') as FilterType;
            setActiveFilter(filter || 'all');
            applySearchAndFilter();
        });
    });
}

/**
 * Apply current search and filter to logs
 */
export function applySearchAndFilter(): void {
    if (!logsCache.length) {
        updateSearchStats(0, 0);
        return;
    }

    const newFilteredLogs = logsCache.filter(log => {
        // Filter by type
        const emailPayload = extractEmailPayload ? extractEmailPayload(log) : null;
        if (activeFilter === 'email' && !emailPayload) return false;
        if (activeFilter === 'json' && (!log.isJson || emailPayload)) return false;

        // Search
        if (!searchQuery) return true;

        const searchableText = buildSearchableText(log, emailPayload);
        return searchableText.toLowerCase().includes(searchQuery);
    });

    setFilteredLogs(newFilteredLogs);
    updateSearchStats(newFilteredLogs.length, logsCache.length);
    if (renderFilteredLogs) renderFilteredLogs(newFilteredLogs);
}

/**
 * Build searchable text from log
 */
function buildSearchableText(log: WebhookLogEntry, emailPayload: EmailPayload | null = null): string {
    const parts: string[] = [];

    if (emailPayload) {
        if (emailPayload.from) parts.push(emailPayload.from);
        if (emailPayload.to) parts.push(emailPayload.to);
        if (emailPayload.subject) parts.push(emailPayload.subject);
        if (emailPayload.plainBody) parts.push(emailPayload.plainBody);
    }

    if (log.body) parts.push(log.body);
    if (log.formatted) parts.push(log.formatted);

    return parts.join(' ');
}

/**
 * Update search stats display
 */
export function updateSearchStats(shown: number, total: number): void {
    if (!searchStats) return;

    if (searchQuery || activeFilter !== 'all') {
        searchStats.textContent = `${shown} of ${total}`;
    } else {
        searchStats.textContent = `${total} total`;
    }
}

/**
 * Setup keyboard navigation
 */
function setupKeyboardNavigation(): void {
    document.addEventListener('keydown', (e) => {
        // Skip if typing in input
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');

        // Focus search on /
        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            searchInput?.focus();
            return;
        }

        // Clear search on Escape
        if (e.key === 'Escape') {
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
                searchInput.value = '';
                setSearchQuery('');
                applySearchAndFilter();
            }
            return;
        }

        // Skip other shortcuts if typing
        if (isTyping) return;

        // Only work when in slug view
        if (slugView?.classList.contains('hidden')) return;

        const logs = filteredLogs.length ? filteredLogs : logsCache;
        if (!logs.length) return;

        switch (e.key) {
            case 'j':
            case 'ArrowDown':
                e.preventDefault();
                setKeyboardFocusIndex(Math.min(keyboardFocusIndex + 1, logs.length - 1));
                if (updateKeyboardFocus) updateKeyboardFocus();
                scrollToFocusedItem();
                break;

            case 'k':
            case 'ArrowUp':
                e.preventDefault();
                setKeyboardFocusIndex(Math.max(keyboardFocusIndex - 1, 0));
                if (updateKeyboardFocus) updateKeyboardFocus();
                scrollToFocusedItem();
                break;

            case 'Enter':
                e.preventDefault();
                if (keyboardFocusIndex >= 0 && keyboardFocusIndex < logs.length) {
                    setActiveLogId(logs[keyboardFocusIndex].id);
                    if (selectLog) selectLog(activeLogId);
                    if (updateKeyboardFocus) updateKeyboardFocus();
                }
                break;

            case 'r':
                e.preventDefault();
                if (currentSlug && _loadDetail) {
                    _loadDetail(currentSlug, { updateUrl: false });
                    if (_showToast) _showToast('Refreshing...');
                }
                break;
        }
    });
}

/**
 * Scroll to keyboard-focused item
 */
function scrollToFocusedItem(): void {
    if (!logListEl) return;
    const items = logListEl.querySelectorAll('.log-item');
    const focusedItem = items[keyboardFocusIndex];

    if (focusedItem) {
        focusedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}
