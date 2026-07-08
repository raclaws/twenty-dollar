import type { Token, Transaction } from './types';
import type { MappedTransaction } from './mapper';

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04',
  june: '06', july: '07', august: '08', september: '09',
  october: '10', november: '11', december: '12',
};

export function parseDate(raw: string, contextYear?: number): string {
  const year = contextYear ?? new Date().getFullYear();
  const s = raw.trim();

  let m = s.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if (a > 12) return `${m[3]}-${m[2]}-${m[1]}`;
    if (b > 12) return `${m[3]}-${m[1]}-${m[2]}`;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
  if (m) {
    const yy = parseInt(m[3]);
    const fullYear = yy > 50 ? 1900 + yy : 2000 + yy;
    return `${fullYear}-${m[2]}-${m[1]}`;
  }

  m = s.match(/^(\d{2})\/(\d{2})$/);
  if (m) return `${year}-${m[2]}-${m[1]}`;

  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTH_MAP[m[2].toLowerCase()];
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (mon) return `${yr}-${mon}-${day}`;
  }

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/i);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    const day = m[2].padStart(2, '0');
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (mon) return `${yr}-${mon}-${day}`;
  }

  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon) return `${year}-${mon}-${day}`;
  }

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})$/i);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    const day = m[2].padStart(2, '0');
    if (mon) return `${year}-${mon}-${day}`;
  }

  return `${year}-01-01`;
}

export function parseAmount(raw: string, direction: Token | null, amountNegative?: boolean): number {
  let s = raw.replace(/[^\d.,-]/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const afterDot = s.slice(lastDot + 1);
    if (afterDot.length === 3 && s.indexOf('.') !== lastDot) {
      s = s.replace(/\./g, '');
    } else {
      s = s.replace(/,/g, '');
    }
  } else {
    s = s.replace(/,/g, '');
  }

  s = s.replace(/-/g, '');

  let value = parseFloat(s);
  if (isNaN(value)) return 0;

  const cents = Math.round(value * 100);

  if (direction) {
    const d = direction.raw.toLowerCase();
    if (d === 'db' || d === 'dr' || d === 'debit' || d === 'debet' || d === 'withdrawal') {
      return -Math.abs(cents);
    }
    if (d === 'cr' || d === 'credit' || d === 'kredit' || d === 'deposit') {
      return Math.abs(cents);
    }
  }

  if (amountNegative) return -Math.abs(cents);
  if (raw.includes('-')) return -Math.abs(cents);
  return cents;
}

export function cleanDescription(texts: string): string {
  return texts
    .replace(/\s+/g, ' ')
    .replace(/^[\d/:-]+\s*/, '')
    .trim();
}

export function normalize(mapped: MappedTransaction[], contextYear?: number): Transaction[] {
  return mapped.map(tx => {
    const date = parseDate(tx.dateToken.raw, contextYear);
    const amount = parseAmount(tx.amountToken.raw, tx.directionToken, tx.amountNegative);
    const description = cleanDescription(tx.description);
    const hasDate = date !== `${contextYear ?? new Date().getFullYear()}-01-01`;
    const hasAmount = amount !== 0;
    const hasDesc = description.length > 0;
    const confidence = (hasDate ? 0.4 : 0) + (hasAmount ? 0.4 : 0) + (hasDesc ? 0.2 : 0);

    return { date, description, amount, confidence };
  });
}
