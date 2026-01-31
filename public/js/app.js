/**
 * Main application entry point
 * Orchestrates all modules and sets up event handlers
 * @module app
 */

// Import DOM references
import {
    createForm, backButton, resetButton, deleteButton, logsRefreshBtn
} from './dom.js';

// Import state
import { currentSlug } from './state.js';

// Import API functions
import {
    loadDetail, loadStats, resetWebhook, deleteWebhook,
    handleCreateWebhook, setViewRefs
} from './api.js';

// Import view functions
import {
    toggleView, updateStatusBadge, getSlugFromPath, showDetail,
    showAdminOverview, showSlugMissing, renderStats, setRenderLogsRef,
    showToast
} from './view.js';

// Import logs functions
import { renderLogs, setSearchRefs } from './logs.js';

// Import search functions
import { initSearch, applySearchAndFilter, updateSearchStats, setSearchDeps } from './search.js';

// ============================================
// Wire up circular dependencies
// ============================================

// Give API module access to view functions
setViewRefs({
    showDetail,
    showAdminOverview,
    showSlugMissing,
    updateStatusBadge,
    toggleView,
    renderStats
});

// Give view module access to logs renderLogs
setRenderLogsRef(renderLogs);

// Give logs module access to search functions
setSearchRefs({
    applySearchAndFilter,
    updateSearchStats
});

// Give search module access to view/api functions
setSearchDeps({
    showToast,
    loadDetail
});

// ============================================
// Event Listeners
// ============================================

// Initial page load
document.addEventListener('DOMContentLoaded', () => {
    const slug = getSlugFromPath();
    toggleView(slug);

    if (slug) {
        loadDetail(slug, { updateUrl: false });
    } else {
        updateStatusBadge(true);
    }

    loadStats();
    initSearch();
});

// Browser back/forward navigation
window.addEventListener('popstate', () => {
    const slug = getSlugFromPath();
    toggleView(slug);

    if (slug) {
        loadDetail(slug, { updateUrl: false });
    } else {
        updateStatusBadge(true);
    }
});

// Form submission
createForm?.addEventListener('submit', handleCreateWebhook);

// Navigation buttons
backButton?.addEventListener('click', () => {
    window.location.href = '/';
});

resetButton?.addEventListener('click', () => {
    if (currentSlug) {
        resetWebhook(currentSlug);
    }
});

deleteButton?.addEventListener('click', () => {
    if (currentSlug) {
        deleteWebhook(currentSlug);
    }
});

logsRefreshBtn?.addEventListener('click', () => {
    if (currentSlug) {
        loadDetail(currentSlug, { updateUrl: false });
    }
});
