# Waterfall Pipeline Session Report — Twenty-Dollar React v2

## Session Overview

| Metric | Value |
|--------|-------|
| Total wall time | ~3 hours |
| Agent invocations | 18 (spec) + 12 (dev) + 8 (fix) = 38 |
| Final output | 102 files, 15,103 lines |
| Integration bugs found | 7 (all fixed) |
| Skill patches applied | 3 (waterfall-spec, waterfall-dev, invariant-projection) |

---

## Pipeline Stages Executed

### Stage 1: Waterfall-Spec (spec generation)
- Agent 1 (PRD): 43 min — produced 816-line PRD with 8 entities, 11 features
- Agent 2 (Feature Spec): 6 min — 3 files (flows, data, design direction)
- Agent 3 (Backend Spec): 23 min — formalized 30+ endpoints from existing Rust backend
- Agent Smith (Verification): 3 min — PASS WITH CAVEATS (0 blocking, 12 minor)
- Invariant Projection v5: 8 min — 77 ops, 3,308 reachable cells, 1,984 INTERFERES

### Stage 2: Waterfall-Dev (implementation)
- Phase 1 (Scaffold + Data Layer): 9 min, 24 files, 1,847 LOC
- Phase 2 (Budget Engine): 5 min, 5 files, 538 LOC
- Phase 3 (Auth + Routing): 6 min, 18 files, 734 LOC
- Phase 4 (Budget View): 6 min, 12 files, 628 LOC
- Phase 5 (Transactions View): 8 min, 10 files, 773 LOC
- Phase 6+7 (Accounts + Schedules/Import/Settings): 8 min, 20 files, ~1,300 LOC

### Stage 3: QA + Fix Cycles (integration)
- 8 fix dispatches addressing integration bugs
- Total fix time: ~45 min
- All fixes verified (tsc + build pass)

---

## Bugs Discovered (Agnostic Classification)

### Class 1: Interface Mismatch (Glue Bugs)

**Pattern:** Two layers are individually correct but the handshake between them is broken.

| Bug | Agnostic Principle |
|-----|-------------------|
| SyncStore uses plain Map, MobX can't track it | When two reactivity systems coexist, the bridge between them must be explicitly reactive. A framework-agnostic data layer is invisible to the UI framework's change detection unless a reactive wrapper mediates. |
| `useMemo` with observable dependencies produces stale reads | When a framework provides built-in memoization (dep arrays) AND an external state library provides its own tracking (MobX/signals), using both on the same read path creates a conflict. Only one system should own recomputation. |
| POST body omits client-generated ID → duplicates on sync | In optimistic-first architectures, the client is the ID authority. If the server also generates IDs, create payloads MUST include the client ID. Otherwise: two records exist for one intent. |
| Frontend calls `/api/assignments`, backend has `/api/budget/assign` | When spec-generated paths differ from implementation paths, a contract verification step must compare actual routes to enqueued mutations. Aspirational specs are not executable contracts. |

**Root cause:** No stage in the pipeline owns the integration boundary. Each agent produces correct output for its scope, but the composition of scopes creates gaps.

### Class 2: Surface Area Gaps (Missing Entry Points)

**Pattern:** Function exists in code but user has no way to reach it.

| Bug | Agnostic Principle |
|-----|-------------------|
| No "Add Category" button anywhere | Every CRUD operation needs a specified CREATE entry point — which screen, which button, which position. |
| No account onboarding (zero-state) | Every list view needs an explicit empty state with a CTA to populate it. |
| No input validation display | Every form needs per-field error display behavior specified — not just "returns 422." |
| AddTransactionRow exists but not rendered | Every created component must be imported and rendered somewhere reachable. Dead code = invisible feature. |

**Root cause:** Feature Spec describes happy-path flows but not the 9 surface-area concerns (entry, empty, loading, error, success, exit, destructive, overflow, stale).

### Class 3: Type/Shape Mismatch

**Pattern:** Frontend sends a value the backend can't deserialize.

| Bug | Agnostic Principle |
|-----|-------------------|
| `cleared: 0/1` sent, backend expects `bool` | When client and server use different type systems, the mutation layer must perform type coercion at the boundary. Schema types are not wire types. |
| Empty string `""` sent for optional fields, backend expects `null` | Optional fields must serialize as null (absent), not as empty/zero-value of their type. The absence of a value ≠ the zero value. |

**Root cause:** No schema validation at the mutation queue boundary. The queue accepts any object and sends it verbatim.

### Class 4: Architectural Assumption Gaps

**Pattern:** Spec assumes a behavior that implementation doesn't enforce.

| Bug | Agnostic Principle |
|-----|-------------------|
| No server hydration after login | Offline-first apps need an explicit "first sync" step. Local-first ≠ local-only. The initial population of the local store from the server must be a defined operation. |
| No loading screen during hydration | Between "authenticated" and "data ready" there is a gap. The UI must declare what it shows during this gap. |
| Vite HMR WebSocket spam over funnel | Dev-time assumptions (localhost, direct connection) break when the app is served through a proxy/tunnel. Dev config must be environment-aware. |

---

## Lessons for Pipeline Improvement

### 1. Surface Area Mandate (patched into waterfall-spec)
Agent 2 must enumerate 9 concerns per feature: entry, empty, loading, error, success, exit, destructive, overflow, stale.

### 2. Mutation Contract (patched into waterfall-spec)
For offline-first SPAs: "All store actions update local observable SYNCHRONOUSLY, then queue. Components never await network."

### 3. Endpoint Verification (patched into waterfall-dev)
Before calling any endpoint: grep the actual backend source to confirm the exact path exists.

### 4. Render Check (patched into waterfall-dev)
Every component created must be imported and rendered somewhere reachable — compile success ≠ user-reachable.

### 5. Fetch-Free Stores (patched into waterfall-dev)
If SyncStore/mutation queue exists: store actions must NOT call fetch() directly.

### 6. Integration Boundary Tool (future)
A third tool shape beyond invariant-projection (state space) and Agent Smith (consistency): an interface contract verifier that traces data-flow across layer boundaries and checks liveness.

---

## What the Pipeline CAN vs CANNOT Deliver

### CAN deliver (proven):
- Correct architecture (offline-first, reactive stores, mutation queue)
- Pure computation modules (budget engine — deterministic, testable)
- Route structure + auth flow
- API integration with real backend
- Spec documentation as decision record
- Bug prediction (invariant-projection found the same bug classes that manifested)

### CANNOT deliver (needs human hands):
- Custom interaction models (spreadsheet-like table UX)
- Micro-interaction feel (focus management, transition timing, scroll behavior)
- Visual polish (the 200 tiny spacing/color/animation decisions)
- Compound interaction edge cases (drag while editing, undo during inline form)
- Domain-specific UX patterns that emerge from daily use

### The boundary:
The pipeline delivers "working ugly app" in ~2 hours. Converting that to "feels-good product" is a different phase that requires the builder's taste, not an agent's throughput.
