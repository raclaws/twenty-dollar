import type { TokenizedLine } from './types';

export interface Region {
  start: number;
  end: number;
  score: number;
}

function scoreLine(line: TokenizedLine): number {
  const hasDate = line.tokens.some(t => t.type === 'DATE');
  const hasMoney = line.tokens.some(t => t.type === 'MONEY');
  const isNoise = line.tokens.length === 1 && line.tokens[0].type === 'NOISE';
  const isEmpty = line.raw.trim() === '';

  if (isEmpty) return 0;
  if (isNoise) return -1;
  if (hasDate && hasMoney) return 3;
  if (hasDate) return 2;
  if (hasMoney && !hasDate) return 1;
  const hasText = line.tokens.some(t => t.type === 'TEXT');
  if (hasText) return 0.5;
  return 0;
}

export function findRegion(lines: TokenizedLine[]): Region {
  const scores = lines.map(scoreLine);

  let first = -1;
  let last = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= 2) {
      if (first === -1) first = i;
      last = i;
    }
  }

  if (first === -1) return { start: 0, end: 0, score: 0 };

  for (let i = last + 1; i < lines.length; i++) {
    const s = scores[i];
    if (s < 0 || (s === 0 && lines[i].raw.trim() === '')) break;
    if (s >= 0.5) last = i;
  }

  let score = 0;
  for (let i = first; i <= last; i++) {
    if (scores[i] > 0) score += scores[i];
  }

  return { start: first, end: last, score };
}

export function extractRegion(lines: TokenizedLine[]): TokenizedLine[] {
  const region = findRegion(lines);
  if (region.score === 0) return [];
  return lines.slice(region.start, region.end + 1);
}
