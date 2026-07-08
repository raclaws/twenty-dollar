export interface FieldDef {
  type: 'string' | 'number' | 'boolean'
}

export interface TableSchema {
  fields: { [key: string]: 'string' | 'number' | 'boolean' }
  indexes?: string[]
}

export interface StoreConfig {
  name: string
  tables: { [tableName: string]: TableSchema }
}

export interface QueryOptions {
  where?: { [field: string]: string | number | boolean | string[] }
  sort?: { field: string; dir: 'asc' | 'desc' }
  limit?: number
  offset?: number
}

export type Record = { id: string; [key: string]: unknown }

export interface SyncStore {
  put(table: string, record: Record): Promise<void>
  putMany(table: string, records: Record[]): Promise<void>
  get(table: string, id: string): Record | undefined
  getAll(table: string): Record[]
  query(table: string, options?: QueryOptions): Record[]
  count(table: string, options?: QueryOptions): number
  delete(table: string, id: string): Promise<void>
  clear(table: string): Promise<void>
  close(): void
}
