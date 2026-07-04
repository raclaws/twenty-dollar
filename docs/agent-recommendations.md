# Agent Recommendations

Reviewed: 2026-07-04
Reviewer: Hermes Agent (automated stack review)

## Flags

### 1. clipPath ID Collision in DesignSample (Medium)

`frontend/src/views/DesignSample.tsx` uses `clip-sunset-${Math.round(props.level * 1000)}-${s}` as SVG clipPath IDs. If two rows have the same availability level and size (likely — e.g. two fully-spent categories both at level 0), they share an ID. SVG spec says IDs must be unique per document; browsers may render unpredictably.

**Fix:** Use a unique counter or `crypto.randomUUID()` per component instance for the clipPath ID.

### 2. Group Fill Bar UX (Design Consideration)

The group header shows `groupAvailable / groupAssigned` as a background fill bar. With the sample data this shows ~17% fill — looks alarming even though most individual categories are healthy. YNAB intentionally doesn't show group-level runway because it causes anxiety without actionability.

**Consider:** Show group available as a number only (no fill bar), or invert the metaphor (show "spent" as the fill, so a mostly-empty bar = healthy).

### 3. Overspent Rows Lack Visual Differentiation (Low-Medium)

"Dining Out" (overspent, available = -50k) shows the same empty red sunset circle as any zero-balance row. The user can't distinguish "exactly zero" from "negative" at a glance.

**Fix:** For negative available, show a red outline/ring on the sunset circle, or fill it with a hatched/striped pattern to signal "below zero."

### 4. SVG Accessibility (Low)

Neither `TargetRing` nor `SunsetCircle` have `<title>` or `aria-label`. Screen readers see blank SVGs.

**Fix:** Add `<title>Target: 100% funded</title>` and `role="img"` + `aria-label` to each SVG.

### 5. pdfjs-dist in Dependencies (Low)

`pdfjs-dist` (PDF.js) is in `package.json` dependencies — it's ~2.5MB. If this is for future receipt/statement import, consider lazy-loading it only when the import view is active (dynamic `import()`). If unused, remove it.

### 6. Missing Server → Client Hydration (Known Gap)

The sync engine is currently push-only (IndexedDB → server). A fresh browser login starts empty. This was identified in a prior session. The fix is a `/api/sync/pull?since=TIMESTAMP` endpoint that returns all records (or delta). The Rust backend already has the data — it's a query + JSON serialization away.

## Verdict

No stack replan needed. Solid.js + Rust/Axum + SQLite is correct for a single-user offline-first budget PWA. The dual-indicator design (target ring + sunset circle) is a genuine differentiator. Focus on product (ITE positioning, landing page, billing) not plumbing.
