const CURRENCY_KEY = 'twenty-dollar:currency'

export interface CurrencyEntry {
  code: string
  symbol: string
  country: string
}

export const CURRENCIES: CurrencyEntry[] = [
  { code: 'USD', symbol: '$', country: 'United States' },
  { code: 'EUR', symbol: '€', country: 'European Union' },
  { code: 'GBP', symbol: '£', country: 'United Kingdom' },
  { code: 'JPY', symbol: '¥', country: 'Japan' },
  { code: 'CNY', symbol: '¥', country: 'China' },
  { code: 'INR', symbol: '₹', country: 'India' },
  { code: 'IDR', symbol: 'Rp', country: 'Indonesia' },
  { code: 'KRW', symbol: '₩', country: 'South Korea' },
  { code: 'RUB', symbol: '₽', country: 'Russia' },
  { code: 'BRL', symbol: 'R$', country: 'Brazil' },
  { code: 'AUD', symbol: 'A$', country: 'Australia' },
  { code: 'CAD', symbol: 'C$', country: 'Canada' },
  { code: 'CHF', symbol: 'CHF', country: 'Switzerland' },
  { code: 'SEK', symbol: 'kr', country: 'Sweden' },
  { code: 'NOK', symbol: 'kr', country: 'Norway' },
  { code: 'DKK', symbol: 'kr', country: 'Denmark' },
  { code: 'PLN', symbol: 'zł', country: 'Poland' },
  { code: 'TRY', symbol: '₺', country: 'Turkey' },
  { code: 'MXN', symbol: 'MX$', country: 'Mexico' },
  { code: 'SGD', symbol: 'S$', country: 'Singapore' },
  { code: 'HKD', symbol: 'HK$', country: 'Hong Kong' },
  { code: 'NZD', symbol: 'NZ$', country: 'New Zealand' },
  { code: 'ZAR', symbol: 'R', country: 'South Africa' },
  { code: 'THB', symbol: '฿', country: 'Thailand' },
  { code: 'MYR', symbol: 'RM', country: 'Malaysia' },
  { code: 'PHP', symbol: '₱', country: 'Philippines' },
  { code: 'VND', symbol: '₫', country: 'Vietnam' },
  { code: 'AED', symbol: 'د.إ', country: 'UAE' },
  { code: 'SAR', symbol: '﷼', country: 'Saudi Arabia' },
  { code: 'EGP', symbol: 'E£', country: 'Egypt' },
  { code: 'NGN', symbol: '₦', country: 'Nigeria' },
  { code: 'CLP', symbol: 'CL$', country: 'Chile' },
  { code: 'COP', symbol: 'CO$', country: 'Colombia' },
  { code: 'ARS', symbol: 'AR$', country: 'Argentina' },
  { code: 'PEN', symbol: 'S/', country: 'Peru' },
]

export function getCurrencySymbol(): string {
  const code = localStorage.getItem(CURRENCY_KEY) ?? 'USD'
  const entry = CURRENCIES.find(c => c.code === code)
  return entry?.symbol ?? '$'
}

export function getCurrencyCode(): string {
  return localStorage.getItem(CURRENCY_KEY) ?? 'USD'
}

export function setCurrencyCode(code: string): void {
  localStorage.setItem(CURRENCY_KEY, code)
  fetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency: code }),
  }).catch(() => {})
}

export async function initCurrency(): Promise<void> {
  try {
    const res = await fetch('/api/preferences')
    if (res.ok) {
      const data = await res.json()
      if (data.currency) localStorage.setItem(CURRENCY_KEY, data.currency)
    }
  } catch {}
}

export function formatMoney(cents: number): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : ''
  return `${sign}${getCurrencySymbol()}${whole.toLocaleString()}.${String(frac).padStart(2, '0')}`
}

export function formatMoneyUnsigned(cents: number): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  return `${getCurrencySymbol()}${whole.toLocaleString()}.${String(frac).padStart(2, '0')}`
}

export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[,$\s+]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return Math.round(num * 100)
}

export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const lastDay = new Date(year, m, 0).getDate()
  return `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

export function prevMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (m === 1) return `${year - 1}-12`
  return `${year}-${String(m - 1).padStart(2, '0')}`
}

export function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (m === 12) return `${year + 1}-01`
  return `${year}-${String(m + 1).padStart(2, '0')}`
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
