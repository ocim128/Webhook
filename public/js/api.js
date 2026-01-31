/**
 * API/Network operations
 * @module api
 */

import { normaliseSlug } from './utils.js';
import { statEls, slugTitle } from './dom.js';
import { currentSlug } from './state.js';

// Late-bound references to avoid circular imports
let _showDetail = null;
let _showAdminOverview = null;
let _showSlugMissing = null;
let _updateStatusBadge = null;
let _toggleView = null;
let _renderStats = null;

/**
 * Set view module references (called from app.js to break circular dependency)
 * @param {Object} refs - Object with view functions
 */
export function setViewRefs(refs) {
    _showDetail = refs.showDetail;
    _showAdminOverview = refs.showAdminOverview;
    _showSlugMissing = refs.showSlugMissing;
    _updateStatusBadge = refs.updateStatusBadge;
    _toggleView = refs.toggleView;
    _renderStats = refs.renderStats;
}

/**
 * Load webhook details by slug
 * @param {string} slug - Webhook slug
 * @param {Object} options - Options
 * @param {boolean} options.updateUrl - Whether to update browser URL
 */
export async function loadDetail(slug, options = {}) {
    const targetSlug = normaliseSlug(slug);
    if (!targetSlug) {
        if (_toggleView) _toggleView(null);
        return;
    }

    if (_updateStatusBadge) _updateStatusBadge(true);
    if (slugTitle) slugTitle.textContent = `/${targetSlug}`;

    try {
        const response = await fetch(`/webhooks/${encodeURIComponent(targetSlug)}`);
        const payload = await response.json();

        if (payload?.admin) {
            if (_showAdminOverview) _showAdminOverview(targetSlug, payload.hooks || []);
            return;
        }

        if (!response.ok) {
            throw new Error(payload.error || 'Webhook not found');
        }

        if (_showDetail) _showDetail(payload.hook, options);
    } catch (err) {
        if (_showSlugMissing) _showSlugMissing(targetSlug, err.message);
        if (_updateStatusBadge) _updateStatusBadge(false, err.message);
    }
}

/**
 * Load global statistics
 */
export async function loadStats() {
    try {
        const response = await fetch('/webhooks/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        const { stats } = await response.json();
        if (_renderStats) _renderStats(stats);
    } catch (err) {
        Object.values(statEls).forEach((el) => {
            if (el) el.textContent = '-';
        });
    }
}

/**
 * Reset webhook logs
 * @param {string} slug - Webhook slug to reset
 */
export async function resetWebhook(slug) {
    if (!confirm(`Reset logs for "${slug}"?`)) return;

    try {
        const response = await fetch(`/webhooks/${encodeURIComponent(slug)}/reset`, {
            method: 'POST',
        });
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Failed to reset webhook');
        }

        if (_showDetail) _showDetail(payload.hook, { updateUrl: false });
    } catch (err) {
        alert(err.message);
    }
}

/**
 * Delete a webhook
 * @param {string} slug - Webhook slug to delete
 */
export async function deleteWebhook(slug) {
    if (!confirm(`Delete webhook "${slug}"? This cannot be undone.`)) return;

    try {
        const response = await fetch(`/webhooks/${encodeURIComponent(slug)}`, {
            method: 'DELETE',
        });
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Failed to delete webhook');
        }

        window.location.href = '/';
    } catch (err) {
        alert(err.message);
    }
}

/**
 * Create a new webhook via form submission
 * @param {Event} event - Form submit event
 */
export async function handleCreateWebhook(event) {
    event.preventDefault();
    const form = event.target;
    const rawSlug = form.slug.value.trim();
    const slug = normaliseSlug(rawSlug);

    if (!slug) {
        alert('Please provide a valid slug.');
        return;
    }

    toggleForm(form, true);

    try {
        const response = await fetch('/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'Failed to create webhook.');
        }

        form.reset();
        const targetSlug = payload?.hook?.slug || slug;
        window.location.href = `/${targetSlug}`;
    } catch (err) {
        alert(err.message);
    } finally {
        toggleForm(form, false);
    }
}

/**
 * Toggle form elements enabled/disabled state
 * @param {HTMLFormElement} form - Form to toggle
 * @param {boolean} disabled - Whether to disable
 */
export function toggleForm(form, disabled) {
    [...form.elements].forEach((el) => {
        el.disabled = disabled;
    });
}
