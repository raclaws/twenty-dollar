export type TokenType = 'DATE' | 'MONEY' | 'DIRECTION' | 'TEXT' | 'NOISE'

export interface Token {
  type: TokenType
  raw: string
  start: number
  end: number
}

export interface TokenizedLine {
  lineIndex: number
  raw: string
  tokens: Token[]
}

export interface RawTransaction {
  lines: TokenizedLine[]
  dateToken: Token
  moneyTokens: Token[]
  directionToken: Token | null
  textTokens: Token[]
}

export interface Transaction {
  date: string
  description: string
  amount: number
  confidence: number
}
