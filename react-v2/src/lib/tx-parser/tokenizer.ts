import type { Token, TokenType, TokenizedLine } from './types';

const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}[-/.]\d{2}[-/.]\d{2}\b/,
  /\b\d{2}[-/.]\d{2}[-/.]\d{4}\b/,
  /\b\d{2}[-/]\d{2}[-/]\d{2}\b/,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/i,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/i,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/i,
  /\b\d{2}\/\d{2}\b/,
];

const MONEY_PATTERNS: RegExp[] = [
  /(?:Rp\.?|IDR|USD|\$|€|£|¥)\s*[\d,.]+/,
  /[\d,.]+\s*(?:Rp\.?|IDR|USD|\$|€|£|¥)/,
  /[+-]\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/,
  /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/,
  /\b\d{1,3}(?:[.,]\d{3}){2,}\b/,
];

const DIRECTION_PATTERNS: RegExp[] = [
  /\b(?:DB|CR|Dr|Cr)\b/i,
  /\b(?:debit|credit)\b/i,
  /\b(?:withdrawal|deposit)\b/i,
  /\b(?:DEBET|KREDIT)\b/i,
];

const NOISE_PATTERNS: RegExp[] = [
  /^[-=_]{3,}$/,
  /^\s*page\s+\d+/i,
  /^\s*halaman\s+\d+\s+dari\s+\d+/i,
  /^\s*(?:continued|lanjutan|bersambung)/i,
  /^\s*(?:statement|rekening|mutasi)\s+(?:period|periode)/i,
  /berizin dan diawasi|licensed.*supervised|member of.*(?:penjaminan|insurance)/i,
  /^\s*\S+\.(id|com|co\.id)\s+.*\d{4,}/i,
];

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (NOISE_PATTERNS.some(p => p.test(trimmed))) return true;
  return false;
}

function findAllMatches(line: string, patterns: RegExp[], type: TokenType): Token[] {
  const tokens: Token[] = [];
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = global.exec(line)) !== null) {
      const overlap = tokens.some(t =>
        (match!.index >= t.start && match!.index < t.end) ||
        (match!.index + match![0].length > t.start && match!.index + match![0].length <= t.end)
      );
      if (!overlap) {
        tokens.push({
          type,
          raw: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }
  return tokens;
}

function extractTextTokens(line: string, claimed: Token[]): Token[] {
  const sorted = [...claimed].sort((a, b) => a.start - b.start);
  const texts: Token[] = [];
  let cursor = 0;

  for (const token of sorted) {
    if (token.start > cursor) {
      const raw = line.slice(cursor, token.start).trim();
      if (raw.length > 1) {
        texts.push({ type: 'TEXT', raw, start: cursor, end: token.start });
      }
    }
    cursor = token.end;
  }

  if (cursor < line.length) {
    const raw = line.slice(cursor).trim();
    if (raw.length > 1) {
      texts.push({ type: 'TEXT', raw, start: cursor, end: line.length });
    }
  }

  return texts;
}

export function tokenizeLine(line: string, lineIndex: number): TokenizedLine {
  if (isNoiseLine(line)) {
    return { lineIndex, raw: line, tokens: [{ type: 'NOISE', raw: line, start: 0, end: line.length }] };
  }

  const dateTokens = findAllMatches(line, DATE_PATTERNS, 'DATE');
  const moneyTokens = findAllMatches(line, MONEY_PATTERNS, 'MONEY');
  const dirTokens = findAllMatches(line, DIRECTION_PATTERNS, 'DIRECTION');

  const claimed = [...dateTokens, ...moneyTokens, ...dirTokens];
  const textTokens = extractTextTokens(line, claimed);

  const allTokens = [...claimed, ...textTokens].sort((a, b) => a.start - b.start);

  return { lineIndex, raw: line, tokens: allTokens };
}

export function tokenize(text: string): TokenizedLine[] {
  return text.split('\n').map((line, i) => tokenizeLine(line, i));
}
