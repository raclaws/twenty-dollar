/**
 * Get the user's selected currency code from localStorage.
 */
export function getSelectedCurrency(): string {
  return localStorage.getItem('twenty_currency') || 'USD';
}

/**
 * Format cents (integer) to a currency string using the user's selected currency.
 * Examples: 150000 → "$1,500.00", -2500 → "-$25.00", 0 → "$0.00"
 */
export function formatCurrency(cents: number): string {
  const code = getSelectedCurrency();
  const abs = Math.abs(cents);
  const value = abs / 100;

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: code === 'JPY' ? 0 : 2,
    maximumFractionDigits: code === 'JPY' ? 0 : 2,
  }).format(value);

  return cents < 0 ? `-${formatted}` : formatted;
}

/**
 * Parse a currency string (or plain number) to cents.
 * Handles "$1,500.00", "1500", "-25.50", etc.
 * Returns null if unparseable.
 */
export function parseCurrencyToCents(input: string): number | null {
  const cleaned = input.replace(/[$€£¥,\s]/g, '').replace(/[A-Za-z]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/**
 * Format a YYYY-MM month string to a display label.
 * Example: "2025-03" → "March 2025"
 */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
