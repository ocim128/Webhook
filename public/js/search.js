/**
 * Search, filter, and keyboard navigation
 * @module search
 */

import { escapeHtml } from './utils.js';
import { searchInput, searchClear, searchStats, filterChips, slugView, logListEl } from './dom.js';
import {
    logsCache, searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    filteredLogs, setFilteredLogs, keyboardFocusIndex, setKeyboardFocusIndex,
    currentSlug, activeLogId, setActiveLogId
} from './state.js';
import { extractEmailPayload } from './email.js';
import { renderFilteredLogs, selectLog, updateKeyboardFocus } from './logs.js';

// Late-bound references
let _showToast = null;
let _loadDetail = null;

/**
 * Set references (called from app.js to break circular dependency)
 * @param {Object} refs - Object with showToast and loadDetail
 */
export function setSearchDeps(refs) {
    _showToast = refs.showToast;
    _loadDetail = refs.loadDetail;
}

/**
 * Initialize search and filter features
 */
export function initSearch() {
    setupSearch();
    setupFilters();
    setupKeyboardNavigation();
}

/**
 * Setup search input handlers
 */
function setupSearch() {
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        setSearchQuery(e.target.value.toLowerCase().trim());
        applySearchAndFilter();
    });

    searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        setSearchQuery('');
        applySearchAndFilter();
        searchInput.focus();
    });
}

/**
 * Setup filter chip handlers
 */
function setupFilters() {
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            setActiveFilter(chip.getAttribute('data-filter'));
            applySearchAndFilter();
        });
    });
}

/**
 * Apply current search and filter to logs
 */
export function applySearchAndFilter() {
    if (!logsCache.length) {
        updateSearchStats(0, 0);
        return;
    }

    const newFilteredLogs = logsCache.filter(log => {
        // Filter by type
        const emailPayload = extractEmailPayload(log);
        if (activeFilter === 'email' && !emailPayload) return false;
        if (activeFilter === 'json' && (!log.isJson || emailPayload)) return false;

        // Search
        if (!searchQuery) return true;

        const searchableText = buildSearchableText(log, emailPayload);
        return searchableText.toLowerCase().includes(searchQuery);
    });

    setFilteredLogs(newFilteredLogs);
    updateSearchStats(newFilteredLogs.length, logsCache.length);
    renderFilteredLogs(newFilteredLogs);
}

/**
 * Build searchable text from log
 * @param {Object} log - Log entry
 * @param {Object|null} emailPayload - Pre-extracted email payload
 * @returns {string} Searchable text
 */
function buildSearchableText(log, emailPayload = null) {
    const parts = [];

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
 * @param {number} shown - Number of shown results
 * @param {number} total - Total number of logs
 */
export function updateSearchStats(shown, total) {
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
function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        // Skip if typing in input
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

        // Focus search on /
        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            searchInput?.focus();
            return;
        }

        // Clear search on Escape
        if (e.key === 'Escape') {
            if (document.activeElement === searchInput) {
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
                updateKeyboardFocus();
                scrollToFocusedItem();
                break;

            case 'k':
            case 'ArrowUp':
                e.preventDefault();
                setKeyboardFocusIndex(Math.max(keyboardFocusIndex - 1, 0));
                updateKeyboardFocus();
                scrollToFocusedItem();
                break;

            case 'Enter':
                e.preventDefault();
                if (keyboardFocusIndex >= 0 && keyboardFocusIndex < logs.length) {
                    setActiveLogId(logs[keyboardFocusIndex].id);
                    selectLog(activeLogId);
                    updateKeyboardFocus();
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
function scrollToFocusedItem() {
    const items = logListEl.querySelectorAll('.log-item');
    const focusedItem = items[keyboardFocusIndex];

    if (focusedItem) {
        focusedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}
