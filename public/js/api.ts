/**
 * API/Network operations
 * @module api
 */

import { normaliseSlug } from './utils';
import { statEls, slugTitle } from './dom';
import type { WebhookHook, WebhookHookSummary, WebhookStats } from './types';

// View function types
type ShowDetailFn = (hook: WebhookHook, options?: { updateUrl?: boolean }) => void;
type ShowAdminOverviewFn = (slug: string, hooks: WebhookHookSummary[]) => void;
type ShowSlugMissingFn = (slug: string, message: string) => void;
type UpdateStatusBadgeFn = (loading: boolean, error?: string) => void;
type ToggleViewFn = (view: string | null) => void;
type RenderStatsFn = (stats: WebhookStats) => void;
type ShowToastFn = (message: string) => void;

interface ViewRefs {
    showDetail?: ShowDetailFn;
    showAdminOverview?: ShowAdminOverviewFn;
    showSlugMissing?: ShowSlugMissingFn;
    updateStatusBadge?: UpdateStatusBadgeFn;
    toggleView?: ToggleViewFn;
    renderStats?: RenderStatsFn;
    showToast?: ShowToastFn;
}

// Late-bound references to avoid circular imports
let _showDetail: ShowDetailFn | null = null;
let _showAdminOverview: ShowAdminOverviewFn | null = null;
let _showSlugMissing: ShowSlugMissingFn | null = null;
let _updateStatusBadge: UpdateStatusBadgeFn | null = null;
let _toggleView: ToggleViewFn | null = null;
let _renderStats: RenderStatsFn | null = null;
let _showToast: ShowToastFn | null = null;

/**
 * Set view module references (called from app.js to break circular dependency)
 */
export function setViewRefs(refs: ViewRefs): void {
    _showDetail = refs.showDetail ?? null;
    _showAdminOverview = refs.showAdminOverview ?? null;
    _showSlugMissing = refs.showSlugMissing ?? null;
    _updateStatusBadge = refs.updateStatusBadge ?? null;
    _toggleView = refs.toggleView ?? null;
    _renderStats = refs.renderStats ?? null;
    _showToast = refs.showToast ?? null;
}

/**
 * Load webhook details by slug
 */
export async function loadDetail(slug: string, options: { updateUrl?: boolean } = {}): Promise<void> {
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
        const error = err as Error;
        if (_showSlugMissing) _showSlugMissing(targetSlug, error.message);
        if (_updateStatusBadge) _updateStatusBadge(false, error.message);
    }
}

/**
 * Load global statistics
 */
export async function loadStats(): Promise<void> {
    try {
        const response = await fetch('/webhooks/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        const { stats } = await response.json();
        if (_renderStats) _renderStats(stats);
    } catch {
        Object.values(statEls).forEach((el) => {
            if (el) el.textContent = '-';
        });
    }
}

/**
 * Reset webhook logs
 */
export async function resetWebhook(slug: string): Promise<void> {
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
        const error = err as Error;
        if (_showToast) _showToast(`Error: ${error.message}`);
    }
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(slug: string): Promise<void> {
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
        const error = err as Error;
        if (_showToast) _showToast(`Error: ${error.message}`);
    }
}

/**
 * Create a new webhook via form submission
 */
export async function handleCreateWebhook(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const slugInput = form.elements.namedItem('slug') as HTMLInputElement;
    const rawSlug = slugInput.value.trim();
    const slug = normaliseSlug(rawSlug);

    if (!slug) {
        if (_showToast) _showToast('Please provide a valid slug.');
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
        const error = err as Error;
        if (_showToast) _showToast(`Error: ${error.message}`);
    } finally {
        toggleForm(form, false);
    }
}

/**
 * Toggle form elements enabled/disabled state
 */
export function toggleForm(form: HTMLFormElement, disabled: boolean): void {
    const elements = form.elements;
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLInputElement | HTMLButtonElement | HTMLSelectElement;
        el.disabled = disabled;
    }
}
