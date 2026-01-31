/**
 * Main application entry point
 * Orchestrates all modules and sets up event handlers
 * @module app
 */

// Import DOM references
import {
    createForm, backButton, resetButton, deleteButton, logsRefreshBtn
} from './dom';

// Import state
import { currentSlug } from './state';

// Import API functions
import {
    loadDetail, loadStats, resetWebhook, deleteWebhook,
    handleCreateWebhook, setViewRefs as setApiViewRefs
} from './api';

// Import view functions
import {
    toggleView, updateStatusBadge, getSlugFromPath, showDetail,
    showAdminOverview, showSlugMissing, renderStats, setRenderLogsRef,
    showToast, copyPayload
} from './view';

// Import logs functions
import {
    renderLogs, setSearchRefs, setViewRefs as setLogsViewRefs,
    setEmailRefs as setLogsEmailRefs, renderFilteredLogs, selectLog, updateKeyboardFocus
} from './logs';

// Import search functions
import {
    initSearch, applySearchAndFilter, updateSearchStats, setSearchDeps,
    setEmailRefs as setSearchEmailRefs, setLogsRefs as setSearchLogsRefs
} from './search';

// Import email functions
import {
    extractEmailPayload, extractSubjectFromLog, extractSenderName,
    parseLogJson, setupEmailDetailActions, setupEmailTabs, setupIframeLoader,
    setViewRefs as setEmailViewRefs
} from './email';

// ============================================
// Wire up circular dependencies
// ============================================

// Give API module access to view functions
setApiViewRefs({
    showDetail,
    showAdminOverview,
    showSlugMissing,
    updateStatusBadge,
    toggleView,
    renderStats
});

// Give view module access to logs renderLogs
setRenderLogsRef(renderLogs);

// Give logs module access to view functions
setLogsViewRefs({
    showToast,
    copyPayload
});

// Give logs module access to email functions
setLogsEmailRefs({
    extractEmailPayload,
    extractSubjectFromLog,
    extractSenderName,
    parseLogJson,
    setupEmailDetailActions,
    setupEmailTabs,
    setupIframeLoader
});

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

// Give search module access to email functions
setSearchEmailRefs({
    extractEmailPayload
});

// Give search module access to logs functions
setSearchLogsRefs({
    renderFilteredLogs,
    selectLog,
    updateKeyboardFocus
});

// Give email module access to view functions
setEmailViewRefs({
    showToast
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
