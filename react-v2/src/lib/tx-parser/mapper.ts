import type { RawTransaction, Token } from './types';

export type ColumnRole = 'amount' | 'balance' | 'unknown';

export interface MappedTransaction {
  dateToken: Token;
  description: string;
  amountToken: Token;
  amountNegative: boolean;
  balanceToken: Token | null;
  directionToken: Token | null;
}

interface PositionCluster {
  center: number;
  tokens: { txIdx: number; token: Token }[];
}

function clusterPositions(transactions: RawTransaction[]): PositionCluster[] {
  const allPositions: { txIdx: number; token: Token; pos: number }[] = [];
  for (let i = 0; i < transactions.length; i++) {
    for (const t of transactions[i].moneyTokens) {
      allPositions.push({ txIdx: i, token: t, pos: t.start });
    }
  }
  if (allPositions.length === 0) return [];

  allPositions.sort((a, b) => a.pos - b.pos);

  const clusters: PositionCluster[] = [];
  let current: PositionCluster = { center: allPositions[0].pos, tokens: [allPositions[0]] };

  for (let i = 1; i < allPositions.length; i++) {
    if (Math.abs(allPositions[i].pos - current.center) <= 10) {
      current.tokens.push(allPositions[i]);
      current.center = Math.round(current.tokens.reduce((s, t) => s + t.token.start, 0) / current.tokens.length);
    } else {
      clusters.push(current);
      current = { center: allPositions[i].pos, tokens: [allPositions[i]] };
    }
  }
  clusters.push(current);

  return clusters;
}

function isBalanceColumn(moneyTokens: Token[][]): number | null {
  if (moneyTokens.length < 3) return null;
  if (moneyTokens[0].length < 2) return null;

  for (let col = 0; col < moneyTokens[0].length; col++) {
    let isBalance = true;
    for (let i = 1; i < moneyTokens.length; i++) {
      if (!moneyTokens[i][col] || !moneyTokens[i - 1][col]) {
        isBalance = false;
        break;
      }
      const prev = parseRawMoney(moneyTokens[i - 1][col].raw);
      const curr = parseRawMoney(moneyTokens[i][col].raw);
      if (prev === null || curr === null) { isBalance = false; break; }

      const otherCols = moneyTokens[i].filter((_, idx) => idx !== col);
      const anyDiffMatches = otherCols.some(t => {
        const val = parseRawMoney(t.raw);
        if (val === null) return false;
        return Math.abs(Math.abs(curr - prev) - Math.abs(val)) < 2;
      });
      if (!anyDiffMatches) { isBalance = false; break; }
    }
    if (isBalance) return col;
  }
  return null;
}

function parseRawMoney(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

export function mapColumns(transactions: RawTransaction[]): MappedTransaction[] {
  const moneyPerTx = transactions.map(tx => tx.moneyTokens);
  const balanceCol = isBalanceColumn(moneyPerTx);

  const clusters = clusterPositions(transactions);
  let debitCenter: number | null = null;
  let creditCenter: number | null = null;

  if (clusters.length === 3) {
    const nonBalance = clusters.slice(0, 2);
    if (nonBalance[0].tokens.length >= nonBalance[1].tokens.length) {
      debitCenter = nonBalance[0].center;
      creditCenter = nonBalance[1].center;
    } else {
      debitCenter = nonBalance[1].center;
      creditCenter = nonBalance[0].center;
    }
  }

  return transactions.map((tx) => {
    let amountToken: Token;
    let balanceToken: Token | null = null;
    let amountNegative = false;

    if (tx.moneyTokens.length === 0) {
      amountToken = { type: 'MONEY', raw: '0', start: 0, end: 1 };
    } else if (tx.moneyTokens.length === 1) {
      amountToken = tx.moneyTokens[0];
    } else {
      let prefixedToken: Token | null = null;
      for (const t of tx.moneyTokens) {
        for (const line of tx.lines) {
          if (t.start <= line.raw.length) {
            const prefix = line.raw.slice(0, t.start).trimEnd();
            if (prefix.endsWith('-')) { prefixedToken = t; break; }
          }
        }
        if (prefixedToken) break;
      }

      if (prefixedToken) {
        amountToken = prefixedToken;
        amountNegative = true;
        balanceToken = tx.moneyTokens.find(t => t !== prefixedToken) ?? null;
      } else if (tx.directionToken) {
        const parsed = tx.moneyTokens.map(t => ({ token: t, value: Math.abs(parseRawMoney(t.raw) ?? 0) }));
        parsed.sort((a, b) => a.value - b.value);
        amountToken = parsed[0].token;
        if (parsed.length > 1) balanceToken = parsed[parsed.length - 1].token;
      } else if (debitCenter !== null && creditCenter !== null) {
        const balanceCluster = clusters.length === 3 ? clusters[2].center : null;
        let bestAmount: Token | null = null;

        for (const t of tx.moneyTokens) {
          if (balanceCluster !== null && Math.abs(t.start - balanceCluster) <= 10) {
            balanceToken = t;
          } else if (Math.abs(t.start - debitCenter!) <= 10) {
            bestAmount = t;
            amountNegative = true;
          } else if (Math.abs(t.start - creditCenter!) <= 10) {
            bestAmount = t;
            amountNegative = false;
          }
        }
        amountToken = bestAmount ?? tx.moneyTokens[0];
      } else if (balanceCol !== null) {
        balanceToken = tx.moneyTokens[balanceCol] ?? null;
        amountToken = tx.moneyTokens.find((_, i) => i !== balanceCol) ?? tx.moneyTokens[0];
      } else {
        amountToken = tx.moneyTokens[0];
      }
    }

    if (!amountNegative) {
      for (const line of tx.lines) {
        const lineRaw = line.raw;
        if (amountToken.start <= lineRaw.length) {
          const prefix = lineRaw.slice(0, amountToken.start).trimEnd();
          if (prefix.endsWith('-')) {
            amountNegative = true;
            break;
          }
        }
      }
    }

    const description = tx.textTokens.map(t => t.raw).join(' ').trim();

    return {
      dateToken: tx.dateToken,
      description,
      amountToken,
      amountNegative,
      balanceToken,
      directionToken: tx.directionToken,
    };
  });
}
