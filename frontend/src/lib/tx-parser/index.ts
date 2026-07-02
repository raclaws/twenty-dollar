import type { Transaction } from './types'
import { tokenize } from './tokenizer'
import { extractRegion } from './region'
import { detectBoundaries } from './boundary'
import { mapColumns } from './mapper'
import { normalize } from './normalizer'

export interface ParseOptions {
  contextYear?: number
}

export function parse(text: string, options?: ParseOptions): Transaction[] {
  const lines = tokenize(text)
  const region = extractRegion(lines)
  if (region.length === 0) return []
  const raw = detectBoundaries(region)
  if (raw.length === 0) return []
  const mapped = mapColumns(raw)
  return normalize(mapped, options?.contextYear)
}

export { tokenize } from './tokenizer'
export { extractRegion, findRegion } from './region'
export { detectBoundaries } from './boundary'
export { mapColumns } from './mapper'
export { normalize, parseDate, parseAmount } from './normalizer'
export type { Transaction, Token, TokenizedLine, RawTransaction } from './types'
export type { MappedTransaction } from './mapper'
