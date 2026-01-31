/**
 * Pure utility functions - no DOM, no state dependencies
 * @module utils
 */

/**
 * Format a timestamp to locale string
 * @param {string|Date} value - Timestamp to format
 * @returns {string} Formatted date string
 */
export function formatTimestamp(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

/**
 * Format a timestamp to relative time (e.g., "5m ago")
 * @param {string|Date} value - Timestamp to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    // For older dates, show short date
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Format bytes to human-readable size
 * @param {number} size - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatBytes(size) {
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

/**
 * Escape HTML entities to prevent XSS
 * @param {string} value - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
    if (!value && value !== 0) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Encode HTML for use in iframe srcdoc attribute
 * @param {string} html - HTML to encode
 * @returns {string} Encoded HTML
 */
export function encodeSrcDoc(html) {
    if (!html) return '';
    return escapeHtml(html);
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} value - Text to truncate
 * @param {number} maxLength - Maximum length (default: 120)
 * @returns {string} Truncated text
 */
export function truncateText(value, maxLength = 120) {
    if (!value) return '';
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}

/**
 * Collapse multiple whitespace characters into single spaces
 * @param {string} value - Text to compact
 * @returns {string} Compacted text
 */
export function compactWhitespace(value) {
    if (!value) {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize and sanitize a slug value
 * @param {string} value - Raw slug input
 * @returns {string} Normalized slug
 */
export function normaliseSlug(value) {
    if (!value) return '';
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9@._-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Get initials from a name string
 * @param {string} name - Name to extract initials from
 * @returns {string} 1-2 character initials
 */
export function getInitials(name) {
    if (!name || name === 'Unknown') return '?';
    const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/**
 * Get a consistent avatar color based on name hash
 * @param {string} name - Name to hash
 * @returns {string} Color class name
 */
export function getAvatarColor(name) {
    const colors = ['', 'green', 'blue', 'pink', 'orange', 'cyan', 'yellow'];
    if (!name) return '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash = hash & hash;
    }
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Extract verification/OTP codes from text
 * @param {string} text - Text to search for codes
 * @returns {string|null} Found code or null
 */
export function extractVerificationCode(text) {
    if (!text) return null;
    // Look for 4-8 digit codes that appear to be verification codes
    const patterns = [
        /(?:code|verification|verify|otp|pin|token)[:\s]*(\d{4,8})/i,
        /(\d{4,8})(?:\s*is your|verification|code)/i,
        /\b(\d{6})\b/  // Most common: 6-digit codes
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Convert URLs in text to clickable links
 * @param {string} text - Text containing URLs
 * @returns {string} Text with URLs as anchor tags
 */
export function linkifyText(text) {
    if (!text) return '';

    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    const escaped = escapeHtml(text);

    return escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

/**
 * Highlight search query matches in text
 * @param {string} text - Text to highlight in
 * @param {string} query - Query to highlight
 * @returns {string} HTML with highlighted matches
 */
export function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

    return escaped.replace(regex, '<mark style="background: rgba(251, 191, 36, 0.3); color: #fcd34d; padding: 0 2px; border-radius: 2px;">$1</mark>');
}
