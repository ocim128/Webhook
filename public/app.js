const statusBadge = document.getElementById('status-badge');
const homeView = document.getElementById('home-view');
const slugView = document.getElementById('slug-view');
const slugTitle = document.getElementById('slug-title');
const slugSummary = document.getElementById('slug-summary');
const logsContainer = document.getElementById('logs-container');
const createForm = document.getElementById('create-form');
const backButton = document.getElementById('back-home');
const resetButton = document.getElementById('reset-slug');
const deleteButton = document.getElementById('delete-slug');
const logsRefreshBtn = document.getElementById('logs-refresh');

const statEls = {
  total: document.getElementById('stat-total-hooks'),
  hits: document.getElementById('stat-total-hits'),
  lastHit: document.getElementById('stat-last-hit'),
  last24h: document.getElementById('stat-last24h'),
};

const reservedClientPaths = new Set(['', 'webhooks', 'hooks', 'health', 'meta', 'recent']);

let currentSlug = null;

document.addEventListener('DOMContentLoaded', () => {
  const slug = getSlugFromPath();
  toggleView(slug);
  if (slug) {
    loadDetail(slug, { updateUrl: false });
  } else {
    updateStatusBadge(true);
  }
  loadStats();
});

window.addEventListener('popstate', () => {
  const slug = getSlugFromPath();
  toggleView(slug);
  if (slug) {
    loadDetail(slug, { updateUrl: false });
  } else {
    currentSlug = null;
    updateStatusBadge(true);
  }
});

createForm?.addEventListener('submit', async (event) => {
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
});

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

async function loadDetail(slug, options = {}) {
  const targetSlug = normaliseSlug(slug);
  if (!targetSlug) {
    toggleView(null);
    return;
  }

  updateStatusBadge(true);
  slugTitle.textContent = `/${targetSlug}`;
  try {
    const response = await fetch(`/webhooks/${encodeURIComponent(targetSlug)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Webhook not found');
    }
    showDetail(payload.hook, options);
  } catch (err) {
    showSlugMissing(targetSlug, err.message);
    updateStatusBadge(false, err.message);
  }
}

function showDetail(hook, options = {}) {
  currentSlug = hook.slug;
  updateStatusBadge(true);
  if (options.updateUrl !== false) {
    updateBrowserPath(hook.slug);
  }
  slugTitle.textContent = `/${hook.slug}`;

  const urls = buildUrls(hook.slug);
  slugSummary.innerHTML = `
    <div class="summary-grid">
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
  `;

  attachCopyHandlers();
  renderLogs(hook.logs);
}

function renderLogs(logs) {
  if (!logs || !logs.length) {
    logsContainer.innerHTML = '<p>No payloads yet. Send a POST request to this slug.</p>';
    return;
  }

  logsContainer.innerHTML = '';
  logs.forEach((log) => {
    const block = document.createElement('div');
    block.className = 'log-entry';
    block.innerHTML = `
      <div class="log-meta">
        ${formatTimestamp(log.timestamp)} · ${formatBytes(log.byteSize || 0)}${log.isJson ? ' · JSON' : ''}
      </div>
      <pre>${(log.formatted || log.body || '').trim() || '(empty body)'}</pre>
    `;
    logsContainer.appendChild(block);
  });
}

async function resetWebhook(slug) {
  if (!confirm(`Reset logs for "${slug}"?`)) return;
  try {
    const response = await fetch(`/webhooks/${encodeURIComponent(slug)}/reset`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to reset webhook');
    }
    showDetail(payload.hook, { updateUrl: false });
  } catch (err) {
    alert(err.message);
  }
}

async function deleteWebhook(slug) {
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

function toggleForm(form, disabled) {
  [...form.elements].forEach((el) => {
    el.disabled = disabled;
  });
}

function toggleView(slug) {
  const isSlugView = Boolean(slug);
  homeView?.classList.toggle('hidden', isSlugView);
  slugView?.classList.toggle('hidden', !isSlugView);
  if (!isSlugView) {
    slugTitle.textContent = '';
    slugSummary.innerHTML =
      '<p>Select a webhook by visiting <code>/&lt;slug&gt;</code> after you create one.</p>';
    logsContainer.innerHTML = '<p>No payloads yet.</p>';
  }
}

function updateStatusBadge(isOnline, message = '') {
  statusBadge.textContent = isOnline ? 'Server online' : `Offline: ${message || 'unreachable'}`;
  statusBadge.classList.toggle('online', isOnline);
  statusBadge.classList.toggle('offline', !isOnline);
}

function showSlugMissing(slug, message) {
  slugSummary.innerHTML = `
    <p>Webhook <code>/${slug}</code> is not registered yet.</p>
    <p>Send a POST request to <code>${window.location.origin}/${slug}</code>
    to create it automatically, or <a href="/">create it from the home page</a>.</p>
    <p class="error">${message || ''}</p>
  `;
  logsContainer.innerHTML = '<p>No payloads yet.</p>';
}

function buildUrls(slug) {
  const origin = window.location.origin;
  return {
    short: `${origin}/${slug}`,
    explicit: `${origin}/hooks/${slug}`,
  };
}

function getSlugFromPath() {
  const trimmed = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed || reservedClientPaths.has(trimmed)) {
    return null;
  }
  return trimmed;
}

function updateBrowserPath(slug) {
  const target = slug ? `/${slug}` : '/';
  if (window.location.pathname !== target) {
    window.history.pushState({ slug }, '', target);
  }
}

function normaliseSlug(value) {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function loadStats() {
  try {
    const response = await fetch('/webhooks/stats');
    if (!response.ok) throw new Error('Failed to load stats');
    const { stats } = await response.json();
    renderStats(stats);
  } catch (err) {
    Object.values(statEls).forEach((el) => {
      if (el) el.textContent = '-';
    });
  }
}

function renderStats(stats = {}) {
  if (statEls.total) statEls.total.textContent = stats.totalWebhooks ?? 0;
  if (statEls.hits) statEls.hits.textContent = stats.totalHits ?? 0;
  if (statEls.last24h) statEls.last24h.textContent = stats.hitsLast24h ?? 0;
  if (statEls.lastHit) statEls.lastHit.textContent = stats.lastPayloadAt ? formatTimestamp(stats.lastPayloadAt) : '-';
}

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatBytes(size) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = size;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function attachCopyHandlers() {
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
