# React Best Practices — React Native Subset

**Version 1.1.0 — RN Edition**  
> Condensed from the Vercel Engineering React/Next.js guide. This edition keeps only the rules relevant for this React Native app. Web-only rules (SSR, RSC, Next.js API routes, HTML script tags, hydration, bundle optimization) are removed. Detailed examples live in `rules/` (one file per rule, named like `5.1 → rerender-derived-state-no-effect.md`).

---

## 1. Async Parallelism — CRITICAL

### 1.5 Promise.all() for Independent Operations
```typescript
// Wrong: sequential, N round trips
const a = await fetchA(); const b = await fetchB()

// Right: parallel, 1 round trip
const [a, b] = await Promise.all([fetchA(), fetchB()])
```
Detailed: `rules/async-parallel.md`

---

## 5. Re-render Optimization — MEDIUM

| # | Rule | Do | Don't |
|---|---|---|---|
| 5.1 | Derive state during render | `const full = first + last` | `useEffect(() => setFull(...), [first, last])` |
| 5.3 | Simple expressions | `const ok = a \|\| b` | `useMemo(() => a \|\| b, [a, b])` |
| 5.4 | No inline components | Extract to top-level | Define component inside parent |
| 5.6 | Extract expensive work | Memoized subcomponent | Heavy computation inside parent render |
| 5.7 | Narrow effect deps | `[user.id]` | `[user]` |
| 5.8 | Interaction logic | Put in event handler | Model as state + effect |
| 5.11 | Functional setState | `setItems(curr => [...curr, x])` | `setItems([...items, x])` |
| 5.12 | Lazy state init | `useState(() => buildIndex())` | `useState(buildIndex())` |
| 5.15 | Transient values | `useRef` for frequent updates | `useState` for values that don't need render |

### 5.4 Don't Define Components Inside Components
```tsx
// Wrong — remounts every render
function Parent() {
  const Child = () => <Text>Hello</Text>
  return <Child />
}

// Right
function Child() { return <Text>Hello</Text> }
function Parent() { return <Child /> }
```

### 5.11 Use Functional setState Updates
```tsx
// Wrong — stale closure risk
const remove = useCallback((id) => {
  setItems(items.filter(i => i.id !== id))
}, [items])

// Right — stable callback, latest state
const remove = useCallback((id) => {
  setItems(curr => curr.filter(i => i.id !== id))
}, [])
```

### 5.12 Use Lazy State Initialization
```tsx
// Wrong — runs on every render
const [index] = useState(buildSearchIndex(items))

// Right — runs once
const [index] = useState(() => buildSearchIndex(items))
```

---

## 6. Rendering Performance — MEDIUM

| # | Rule | Do | Don't |
|---|---|---|---|
| 6.9 | Conditional render | `{count > 0 ? <Badge/> : null}` | `{count && <Badge/>}` |

---

## 7. JavaScript Performance — LOW-MEDIUM

| # | Rule | Do | Don't |
|---|---|---|---|
| 7.2 | Index maps | `new Map(users.map(u => [u.id, u]))` | `users.find()` in a loop |
| 7.3 | Cache property access | `const v = obj.nested.deep` in loop header | `obj.nested.deep` inside loop body |
| 7.9 | Early return | `return { valid: false }` on first error | Continue checking after result known |
| 7.13 | Set/Map lookups | `new Set(ids).has(id)` | `ids.includes(id)` for large arrays |

---

## Quick Reference Checklist

Before finishing component work:
- [ ] No components defined inside other components
- [ ] Functional setState for updates based on previous state
- [ ] Lazy initialization for expensive initial values
- [ ] `Promise.all()` for concurrent independent fetches
- [ ] `useRef` for values that change frequently but don't affect UI
- [ ] Narrowest possible effect dependencies
- [ ] No `useMemo` around trivial primitive expressions
