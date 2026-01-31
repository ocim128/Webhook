/**
 * DOM element references
 * @module dom
 */

// Core layout elements
export const statusBadge = document.getElementById('status-badge');
export const homeView = document.getElementById('home-view');
export const slugView = document.getElementById('slug-view');

// Slug view elements
export const slugTitle = document.getElementById('slug-title');
export const slugSummary = document.getElementById('slug-summary');
export const logListEl = document.getElementById('log-list');
export const logDetailEl = document.getElementById('log-detail');

// Form elements
export const createForm = document.getElementById('create-form');

// Action buttons
export const backButton = document.getElementById('back-home');
export const resetButton = document.getElementById('reset-slug');
export const deleteButton = document.getElementById('delete-slug');
export const logsRefreshBtn = document.getElementById('logs-refresh');

// Statistics elements
export const statEls = {
    total: document.getElementById('stat-total-hooks'),
    hits: document.getElementById('stat-total-hits'),
    lastHit: document.getElementById('stat-last-hit'),
    last24h: document.getElementById('stat-last24h'),
};

// Search elements
export const searchInput = document.getElementById('search-input');
export const searchClear = document.getElementById('search-clear');
export const searchStats = document.getElementById('search-stats');
export const filterChips = document.querySelectorAll('.filter-chip');
