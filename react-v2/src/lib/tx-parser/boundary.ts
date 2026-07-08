import type { TokenizedLine, RawTransaction, Token } from './types';

export function detectBoundaries(lines: TokenizedLine[]): RawTransaction[] {
  const transactions: RawTransaction[] = [];
  let current: RawTransaction | null = null;

  for (const line of lines) {
    const isEmpty = line.raw.trim() === '';
    const isNoise = line.tokens.length === 1 && line.tokens[0].type === 'NOISE';
    if (isEmpty || isNoise) {
      if (current) {
        transactions.push(current);
        current = null;
      }
      continue;
    }

    const firstToken = line.tokens[0];
    const dateAtStart = firstToken?.type === 'DATE' && firstToken.start <= 3;

    if (dateAtStart) {
      if (current) transactions.push(current);
      current = {
        lines: [line],
        dateToken: firstToken,
        moneyTokens: line.tokens.filter(t => t.type === 'MONEY'),
        directionToken: line.tokens.find(t => t.type === 'DIRECTION') ?? null,
        textTokens: line.tokens.filter(t => t.type === 'TEXT'),
      };
    } else if (current) {
      current.lines.push(line);
      current.moneyTokens.push(...line.tokens.filter(t => t.type === 'MONEY'));
      current.textTokens.push(...line.tokens.filter(t => t.type === 'TEXT'));
      if (!current.directionToken) {
        current.directionToken = line.tokens.find(t => t.type === 'DIRECTION') ?? null;
      }
    }
  }

  if (current) transactions.push(current);

  if (transactions.length > 2) {
    const withDir = transactions.filter(t => t.directionToken !== null).length;
    if (withDir / transactions.length > 0.8) {
      return transactions.filter(t => t.directionToken !== null);
    }
  }

  return transactions;
}
