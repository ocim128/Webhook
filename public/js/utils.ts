/**
 * Pure utility functions - no DOM, no state dependencies
 * @module utils
 */

/**
 * Format a timestamp to locale string
 */
export function formatTimestamp(value: string | Date | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

/**
 * Format a timestamp to relative time (e.g., "5m ago")
 */
export function formatRelativeTime(value: string | Date | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
 */
export function formatBytes(size: number | null | undefined): string {
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
 */
export function escapeHtml(value: unknown): string {
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
 */
export function encodeSrcDoc(html: string | null | undefined): string {
    if (!html) return '';
    return escapeHtml(html);
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(value: string | null | undefined, maxLength = 120): string {
    if (!value) return '';
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}

/**
 * Collapse multiple whitespace characters into single spaces
 */
export function compactWhitespace(value: string | null | undefined): string {
    if (!value) {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize and sanitize a slug value
 */
export function normaliseSlug(value: unknown): string {
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
 */
export function getInitials(name: string | null | undefined): string {
    if (!name || name === 'Unknown') return '?';
    const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/**
 * Get a consistent avatar color based on name hash
 */
export function getAvatarColor(name: string | null | undefined): string {
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
 */
export function extractVerificationCode(text: string | null | undefined): string | null {
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
 */
export function linkifyText(text: string | null | undefined): string {
    if (!text) return '';

    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    const escaped = escapeHtml(text);

    return escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

/**
 * Highlight search query matches in text
 */
export function highlightMatch(text: string | null | undefined, query: string | null | undefined): string {
    if (!query || !text) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

    return escaped.replace(regex, '<mark style="background: rgba(251, 191, 36, 0.3); color: #fcd34d; padding: 0 2px; border-radius: 2px;">$1</mark>');
}
