/**
 * Email-specific handling functions
 * @module email
 */

import { escapeHtml, formatTimestamp } from './utils.js';
import { logDetailEl } from './dom.js';
import { showToast } from './view.js';

/**
 * Parse log body as JSON (with caching)
 * @param {Object} log - Log entry
 * @returns {Object|null} Parsed JSON or null
 */
export function parseLogJson(log) {
    if (!log?.isJson) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(log, '__parsedPayload')) {
        return log.__parsedPayload;
    }
    const raw = log.body || log.formatted;
    if (!raw) {
        log.__parsedPayload = null;
        return null;
    }
    try {
        log.__parsedPayload = JSON.parse(raw);
    } catch (err) {
        log.__parsedPayload = null;
    }
    return log.__parsedPayload;
}

/**
 * Extract email payload from log if it has email structure
 * @param {Object} log - Log entry
 * @returns {Object|null} Email payload or null
 */
export function extractEmailPayload(log) {
    const data = parseLogJson(log);
    if (!data || typeof data !== 'object') {
        return null;
    }
    const hasEmailShape =
        (data?.plainBody || data?.htmlBody) && (data?.subject || data?.from || data?.to);
    if (!hasEmailShape) {
        return null;
    }
    return {
        from: data.from,
        to: data.to,
        subject: data.subject,
        date: data.date,
        plainBody: data.plainBody,
        htmlBody: data.htmlBody,
    };
}

/**
 * Extract subject from log JSON
 * @param {Object} log - Log entry
 * @returns {string} Subject or empty string
 */
export function extractSubjectFromLog(log) {
    const data = parseLogJson(log);
    if (!data || typeof data !== 'object') {
        return '';
    }
    const subject = typeof data.subject === 'string' ? data.subject.trim() : '';
    return subject;
}

/**
 * Extract sender name from log
 * @param {Object} log - Log entry
 * @param {Object|null} emailPayload - Pre-extracted email payload
 * @returns {string} Sender name
 */
export function extractSenderName(log, emailPayload = null) {
    const email = emailPayload || extractEmailPayload(log);
    if (email?.from) {
        // Extract name from "Name <email@example.com>" format
        const match = email.from.match(/^([^<]+)</);
        if (match) return match[1].trim();
        return email.from.split('@')[0];
    }

    const data = parseLogJson(log);
    if (data?.from) return data.from.split('@')[0];
    if (data?.sender) return data.sender.split('@')[0];

    return 'Unknown';
}

/**
 * Setup email detail action buttons (copy, print, download)
 * @param {string} rawBody - Raw email body JSON
 * @param {Object} emailPayload - Parsed email payload
 */
export function setupEmailDetailActions(rawBody, emailPayload) {
    // Copy payload button
    const copyBtn = logDetailEl.querySelector('.copy-payload');
    if (copyBtn && rawBody) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(rawBody).then(() => {
                showToast('Copied JSON to clipboard');
            }).catch(() => {
                alert('Copy failed, please copy manually.');
            });
        });
    }

    // Copy email addresses on click
    logDetailEl.querySelectorAll('.email-detail-meta-value.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const value = el.getAttribute('data-copy');
            if (value) {
                navigator.clipboard.writeText(value).then(() => {
                    showToast(`Copied: ${value}`);
                });
            }
        });
    });

    // Copy verification code
    const codeEl = logDetailEl.querySelector('.verification-code');
    if (codeEl) {
        codeEl.addEventListener('click', () => {
            const code = codeEl.getAttribute('data-copy');
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    showToast(`Copied verification code: ${code}`);
                });
            }
        });
    }

    // Print button
    const printBtn = logDetailEl.querySelector('.print-email');
    if (printBtn && emailPayload) {
        printBtn.addEventListener('click', () => {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${escapeHtml(emailPayload.subject || 'Email')}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
            .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem; margin-bottom: 1rem; }
            .meta { color: #6b7280; font-size: 0.875rem; margin: 0.25rem 0; }
            .subject { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; }
            .body { line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="subject">${escapeHtml(emailPayload.subject || '(no subject)')}</h1>
            <p class="meta"><strong>From:</strong> ${escapeHtml(emailPayload.from || 'Unknown')}</p>
            <p class="meta"><strong>To:</strong> ${escapeHtml(emailPayload.to || 'Unknown')}</p>
            <p class="meta"><strong>Date:</strong> ${emailPayload.date ? formatTimestamp(emailPayload.date) : '-'}</p>
          </div>
          <div class="body">
            ${emailPayload.htmlBody || `<pre>${escapeHtml(emailPayload.plainBody || '')}</pre>`}
          </div>
        </body>
        </html>
      `);
            printWindow.document.close();
            printWindow.print();
        });
    }

    // Download button
    const downloadBtn = logDetailEl.querySelector('.download-email');
    if (downloadBtn && rawBody) {
        downloadBtn.addEventListener('click', () => {
            const blob = new Blob([rawBody], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `email-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Downloaded email JSON');
        });
    }
}

/**
 * Setup email body tab switching
 */
export function setupEmailTabs() {
    const tabs = logDetailEl.querySelectorAll('.email-body-tab');
    const contents = logDetailEl.querySelectorAll('.email-body-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const content = logDetailEl.querySelector(`[data-content="${targetTab}"]`);
            if (content) content.classList.add('active');
        });
    });
}

/**
 * Setup iframe auto-resize on load
 */
export function setupIframeLoader() {
    const previewContainer = logDetailEl.querySelector('.email-preview');
    const iframe = previewContainer?.querySelector('iframe');

    if (iframe && previewContainer) {
        iframe.addEventListener('load', () => {
            previewContainer.classList.remove('loading');

            // Try to auto-resize iframe to content
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                if (height > 100) {
                    iframe.style.height = Math.min(height + 20, 600) + 'px';
                }
            } catch (e) {
                // Cross-origin restriction, keep default height
            }
        });
    }
}
