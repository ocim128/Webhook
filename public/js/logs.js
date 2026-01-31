/**
 * Log list and detail rendering
 * @module logs
 */

import {
    formatTimestamp, formatRelativeTime, formatBytes,
    escapeHtml, encodeSrcDoc, truncateText, compactWhitespace,
    getInitials, getAvatarColor, extractVerificationCode, highlightMatch
} from './utils.js';
import { logListEl, logDetailEl } from './dom.js';
import {
    logsCache, setLogsCache, activeLogId, setActiveLogId,
    searchQuery, activeFilter, keyboardFocusIndex, setKeyboardFocusIndex,
    setFilteredLogs
} from './state.js';
import { showToast, copyPayload } from './view.js';
import {
    extractEmailPayload, extractSubjectFromLog, extractSenderName,
    parseLogJson, setupEmailDetailActions, setupEmailTabs, setupIframeLoader
} from './email.js';

// Late-bound references for search module functions
let _applySearchAndFilter = null;
let _updateSearchStats = null;

/**
 * Set search module references (called from app.js to break circular dependency)
 * @param {Object} refs - Object with applySearchAndFilter and updateSearchStats
 */
export function setSearchRefs(refs) {
    _applySearchAndFilter = refs.applySearchAndFilter;
    _updateSearchStats = refs.updateSearchStats;
}

/**
 * Derive a display label for a log entry
 * @param {Object} log - Log entry
 * @returns {string} Display label
 */
export function deriveLogLabel(log) {
    if (!log) return 'POST payload';
    const subject = extractSubjectFromLog(log);
    if (subject) {
        return subject;
    }
    return log.isJson ? 'JSON payload' : 'POST payload';
}

/**
 * Build preview text for a log entry
 * @param {Object} log - Log entry
 * @param {Object|null} emailPayload - Pre-extracted email payload
 * @returns {string} Preview text
 */
export function buildLogPreview(log, emailPayload = null) {
    const email = emailPayload || extractEmailPayload(log);
    const previewSource =
        email?.plainBody || email?.htmlBody || log.bodyPreview || log.body || '';
    return truncateText(compactWhitespace(previewSource || ''), 140);
}

/**
 * Build info line for a log entry
 * @param {Object} log - Log entry
 * @returns {string} Info line text
 */
export function buildLogInfoLine(log) {
    const parts = [formatTimestamp(log.timestamp), formatBytes(log.byteSize || 0)];
    const participants = buildLogParticipants(log);
    if (participants) {
        parts.push(participants);
    }
    return parts.join(' · ');
}

/**
 * Build type badge for a log entry
 * @param {Object} log - Log entry
 * @param {Object|null} emailPayload - Pre-extracted email payload
 * @returns {Object} Badge object with label and variant
 */
export function buildLogBadge(log, emailPayload = null) {
    if (emailPayload || extractEmailPayload(log)) {
        return { label: 'Email JSON', variant: 'chip-mail' };
    }
    if (log.isJson) {
        return { label: 'JSON', variant: 'chip-json' };
    }
    return { label: 'Plain POST', variant: 'chip-plain' };
}

/**
 * Build participants string from log
 * @param {Object} log - Log entry
 * @returns {string} Participants string
 */
export function buildLogParticipants(log) {
    const data = parseLogJson(log);
    if (!data || typeof data !== 'object') {
        return '';
    }
    const from = data.from || data.sender || data.source || '';
    const to = data.to || data.recipient || '';
    if (from && to) {
        return `${from} -> ${to}`;
    }
    if (from) {
        return `From ${from}`;
    }
    if (to) {
        return `To ${to}`;
    }
    return '';
}

/**
 * Setup copy button for non-email log detail
 * @param {string} rawBody - Raw body text
 */
export function setupLogDetailActions(rawBody) {
    const copyBtn = logDetailEl.querySelector('.copy-payload');
    if (!copyBtn || !rawBody) {
        return;
    }
    copyBtn.addEventListener('click', () => copyPayload(rawBody));
}

/**
 * Select a log by ID and render its detail
 * @param {string} logId - Log ID to select
 */
export function selectLog(logId) {
    setActiveLogId(logId);
    logListEl.querySelectorAll('.log-item').forEach((node, idx) => {
        const log = logsCache[idx];
        node.classList.toggle('active', log && log.id === logId);
    });
    const entry = logsCache.find((log) => log.id === logId);
    renderLogDetail(entry);
}

/**
 * Render log detail panel
 * @param {Object} log - Log entry to render
 */
export function renderLogDetail(log) {
    if (!log) {
        logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
        return;
    }

    const emailPayload = extractEmailPayload(log);
    const badge = buildLogBadge(log, emailPayload);
    const rawBody = (log.formatted || log.body || '').trim();
    const verificationCode = extractVerificationCode(rawBody);

    if (emailPayload) {
        const relativeTime = formatRelativeTime(log.timestamp);
        const fullTime = formatTimestamp(log.timestamp);

        logDetailEl.innerHTML = `
      <div class="email-detail-header">
        <h2 class="email-detail-subject">${escapeHtml(emailPayload.subject || '(no subject)')}</h2>
        <div class="email-detail-meta-grid">
          <div class="email-detail-meta-item">
            <span class="email-detail-meta-label">From</span>
            <span class="email-detail-meta-value clickable" data-copy="${escapeHtml(emailPayload.from || '')}">${escapeHtml(emailPayload.from || 'Unknown')}</span>
          </div>
          <div class="email-detail-meta-item">
            <span class="email-detail-meta-label">To</span>
            <span class="email-detail-meta-value clickable" data-copy="${escapeHtml(emailPayload.to || '')}">${escapeHtml(emailPayload.to || 'Unknown')}</span>
          </div>
          <div class="email-detail-meta-item">
            <span class="email-detail-meta-label">Date</span>
            <span class="email-detail-meta-value" title="${escapeHtml(fullTime)}">${escapeHtml(relativeTime)} · ${escapeHtml(fullTime)}</span>
          </div>
          <div class="email-detail-meta-item">
            <span class="email-detail-meta-label">Size</span>
            <span class="email-detail-meta-value">${formatBytes(log.byteSize || 0)}</span>
          </div>
        </div>
        ${verificationCode ? `
          <div class="verification-code-wrapper">
            <span class="verification-code-label">Verification Code Detected</span>
            <span class="verification-code" data-copy="${verificationCode}" title="Click to copy">
              ${verificationCode}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </span>
          </div>
        ` : ''}
        <div class="email-actions">
          <button type="button" class="action-btn primary copy-payload">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy JSON
          </button>
          <button type="button" class="action-btn print-email">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print
          </button>
          <button type="button" class="action-btn download-email">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </button>
          <span class="chip ${badge.variant}">${badge.label}</span>
        </div>
      </div>
      
      <div class="email-body-tabs">
        <button type="button" class="email-body-tab active" data-tab="preview">Preview</button>
        <button type="button" class="email-body-tab" data-tab="html">HTML</button>
        <button type="button" class="email-body-tab" data-tab="plain">Plain Text</button>
        <button type="button" class="email-body-tab" data-tab="raw">Raw JSON</button>
      </div>
      
      <div class="email-body-content active" data-content="preview">
        ${emailPayload.htmlBody
                ? `<div class="email-preview loading">
              <div class="email-preview-loading"><div class="email-preview-spinner"></div></div>
              <iframe sandbox="allow-same-origin" srcdoc="${encodeSrcDoc(emailPayload.htmlBody)}"></iframe>
            </div>`
                : `<pre>${escapeHtml(emailPayload.plainBody || '(no content)')}</pre>`
            }
      </div>
      <div class="email-body-content" data-content="html">
        <pre>${escapeHtml(emailPayload.htmlBody || '(no html body)')}</pre>
      </div>
      <div class="email-body-content" data-content="plain">
        <pre>${escapeHtml(emailPayload.plainBody || '(no plain body)')}</pre>
      </div>
      <div class="email-body-content" data-content="raw">
        <pre>${escapeHtml(rawBody || '(empty body)')}</pre>
      </div>
    `;
        setupEmailDetailActions(rawBody, emailPayload);
        setupEmailTabs();
        setupIframeLoader();
        return;
    }

    // Non-email payload
    const sublineParts = [formatBytes(log.byteSize || 0)];
    if (log.id) sublineParts.push(`Ref ${log.id}`);

    logDetailEl.innerHTML = `
    <div class="log-detail-top">
      <div>
        <div class="log-detail-time">${formatTimestamp(log.timestamp)}</div>
        <div class="log-detail-subline">${escapeHtml(sublineParts.join(' · '))}</div>
      </div>
      <div class="log-detail-actions">
        <span class="chip ${badge.variant}">${badge.label}</span>
        ${rawBody.length > 0 ? '<button type="button" class="action-btn primary copy-payload">Copy</button>' : ''}
      </div>
    </div>
    <pre>${escapeHtml(rawBody || '(empty body)')}</pre>
  `;
    setupLogDetailActions(rawBody);
}

/**
 * Render filtered logs with search highlighting
 * @param {Array} logs - Filtered logs to render
 */
export function renderFilteredLogs(logs) {
    if (!logs.length) {
        logListEl.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p class="no-results-text">No emails found</p>
        <p class="no-results-hint">${searchQuery ? `No results for "${escapeHtml(searchQuery)}"` : 'Try adjusting your filters'}</p>
      </div>
    `;
        logDetailEl.innerHTML = '<p>No matching payloads to display.</p>';
        return;
    }

    logListEl.innerHTML = '';
    logs.forEach((log, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        const emailPayload = extractEmailPayload(log);
        const badge = buildLogBadge(log, emailPayload);
        const preview = buildLogPreview(log, emailPayload);
        const isActive = log.id === activeLogId;
        const isKeyboardFocus = index === keyboardFocusIndex;

        item.className = `log-item ${badge.variant}${isActive ? ' active' : ''}${isKeyboardFocus ? ' keyboard-focus' : ''}`;
        item.dataset.logIndex = index;

        const senderName = extractSenderName(log, emailPayload);
        const initials = getInitials(senderName);
        const avatarColor = getAvatarColor(senderName);
        const subject = emailPayload?.subject || deriveLogLabel(log);
        const relativeTime = formatRelativeTime(log.timestamp);

        // Highlight search matches
        const highlightedSubject = searchQuery ? highlightMatch(subject, searchQuery) : escapeHtml(subject);
        const highlightedSender = searchQuery ? highlightMatch(senderName, searchQuery) : escapeHtml(senderName);

        item.innerHTML = `
      <span class="log-item-avatar ${avatarColor}" aria-hidden="true">${escapeHtml(initials)}</span>
      <span class="log-item-content">
        <span class="log-item-header">
          <span class="log-item-subject">${highlightedSubject}</span>
          <span class="log-item-timestamp">${escapeHtml(relativeTime)}</span>
        </span>
        <span class="log-item-meta">
          <span class="log-item-sender">${highlightedSender}</span>
          <span class="chip ${badge.variant}">${badge.label}</span>
        </span>
        ${preview ? `<p class="log-preview">${escapeHtml(preview)}</p>` : ''}
      </span>
    `;
        item.addEventListener('click', () => {
            setKeyboardFocusIndex(index);
            selectLog(log.id);
            updateKeyboardFocus();
        });
        logListEl.appendChild(item);
    });

    // Select first if no active
    if (!logs.some(log => log.id === activeLogId) && logs.length > 0) {
        setActiveLogId(logs[0].id);
        setKeyboardFocusIndex(0);
        selectLog(activeLogId);
    }
}

/**
 * Update keyboard focus indicator
 */
export function updateKeyboardFocus() {
    const items = logListEl.querySelectorAll('.log-item');
    items.forEach((item, idx) => {
        item.classList.toggle('keyboard-focus', idx === keyboardFocusIndex);
    });
}

/**
 * Render logs list (main entry point)
 * @param {Array} logs - Logs to render
 */
export function renderLogs(logs) {
    setLogsCache(logs || []);
    setFilteredLogs(logsCache);
    setKeyboardFocusIndex(0);

    if (!logsCache.length) {
        logListEl.innerHTML = '<p>No payloads yet. Send a POST request to this slug.</p>';
        logDetailEl.innerHTML = '<p>Select a payload from the list to inspect its body.</p>';
        if (_updateSearchStats) _updateSearchStats(0, 0);
        return;
    }

    // Reset search/filter when new logs come in
    if (searchQuery || activeFilter !== 'all') {
        if (_applySearchAndFilter) _applySearchAndFilter();
    } else {
        renderFilteredLogs(logsCache);
        if (_updateSearchStats) _updateSearchStats(logsCache.length, logsCache.length);
    }

    if (!logsCache.some((log) => log.id === activeLogId)) {
        setActiveLogId(logsCache[0].id);
    }

    selectLog(activeLogId);
}
