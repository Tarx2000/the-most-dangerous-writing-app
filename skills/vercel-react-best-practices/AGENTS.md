# React Best Practices — React Native Subset

**Version 1.1.0 — RN Edition**  
> Condensed from the Vercel Engineering React/Next.js guide. This edition removes all web-specific rules (SSR, RSC, Next.js API routes, HTML script tags, hydration) and keeps only universal React + React Native relevant patterns.

---

## 1. Async Parallelism — CRITICAL

### 1.5 Promise.all() for Independent Operations
```typescript
// Wrong: sequential, N round trips
const a = await fetchA(); const b = await fetchB()

// Right: parallel, 1 round trip
const [a, b] = await Promise.all([fetchA(), fetchB()])
```

---

## 5. Re-render Optimization — MEDIUM

| # | Rule | Do | Don't |
|---|---|---|---|
| 5.1 | Derive state during render | `const full = first + last` | `useEffect(() => setFull(...), [first, last])` |
| 5.2 | Defer reads to usage point | Read inside event handler | Subscribe via hook if only used in callbacks |
| 5.3 | Simple expressions | `const ok = a \|\| b` | `useMemo(() => a \|\| b, [a, b])` |
| 5.4 | No inline components | Extract to top-level | Define component inside parent |
| 5.5 | Default non-primitive props | `const NOOP = () => {}; memo(() => ...)` | `memo(() => { onClick = () => {} })` |
| 5.6 | Extract expensive work | Memoized subcomponent | Heavy computation inside parent render |
| 5.7 | Narrow effect deps | `[user.id]` | `[user]` |
| 5.8 | Interaction logic | Put in event handler | Model as state + effect |
| 5.9 | Split combined hooks | Separate `useMemo` hooks | One hook with unrelated deps |
| 5.10 | Subscribe to derived state | `useMediaQuery('(max-width: 767px)')` | Read continuous value (width) directly |
| 5.11 | Functional setState | `setItems(curr => [...curr, x])` | `setItems([...items, x])` |
| 5.12 | Lazy state init | `useState(() => buildIndex())` | `useState(buildIndex())` |
| 5.13 | Transitions | `startTransition(() => setQuery(q))` | Direct state set on every keystroke |
| 5.14 | useDeferredValue | `const d = useDeferredValue(q)` | Laggy input with heavy filter |
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
| 6.1 | SVG animation | Animate wrapper `<View>` | Animate `<svg>` element directly |
| 6.3 | Static JSX | Hoist to module scope | Recreate inside component |
| 6.4 | SVG precision | 1 decimal place | 6+ decimal places |
| 6.7 | Activity | `<Activity mode={visible ? 'visible' : 'hidden'}>` | Mount/unmount for tab switching |
| 6.9 | Conditional render | `{count > 0 ? <Badge/> : null}` | `{count && <Badge/>}` |
| 6.11 | Loading states | `useTransition` / `startTransition` | Manual `isLoading` booleans |

---

## 7. JavaScript Performance — LOW-MEDIUM

| # | Rule | Do | Don't |
|---|---|---|---|
| 7.2 | Index maps | `new Map(users.map(u => [u.id, u]))` | `users.find()` in a loop |
| 7.3 | Cache property access | `const v = obj.nested.deep` in loop header | `obj.nested.deep` inside loop body |
| 7.4 | Cache function calls | Module-level `Map` memo | Recompute on every render |
| 7.6 | Combine iterations | One `for...of` with multiple pushes | Chained `.filter().map()` |
| 7.8 | Early length check | `if (a.length !== b.length) return false` | Run expensive sort/compare first |
| 7.9 | Early return | `return { valid: false }` on first error | Continue checking after result known |
| 7.10 | Hoist RegExp | `const RE = /.../` module scope | `new RegExp(...)` inside render |
| 7.11 | flatMap | `arr.flatMap(x => cond ? [x] : [])` | `.map().filter(Boolean)` |
| 7.12 | Min/max loop | Single pass with `if` | Sort then take `[0]` |
| 7.13 | Set/Map lookups | `new Set(ids).has(id)` | `ids.includes(id)` for large arrays |
| 7.14 | Immutable sort | `arr.toSorted()` | `arr.sort()` on props/state |

---

## 8. Advanced Patterns — LOW

| # | Rule | Do | Don't |
|---|---|---|---|
| 8.1 | EffectEvent deps | Call inside effect body | Add to dependency array |
| 8.2 | App init | Module-level `let didInit = false` | Inside `useEffect([], ...)` |
| 8.3 | Handler refs | Store callback in ref for stable subscription | Include callback in effect deps |
| 8.4 | useEffectEvent | Wrap handler in `useEffectEvent` | Add changing callback to deps |

---

## Quick Reference Checklist

Before finishing component work:
- [ ] No components defined inside other components
- [ ] Functional setState for updates based on previous state
- [ ] Lazy initialization for expensive initial values
- [ ] `Promise.all()` for concurrent independent fetches
- [ ] `useRef` for values that change frequently but don't affect UI
- [ ] Narrowest possible effect dependencies
- [ ] `React.memo` for expensive subcomponents
- [ ] No `useMemo` around trivial primitive expressions
