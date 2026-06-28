/** Tiny subsequence fuzzy matcher — good enough for a session jump palette. */
export interface FuzzyResult<T> {
  item: T
  score: number
  /** indices in the haystack that matched, for highlighting */
  matches: number[]
}

export function fuzzyScore(query: string, target: string): { score: number; matches: number[] } | null {
  if (query.length === 0) return { score: 0, matches: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let lastIdx = -1
  const matches: number[] = []
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matches.push(ti)
      // reward consecutive matches and matches at word starts
      if (lastIdx === ti - 1) score += 5
      if (ti === 0 || t[ti - 1] === '-' || t[ti - 1] === '_' || t[ti - 1] === '.') score += 3
      score += 1
      lastIdx = ti
      qi++
    }
  }
  if (qi < q.length) return null
  // shorter targets rank slightly higher
  score -= target.length * 0.01
  return { score, matches }
}

export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string): FuzzyResult<T>[] {
  if (query.trim().length === 0) {
    return items.map((item) => ({ item, score: 0, matches: [] }))
  }
  const out: FuzzyResult<T>[] = []
  for (const item of items) {
    const r = fuzzyScore(query, key(item))
    if (r) out.push({ item, score: r.score, matches: r.matches })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
