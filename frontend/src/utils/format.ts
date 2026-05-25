/**
 * SmartPOS AI – Formatting Utilities
 */

/**
 * Format a number as Indian Rupees (e.g. ₹1,23,456.78)
 */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = toNumber(value);
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a percentage (e.g. 34.5%)
 */
export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format an ISO datetime string to a human-readable local date/time.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format ISO to date only.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

/**
 * Relative time (e.g. "2 hours ago")
 */
export function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);

  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, max = 30): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/**
 * Pad a number with leading zeros.
 */
export function zeroPad(n: number, length = 4): string {
  return String(n).padStart(length, '0');
}
