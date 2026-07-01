export interface GroupConfig<T> {
  key: (item: T) => string
  label: (key: string) => string
  sort?: (a: string, b: string) => number
}

export interface Group<T> {
  key: string
  label: string
  items: T[]
}

export function groupItems<T>(items: T[], config: GroupConfig<T>): Group<T>[] {
  const map = new Map<string, T[]>()
  const order: string[] = []

  for (const item of items) {
    const k = config.key(item)
    if (!map.has(k)) {
      map.set(k, [])
      order.push(k)
    }
    map.get(k)!.push(item)
  }

  const groups: Group<T>[] = order.map(k => ({
    key: k,
    label: config.label(k),
    items: map.get(k)!,
  }))

  if (config.sort) {
    groups.sort((a, b) => config.sort!(a.key, b.key))
  }

  return groups
}
