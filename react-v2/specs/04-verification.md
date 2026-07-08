# Verification Scorecard: Twenty-Dollar React v2 Spec Suite

**Evaluator**: Agent Smith (independent adversarial verifier)  
**Date**: 2026-07-08  
**Spec Version**: 2.0  
**Files Evaluated**: 01-prd.md, 02a-feature-flows.md, 02b-feature-data.md, 02c-design-direction.md, 03a-backend-schema.md, 03b-backend-rules.md

---

## 1. REDUNDANCY

**Verdict: PASS WITH CAVEATS**

### Entity Definitions

Entities are defined ONCE in the PRD (§2, entities 2.1–2.8) and are NOT redefined in later stages. The Backend Spec (03a §2) defines the **SQLite schema** — this is a legitimate separate concern (storage representation vs. domain model), not redundancy. Column types, constraints, and indexes are backend-only concerns absent from the PRD.

### Violations Found

| Item | Stage 1 (PRD) | Stage 3 (Backend) | Assessment |
|------|---------------|-------------------|------------|
| Account type enum | §2.1: "checking / savings / cash / credit" | 03a §2.1: CHECK constraint same values | **Not redundant** — PRD defines domain, backend enforces. Acceptable. |
| Split sum invariant | §2.6: "Sum of all SplitEntries must equal transaction amount" | 03a §2.6, 03b §4.2 TXN-3 | **Borderline** — the invariant is stated in the PRD entity section AND the backend rules catalog. However, the backend is the enforcement authority, so it cites the rule legitimately. |
| Assignment upsert semantics | §2.7: "One assignment per category per month (upsert semantics)" | 03a §2.7: UNIQUE constraint, 03b §4.3 ASN-1 | **Borderline** — same reasoning applies. |

**Conclusion**: No true redundancy where two stages both claim ownership of definition. The backend rules catalog (03b §4) cites PRD-originated invariants as enforcement rules, which is the correct pattern (Stage 1 defines the rule, Stage 3 documents how it's enforced). Acceptable.

---

## 2. CROSS-REFERENCES

**Verdict: PASS**

### Stage 2 → Stage 1 References

- 02a §1 header: `Depends on: 01-prd.md (entities, behavior, constraints)` ✓
- 02a §1 Feature Summary table: Maps features to PRD entity names directly (Account, Assignment, BudgetMonth, Transaction, etc.) ✓
- 02a §3 flows reference PRD entity names (Transaction, SplitEntry, Schedule, Assignment, Transfer, ImportRule) ✓
- 02b header: `Depends on: 01-prd.md, 02a-feature-flows.md` ✓
- 02b §6 store designs reference PRD entity attributes (Account.sort_order, Category.target_type, Transaction.cleared, etc.) ✓
- 02c header: `Depends on: 01-prd.md (stack, constraints), 02a/02b (components, screens)` ✓

### Stage 3 → Stage 1 + Stage 2 References

- 03a header: `Depends on: 01-prd.md, 02a-feature-flows.md, 02b-feature-data.md` ✓
- 03a §1: References "all 8 entities" by name from PRD ✓
- 03b §4 rules catalog: Cites PRD features by name (F1–F10) in section headers ✓
- 03b §8 acceptance criteria: Maps to PRD features (F1–F10) ✓
- 03b header: `Depends on: 03a-backend-schema.md` ✓

**All cross-references are present and explicit.**

---

## 3. AUTHORITY

**Verdict: PASS**

| Concern | Owning Stage | Evidence |
|---------|-------------|----------|
| Entity domain model (attributes, types, relationships) | Stage 1 (01-prd.md §2) | Definitive entity tables with constraints |
| User flows and interaction patterns | Stage 2 (02a §3) | Screen-by-screen happy path + abort flows |
| Component tree and props | Stage 2 (02b §5) | Decomposition table with responsibilities |
| Data layer (MobX store shapes) | Stage 2 (02b §6) | Observable/computed/action catalogs |
| Visual design (color, type, spacing, motion) | Stage 2 (02c §2-4) | Full token system with hex values |
| Database schema (DDL-level) | Stage 3 (03a §2) | Column types, indexes, FKs |
| API endpoint contracts | Stage 3 (03a §3) | Request/response shapes with status codes |
| Business rule enforcement | Stage 3 (03b §4) | Numbered rules with enforcement methods |
| Error taxonomy | Stage 3 (03b §6) | Error codes with conditions and HTTP status |
| Performance/scaling | Stage 3 (03b §7) | Volume assumptions, hot paths, indexing |

### Violations

**None found.** No stage encroaches on another's authority. The PRD defines what; Feature Spec defines how users interact and what the frontend needs; Backend Spec defines how the server enforces and persists.

---

## 4. COVERAGE

**Verdict: PASS WITH CAVEATS**

### PRD Feature → Frontend Flow + Backend Endpoint Mapping

| PRD Feature | Frontend Flow (02a) | Backend Endpoints (03a) | Status |
|-------------|--------------------|-----------------------|--------|
| F1: Budget View | 02a §3 F2 "Budget Grid" | 03a §3.7 (assignments, move) + 03a §3.5 (categories) + 03a §3.10 (month-locks) | ✓ COVERED |
| F2: Transactions View | 02a §3 F3 "Transaction Ledger" | 03a §3.6 (transactions, bulk, splits) | ✓ COVERED |
| F3: Accounts View | 02a §3 F1 "Account Management" | 03a §3.2 (accounts) | ✓ COVERED |
| F4: Scheduled Transactions | 02a §3 F5 "Scheduled Transactions" | 03a §3.8 (schedules, generate) | ✓ COVERED |
| F5: Import View | 02a §3 F6 "Import / Export" | 03a §3.11 (import/csv, export) | ✓ COVERED |
| F6: Settings View | 02a §3 F8 "Category Mgmt" + F9 "Payee Mgmt" | 03a §3.4, 3.5, 3.3, 3.9 | ✓ COVERED |
| F7: Auth | No explicit auth flow in 02a | 03a §3.1 (login, logout, check) | ⚠️ PARTIAL — see below |
| F8: Shared Components | 02b §5 "Shared / Primitive" | N/A (frontend-only) | ✓ N/A |
| F9: Data Layer | 02b §6 "SyncStore" | 03a §3.12 (SSE), 03a §3.13 (hydrate) | ✓ COVERED |
| F10: Budget Engine | 02b BudgetStore computeds | N/A (frontend-only computation) | ✓ N/A |
| F11: Design System | 02c (full document) | N/A (frontend-only) | ✓ N/A |

### Caveats

1. **F7 Auth — Missing frontend flow in 02a.** The PRD defines F7 Auth (login, session validation, logout, cross-tab propagation). The backend covers it fully (03a §3.1, 03b §4.9). But 02a has NO auth user flow — no login screen flow, no redirect-on-expired flow, no cross-tab logout flow. The Screen Inventory (02a §2) also has no `/login` or `/setup` route listed.

   **Severity: MINOR.** Auth is simple enough (cookie session, single tenant) that absence from Feature Flows is an omission, not a blocker. But a developer implementing auth would need to derive the flow from the PRD alone.

2. **F4 Transfers — Implicit coverage.** Transfers (02a §3 F4) rely on the transaction endpoint with transfer-payee detection (03a §3.6 + 03b §4.8). There's no dedicated `/api/transfers` endpoint — transfers are modeled as transactions where the payee has `type='account'`. This is intentional and documented, but worth flagging: the frontend's `TransferStore` (02b §6) exposes a `Transfer` entity type that has no corresponding backend table or endpoint. The frontend must compose this from transaction + payee data.

   **Severity: MINOR.** The approach is sound (PRD §2.5 documents linked_id), but the `Transfer` type in TransferStore is never formally defined. It's implied.

---

## 5. SHAPE CONSISTENCY

**Verdict: PASS WITH CAVEATS**

### Feature Spec §6 (Store data requirements) vs. Backend §3 (API response shapes)

| Store | Expected Data | API Response | Match? |
|-------|--------------|-------------|--------|
| AccountStore.accounts | `Map<id, Account>` with name, type, sort_order, created_at, deleted_at | GET /api/accounts returns objects with same fields | ✓ |
| BudgetStore.assignments | `Map<compositeKey, Assignment>` with id, category_id, month, amount | GET /api/assignments returns same shape | ✓ |
| TransactionStore.transactions | `Map<id, Transaction>` with all PRD §2.5 fields | GET /api/transactions returns matching shape | ⚠️ See below |
| ScheduleStore.schedules | `Map<id, Schedule>` with PRD §2.8 fields | GET /api/schedules returns matching fields | ⚠️ See below |
| CategoryStore.groups + categories | Maps with PRD §2.3/2.4 fields | GET /api/category-groups returns nested structure | ✓ |
| PayeeStore.payees | `Map<id, Payee>` with PRD §2.2 fields | GET /api/payees returns matching shape | ✓ |
| ImportRuleStore.rules | `Map<id, ImportRule>` | GET /api/import-rules returns matching shape | ✓ |

### Mismatches Found

1. **Transaction.source field — PRD vs. Backend divergence.**
   - PRD §2.5 defines `source: string` (origin: manual / import / schedule).
   - Backend schema 03a §2.5 does NOT include a `source` column.
   - Frontend TransactionStore presumably needs this field.
   - **Impact: MINOR.** The `source` can be inferred from `schedule_id` (if set → schedule) or context (import endpoint → import). But the PRD says it's a stored attribute.

2. **Transaction.schedule_id — PRD vs. Backend.**
   - PRD §2.5 defines `schedule_id: string / null` (FK to Schedule).
   - Backend schema 03a §2.5 does NOT include `schedule_id`.
   - However, 03a §3.8 schedule generation response shows schedule_id in the generated transaction object (`"schedule_id": "uuid"`). This is contradictory — the column isn't in the schema table but appears in the endpoint response.
   - **Impact: MINOR.** Likely an omission in the schema table. The endpoint spec implies the column exists.

3. **Schedule.payee field — PRD vs. Backend.**
   - PRD §2.8 defines `payee: string` (denormalized payee name).
   - Backend schema 03a §2.8 defines `payee_id: TEXT, FK -> payees(id)` (normalized reference).
   - **Impact: MINOR.** Backend chose a normalized design (referential integrity over denormalization). This is a conscious backend decision, not a conflict — the frontend can resolve `payee_id` to a name. But the PRD's denormalized design is contradicted.

4. **Account.icon field — PRD vs. Backend.**
   - PRD §2.1 defines `icon: string` (emoji or icon key).
   - Backend schema 03a §2.1 does NOT include an `icon` column.
   - Same omission for CategoryGroup (PRD §2.3 has `icon`, backend §2.3 does not) and Category (PRD §2.4 has `icon`, backend §2.4 does not).
   - **Impact: MINOR.** Icons may be frontend-only (stored in IDB, not synced). But this isn't stated anywhere. A developer would be confused about whether icons persist server-side.

5. **Schedule.auto_clear — PRD vs. Backend.**
   - PRD §2.8 defines `auto_clear: boolean`.
   - Backend schema 03a §2.8 does NOT include `auto_clear`.
   - Backend rule SCH-5 (03b §4.4) says "Generated transactions get cleared=0" (hardcoded).
   - **Impact: MINOR conflict.** The PRD says auto_clear is configurable per schedule; the backend hardcodes cleared=0. This is a functional discrepancy.

---

## 6. GAPS

### BLOCKING

**None identified.** Despite the mismatches above, all are resolvable without architectural changes.

### MINOR

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| 1 | No auth/login frontend flow | 02a missing /login route and flow | Developer must derive from PRD F7 |
| 2 | `source` column missing from backend schema | 03a §2.5 vs. PRD §2.5 | Unclear if tracked server-side |
| 3 | `schedule_id` column missing from backend transactions schema table | 03a §2.5 (but present in endpoint response) | Likely typo/omission in schema table |
| 4 | `icon` columns missing from backend schema (accounts, category_groups, categories) | 03a §2.1, 2.3, 2.4 vs. PRD §2.1, 2.3, 2.4 | Frontend-only storage? Not documented |
| 5 | `auto_clear` missing from backend schedules + contradicted by SCH-5 | 03a §2.8 + 03b SCH-5 vs. PRD §2.8 | Functional discrepancy — PRD says configurable, backend hardcodes |
| 6 | Schedule.payee normalized in backend (payee_id) vs. denormalized in PRD (payee string) | 03a §2.8 vs. PRD §2.8 | Minor design divergence; frontend adapts |
| 7 | `TransferStore` exposes a `Transfer` entity type never formally defined | 02b §6 | Implicit type derived from transactions |
| 8 | PRD Feature numbering differs from Feature Spec numbering | PRD: F1=Budget, F2=Txn, F3=Accounts; 02a: F1=Accounts, F2=Budget, F3=Txn | Confusing cross-referencing |
| 9 | No explicit reconciliation flow documented | PRD F3 mentions reconciliation; 02a has no reconcile flow | Developer must infer |
| 10 | Payee delete behavior unresolved | 03a §3.3: "[OPEN: orphan or reassign?]" | Needs decision before implementation |
| 11 | Duplicate detection strategy unresolved for CSV import | 03a §3.11: "[OPEN: Duplicate detection strategy...]" | Needs decision before implementation |
| 12 | Design Direction §1 says "rounded corners and soft shadows" referencing mood; §5 RTA Banner specifies border-radius: 8px; PRD F11 says "Sharp corners (no border-radius except explicit pill buttons)" | 02c §1 vs. 02c §3 vs. PRD F11 | Minor design contradiction — spec awards rounded corners to specific components while declaring sharp corners as default. Functional but confusing. |

---

## 7. OVERALL VERDICT

### **PASS WITH CAVEATS**

The spec suite is implementable. A developer can build the full application from these documents without hitting architectural blockers. The separation of concerns between stages is clean. Cross-references are explicit and traceable.

**Strengths:**
- Clean entity authority in Stage 1; no redefinition downstream
- Complete endpoint coverage with request/response shapes and error codes
- Feature flows are detailed enough for implementation (happy path + abort + edge cases)
- MobX store design (02b §6) maps cleanly to backend endpoints
- Side effects map (03b §5) is excellent — prevents implementation surprises

**Weaknesses requiring resolution before implementation:**
1. Two OPEN items in backend spec need decisions (payee delete strategy, duplicate detection)
2. Five backend schema omissions vs. PRD entity definitions (source, schedule_id, icon×3, auto_clear)
3. Feature numbering inconsistency between PRD and Feature Spec causes confusion
4. Auth frontend flow is absent from Feature Spec

**Recommendation:** Resolve the 5 schema omissions (decide: frontend-only vs. add columns) and the 2 OPEN items before handing to developers. Everything else is navigable with reasonable assumptions.

---

*End of verification scorecard.*
