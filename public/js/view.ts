/**
 * View management and UI updates
 * @module view
 */

import { formatTimestamp } from './utils';
import {
  statusBadge, homeView, slugView, slugTitle, slugSummary,
  logListEl, logDetailEl, statEls
} from './dom';
import {
  reservedClientPaths, setCurrentSlug, setActiveLogId,
  resetViewState
} from './state';
import type { WebhookHook, WebhookHookSummary, WebhookStats, WebhookLogEntry } from './types';

// Late-bound reference for renderLogs to avoid circular import
let _renderLogs: ((logs: WebhookLogEntry[]) => void) | null = null;

/**
 * Set the renderLogs function (called from app.js to break circular dependency)
 */
export function setRenderLogsRef(fn: (logs: WebhookLogEntry[]) => void): void {
  _renderLogs = fn;
}

/**
 * Toggle between home view and slug view
 */
export function toggleView(slug: string | null): void {
  const isSlugView = Boolean(slug);
  homeView?.classList.toggle('hidden', isSlugView);
  slugView?.classList.toggle('hidden', !isSlugView);
  if (!isSlugView) {
    if (slugTitle) slugTitle.textContent = '';
    if (slugSummary) slugSummary.innerHTML =
      '<p>Select a webhook by visiting <code>/&lt;slug&gt;</code> after you create one.</p>';
    if (logListEl) logListEl.innerHTML = '<p>No payloads yet.</p>';
    if (logDetailEl) logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
    resetViewState();
  }
}

/**
 * Update the connection status badge
 */
export function updateStatusBadge(isOnline: boolean, message = ''): void {
  if (!statusBadge) return;
  statusBadge.textContent = isOnline ? 'Server online' : `Offline: ${message || 'unreachable'}`;
  statusBadge.classList.toggle('online', isOnline);
  statusBadge.classList.toggle('offline', !isOnline);
}

/**
 * Show toast notification
 */
export function showToast(message: string): void {
  let toast = document.querySelector('.toast') as HTMLElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast?.classList.remove('show');
  }, 2500);
}

/**
 * Build webhook URLs
 */
export function buildUrls(slug: string): { short: string; explicit: string } {
  const origin = window.location.origin;
  return {
    short: `${origin}/${slug}`,
    explicit: `${origin}/hooks/${slug}`,
  };
}

/**
 * Get slug from current URL path or query string
 */
export function getSlugFromPath(): string | null {
  // First check query parameter ?slug=
  const params = new URLSearchParams(window.location.search);
  const querySlug = params.get('slug');
  if (querySlug && !reservedClientPaths.has(querySlug)) {
    return querySlug;
  }

  // Fallback to path-based slug
  const trimmed = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed || reservedClientPaths.has(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Update browser URL path
 */
export function updateBrowserPath(slug: string | null): void {
  const target = slug ? `/${slug}` : '/';
  if (window.location.pathname !== target) {
    window.history.pushState({ slug }, '', target);
  }
}

/**
 * Render global statistics
 */
export function renderStats(stats: WebhookStats | Record<string, never> = {}): void {
  const s = stats as WebhookStats;
  if (statEls.total) statEls.total.textContent = String(s.totalWebhooks ?? 0);
  if (statEls.hits) statEls.hits.textContent = String(s.totalHits ?? 0);
  if (statEls.last24h) statEls.last24h.textContent = String(s.hitsLast24h ?? 0);
  if (statEls.lastHit) statEls.lastHit.textContent = s.lastPayloadAt ? formatTimestamp(s.lastPayloadAt) : '-';
}

/**
 * Attach copy button handlers to summary section
 */
export function attachCopyHandlers(): void {
  document.querySelectorAll<HTMLButtonElement>('button[data-copy]').forEach((button) => {
    button.onclick = async () => {
      const value = button.getAttribute('data-copy');
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        if (statusBadge) statusBadge.textContent = 'Copied endpoint to clipboard';
        setTimeout(() => updateStatusBadge(true), 1500);
      } catch {
        showToast('Copy failed, please copy manually.');
      }
    };
  });
}

/**
 * Copy payload to clipboard
 */
export async function copyPayload(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    if (statusBadge) statusBadge.textContent = 'Copied payload to clipboard';
    setTimeout(() => updateStatusBadge(true), 1500);
  } catch {
    showToast('Copy failed, please copy manually.');
  }
}

/**
 * Show missing slug error view
 */
export function showSlugMissing(slug: string, message: string): void {
  if (slugSummary) {
    slugSummary.innerHTML = `
    <p>Webhook <code>/${slug}</code> is not registered yet.</p>
    <p>Send a POST request to <code>${window.location.origin}/${slug}</code>
    to create it automatically, or <a href="/">create it from the home page</a>.</p>
    <p class="error">${message || ''}</p>
  `;
  }
  if (logListEl) logListEl.innerHTML = '<p>No payloads yet.</p>';
  if (logDetailEl) logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
  resetViewState();
}

/**
 * Show admin overview of all webhooks
 */
export function showAdminOverview(slug: string, hooks: WebhookHookSummary[] = []): void {
  setCurrentSlug(slug);
  updateStatusBadge(true);
  updateBrowserPath(slug);
  if (slugTitle) slugTitle.textContent = `/${slug} (admin overview)`;

  if (!hooks.length) {
    if (slugSummary) slugSummary.innerHTML = `
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
    if (slugSummary) slugSummary.innerHTML = `
      <div class="admin-summary">
        <p>Admin view: ${hooks.length} webhooks registered.</p>
        <ul>${rows}</ul>
      </div>
    `;
  }

  if (logListEl) logListEl.innerHTML = '<p>Select a specific slug to inspect its payloads.</p>';
  if (logDetailEl) logDetailEl.innerHTML = '<p>This view lists all slugs. Open /slug-name to view payloads.</p>';
  resetViewState();
}

/**
 * Show webhook detail view
 */
export function showDetail(hook: WebhookHook, options: { updateUrl?: boolean } = {}): void {
  setCurrentSlug(hook.slug);
  updateStatusBadge(true);
  if (options.updateUrl !== false) {
    updateBrowserPath(hook.slug);
  }
  if (slugTitle) slugTitle.textContent = `/${hook.slug}`;

  const urls = buildUrls(hook.slug);
  if (slugSummary) slugSummary.innerHTML = `
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
