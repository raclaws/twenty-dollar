export interface ClusterToken {
  type: 'WORD' | 'NUMBER' | 'DATE' | 'REF';
  value: string;
}

export interface DescriptionCluster {
  key: string;
  tokens: string[];
  indices: number[];
  amountMin: number;
  amountMax: number;
  sampleDescription: string;
}

const DATE_PATTERN = /^\d{2}[\/\-\.]\d{2}([\/\-\.]\d{2,4})?$/;
const NUMBER_PATTERN = /^\d+$/;
const REF_PATTERN = /^[A-Z0-9]{6,}$/;
const SLASH_REF_PATTERN = /^[A-Z0-9]+\/[A-Z0-9\/]+$/;

function classifyToken(raw: string): ClusterToken {
  if (DATE_PATTERN.test(raw)) return { type: 'DATE', value: raw };
  if (NUMBER_PATTERN.test(raw)) return { type: 'NUMBER', value: raw };
  if (SLASH_REF_PATTERN.test(raw)) return { type: 'REF', value: raw };
  if (REF_PATTERN.test(raw) && raw.length > 8) return { type: 'REF', value: raw };
  return { type: 'WORD', value: raw.toUpperCase() };
}

export function extractSignature(description: string): string[] {
  const parts = description.split(/[\s\/]+/).filter(Boolean);
  const words: string[] = [];
  for (const part of parts) {
    const token = classifyToken(part);
    if (token.type === 'WORD') {
      words.push(token.value);
    }
  }
  return words;
}

export function signatureKey(tokens: string[]): string {
  return tokens.join(' ');
}

export function clusterDescriptions(
  descriptions: string[],
  amounts: number[]
): DescriptionCluster[] {
  const clusters = new Map<string, DescriptionCluster>();

  for (let i = 0; i < descriptions.length; i++) {
    const tokens = extractSignature(descriptions[i]);
    const key = signatureKey(tokens);

    if (!key) continue;

    const existing = clusters.get(key);
    if (existing) {
      existing.indices.push(i);
      existing.amountMin = Math.min(existing.amountMin, amounts[i]);
      existing.amountMax = Math.max(existing.amountMax, amounts[i]);
    } else {
      clusters.set(key, {
        key,
        tokens,
        indices: [i],
        amountMin: amounts[i],
        amountMax: amounts[i],
        sampleDescription: descriptions[i],
      });
    }
  }

  return Array.from(clusters.values()).sort((a, b) => b.indices.length - a.indices.length);
}

export function matchAgainstRules(
  description: string,
  rules: { tokens: string[]; payeeId: string | null; categoryId: string | null }[]
): { payeeId: string | null; categoryId: string | null } | null {
  const descTokens = extractSignature(description);
  if (descTokens.length === 0) return null;

  let bestMatch: (typeof rules)[0] | null = null;
  let bestScore = 0;

  for (const rule of rules) {
    if (rule.tokens.length === 0) continue;
    const matched = rule.tokens.filter(t => descTokens.includes(t)).length;
    const score = matched / rule.tokens.length;
    if (score > bestScore && score >= 0.8) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  if (!bestMatch) return null;
  return { payeeId: bestMatch.payeeId, categoryId: bestMatch.categoryId };
}
