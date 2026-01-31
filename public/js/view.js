/**
 * View management and UI updates
 * @module view
 */

import { formatTimestamp, escapeHtml } from './utils.js';
import {
    statusBadge, homeView, slugView, slugTitle, slugSummary,
    logListEl, logDetailEl, statEls
} from './dom.js';
import {
    reservedClientPaths, setCurrentSlug, setActiveLogId,
    resetViewState
} from './state.js';

// Late-bound reference for renderLogs to avoid circular import
let _renderLogs = null;

/**
 * Set the renderLogs function (called from app.js to break circular dependency)
 * @param {Function} fn - renderLogs function
 */
export function setRenderLogsRef(fn) {
    _renderLogs = fn;
}

/**
 * Toggle between home view and slug view
 * @param {string|null} slug - Slug to show, or null for home
 */
export function toggleView(slug) {
    const isSlugView = Boolean(slug);
    homeView?.classList.toggle('hidden', isSlugView);
    slugView?.classList.toggle('hidden', !isSlugView);
    if (!isSlugView) {
        slugTitle.textContent = '';
        slugSummary.innerHTML =
            '<p>Select a webhook by visiting <code>/&lt;slug&gt;</code> after you create one.</p>';
        logListEl.innerHTML = '<p>No payloads yet.</p>';
        logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
        resetViewState();
    }
}

/**
 * Update the connection status badge
 * @param {boolean} isOnline - Whether connected
 * @param {string} message - Optional error message
 */
export function updateStatusBadge(isOnline, message = '') {
    statusBadge.textContent = isOnline ? 'Server online' : `Offline: ${message || 'unreachable'}`;
    statusBadge.classList.toggle('online', isOnline);
    statusBadge.classList.toggle('offline', !isOnline);
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 */
export function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

/**
 * Build webhook URLs
 * @param {string} slug - Webhook slug
 * @returns {Object} Object with short and explicit URLs
 */
export function buildUrls(slug) {
    const origin = window.location.origin;
    return {
        short: `${origin}/${slug}`,
        explicit: `${origin}/hooks/${slug}`,
    };
}

/**
 * Get slug from current URL path
 * @returns {string|null} Slug or null
 */
export function getSlugFromPath() {
    const trimmed = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!trimmed || reservedClientPaths.has(trimmed)) {
        return null;
    }
    return trimmed;
}

/**
 * Update browser URL path
 * @param {string} slug - Slug to set in URL
 */
export function updateBrowserPath(slug) {
    const target = slug ? `/${slug}` : '/';
    if (window.location.pathname !== target) {
        window.history.pushState({ slug }, '', target);
    }
}

/**
 * Render global statistics
 * @param {Object} stats - Statistics object
 */
export function renderStats(stats = {}) {
    if (statEls.total) statEls.total.textContent = stats.totalWebhooks ?? 0;
    if (statEls.hits) statEls.hits.textContent = stats.totalHits ?? 0;
    if (statEls.last24h) statEls.last24h.textContent = stats.hitsLast24h ?? 0;
    if (statEls.lastHit) statEls.lastHit.textContent = stats.lastPayloadAt ? formatTimestamp(stats.lastPayloadAt) : '-';
}

/**
 * Attach copy button handlers to summary section
 */
export function attachCopyHandlers() {
    document.querySelectorAll('button[data-copy]').forEach((button) => {
        button.onclick = async () => {
            const value = button.getAttribute('data-copy');
            if (!value) return;
            try {
                await navigator.clipboard.writeText(value);
                statusBadge.textContent = 'Copied endpoint to clipboard';
                setTimeout(() => updateStatusBadge(true), 1500);
            } catch (err) {
                alert('Copy failed, please copy manually.');
            }
        };
    });
}

/**
 * Copy payload to clipboard
 * @param {string} text - Text to copy
 */
export async function copyPayload(text) {
    try {
        await navigator.clipboard.writeText(text);
        statusBadge.textContent = 'Copied payload to clipboard';
        setTimeout(() => updateStatusBadge(true), 1500);
    } catch (err) {
        alert('Copy failed, please copy manually.');
    }
}

/**
 * Show missing slug error view
 * @param {string} slug - Missing slug
 * @param {string} message - Error message
 */
export function showSlugMissing(slug, message) {
    slugSummary.innerHTML = `
    <p>Webhook <code>/${slug}</code> is not registered yet.</p>
    <p>Send a POST request to <code>${window.location.origin}/${slug}</code>
    to create it automatically, or <a href="/">create it from the home page</a>.</p>
    <p class="error">${message || ''}</p>
  `;
    logListEl.innerHTML = '<p>No payloads yet.</p>';
    logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
    resetViewState();
}

/**
 * Show admin overview of all webhooks
 * @param {string} slug - Admin slug
 * @param {Array} hooks - Array of webhook objects
 */
export function showAdminOverview(slug, hooks = []) {
    setCurrentSlug(slug);
    updateStatusBadge(true);
    updateBrowserPath(slug);
    slugTitle.textContent = `/${slug} (admin overview)`;

    if (!hooks.length) {
        slugSummary.innerHTML = `
      <p>No webhooks are registered yet.</p>
      <p>Create one from the home view or send a POST to any slug to auto-create it.</p>
    `;
    } else {
        const rows = hooks
            .map(
                (hook) => `
        <li>
          <div>
            <strong>/${hook.slug}</strong>
            <small>${hook.description || 'No description'}</small>
          </div>
          <div class="admin-metrics">
            <span>${hook.hits ?? 0} hits</span>
            <span>${hook.lastHit ? formatTimestamp(hook.lastHit) : 'never'}</span>
          </div>
        </li>
      `,
            )
            .join('');
        slugSummary.innerHTML = `
      <div class="admin-summary">
        <p>Admin view: ${hooks.length} webhooks registered.</p>
        <ul>${rows}</ul>
      </div>
    `;
    }

    logListEl.innerHTML = '<p>Select a specific slug to inspect its payloads.</p>';
    logDetailEl.innerHTML = '<p>This view lists all slugs. Open /slug-name to view payloads.</p>';
    resetViewState();
}

/**
 * Show webhook detail view
 * @param {Object} hook - Webhook object
 * @param {Object} options - Options
 */
export function showDetail(hook, options = {}) {
    setCurrentSlug(hook.slug);
    updateStatusBadge(true);
    if (options.updateUrl !== false) {
        updateBrowserPath(hook.slug);
    }
    slugTitle.textContent = `/${hook.slug}`;

    const urls = buildUrls(hook.slug);
    slugSummary.innerHTML = `
    <div class="summary-card compact">
      <div class="summary-meta">
        <div>
          <div class="label">Description</div>
          <div>${hook.description || '-'}</div>
        </div>
        <div>
          <div class="label">Created</div>
          <div>${formatTimestamp(hook.createdAt)}</div>
        </div>
        <div>
          <div class="label">Total Hits</div>
          <div>${hook.hits}</div>
        </div>
        <div>
          <div class="label">Last Delivery</div>
          <div>${hook.lastHit ? formatTimestamp(hook.lastHit) : '-'}</div>
        </div>
      </div>
      <div class="summary-extra">
        <div class="metadata-block">
          <div class="label">Metadata</div>
          <pre>${JSON.stringify(hook.metadata || {}, null, 2)}</pre>
        </div>
        <div class="endpoints">
          <div class="label">Send POST requests to:</div>
          <div class="endpoint-line">
            <code id="short-url">${urls.short}</code>
            <button type="button" class="ghost small" data-copy="${urls.short}">Copy</button>
          </div>
          <div class="endpoint-line">
            <code id="explicit-url">${urls.explicit}</code>
            <button type="button" class="ghost small" data-copy="${urls.explicit}">Copy</button>
          </div>
        </div>
      </div>
    </div>
  `;

    attachCopyHandlers();
    setActiveLogId(null);

    // Use late-bound reference to avoid circular dependency
    if (_renderLogs) {
        _renderLogs(hook.logs || []);
    }
}
