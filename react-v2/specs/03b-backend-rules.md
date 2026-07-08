# Backend Spec: Twenty-Dollar React v2 — Rules & Operations

**Version**: 2.0  
**Date**: 2026-07-08  
**Depends on**: 03a-backend-schema.md  

---

<!-- @backend:side-effects -->
## 5. Side Effects Map

Every mutation triggers side effects. This table documents trigger -> effect -> target -> failure handling.

### 5.1 Entity Creation Side Effects

| Trigger | Effect | Target | Failure Handling |
|---------|--------|--------|------------------|
| POST /api/accounts | Auto-create Payee (type='account', account_id=new.id) | payees table | Rollback account creation if payee insert fails |
| POST /api/transactions (transfer) | Create mirror transaction in linked account | transactions table | Rollback parent transaction if mirror fails |
| POST /api/transactions | Broadcast `entity_created` SSE event | All SSE clients | Log error, do not fail request |
| POST /api/transactions (with splits) | Insert split_entries | split_entries table | Rollback transaction if any split fails |
| POST /api/schedules/generate | Create transaction(s) + advance next_due | transactions + schedules tables | Per-schedule: log error, continue to next schedule |
| POST /api/import/csv | Create multiple transactions + auto-create payees | transactions + payees tables | Per-row: log error, continue import, report in response |

### 5.2 Entity Update Side Effects

| Trigger | Effect | Target | Failure Handling |
|---------|--------|--------|------------------|
| PATCH /api/transactions/:id (transfer) | Propagate date/amount/memo to mirror | linked transaction | Rollback parent update if mirror update fails |
| PATCH /api/transactions/:id (payee change on transfer) | Update mirror's account linkage | linked transaction | Rollback if new payee invalid |
| PUT /api/transactions/:id/splits | Delete old splits + insert new | split_entries table | Atomic: rollback all if any fails |
| PUT /api/accounts/reorder | Update sort_order on all listed accounts | accounts table | Atomic batch |
| PUT /api/category-groups/reorder | Update sort_order on all listed groups | category_groups table | Atomic batch |
| PUT /api/categories/reorder | Update sort_order on all listed categories | categories table | Atomic batch |
| POST /api/assignments/move | Update two assignments atomically | assignments table | Rollback both if either fails |

### 5.3 Entity Deletion Side Effects

| Trigger | Effect | Target | Failure Handling |
|---------|--------|--------|------------------|
| DELETE /api/transactions/:id (transfer) | Delete mirror transaction | transactions table | Atomic: both or neither |
| DELETE /api/transactions/:id | CASCADE delete split_entries | split_entries table | FK CASCADE handles this |
| DELETE /api/accounts/:id | Soft-delete only (set deleted_at) | accounts table | N/A |
| POST /api/transactions/bulk (delete) | Delete multiple + their mirrors + splits | transactions, split_entries | Atomic batch in DB transaction |

### 5.4 SSE Broadcast Events

Every successful mutation broadcasts to the SSE stream. Event naming convention:

| Mutation | SSE Event | Payload |
|----------|-----------|---------|
| Any entity INSERT | `entity_created` | `{ "type": "<table>", "entity": {...full object}, "timestamp": "..." }` |
| Any entity UPDATE | `entity_updated` | `{ "type": "<table>", "entity": {...full updated object}, "timestamp": "..." }` |
| Any entity DELETE | `entity_deleted` | `{ "type": "<table>", "id": "uuid", "timestamp": "..." }` |
| Bulk operation | Multiple events (one per affected entity) | Individual events for each |
| Schedule generate | `entity_created` per transaction + `entity_updated` per schedule | Separate events |
| Transfer create | Two `entity_created` events (one per transaction) | Both transactions |
| Heartbeat (30s) | `heartbeat` | `{ "timestamp": "..." }` |

**Broadcast rules:**
- Events fire AFTER successful DB commit (not before)
- Events include full entity state (not diffs) — client replaces local state
- Events are sequenced with monotonic timestamps for ordering
- Events are buffered (last 100) for replay on reconnect via `Last-Event-ID`
- Failed SSE broadcast does NOT roll back the mutation

---

<!-- @backend:errors -->
## 6. Error Taxonomy

All errors follow the shape: `{ "error": { "code": string, "message": string, "details"?: object } }`

### 6.1 Authentication Errors (HTTP 401)

| Code | Condition | Message |
|------|-----------|---------|
| `INVALID_CREDENTIALS` | Wrong username/password on login | "Invalid username or password" |
| `SESSION_EXPIRED` | Session token past expires_at | "Session expired, please log in again" |
| `SESSION_INVALID` | No session cookie or unknown token | "Authentication required" |

### 6.2 Validation Errors (HTTP 422)

| Code | Condition | Message | Details |
|------|-----------|---------|---------|
| `VALIDATION_ERROR` | Missing required field | "Validation failed" | `{ "fields": { "<field>": "reason" } }` |
| `INVALID_AMOUNT` | Amount is zero or non-integer | "Amount must be a non-zero integer (cents)" | `{ "field": "amount" }` |
| `INVALID_MONTH_FORMAT` | Month not YYYY-MM | "Month must be in YYYY-MM format" | `{ "field": "month", "value": "..." }` |
| `INVALID_DATE_FORMAT` | Date not YYYY-MM-DD | "Date must be in YYYY-MM-DD format" | `{ "field": "date", "value": "..." }` |
| `INVALID_ENUM` | Field value not in allowed set | "Invalid value for {field}" | `{ "field": "...", "allowed": [...], "received": "..." }` |
| `SPLIT_SUM_MISMATCH` | Split amounts != parent amount | "Split amounts must sum to transaction amount" | `{ "expected": number, "actual": number }` |
| `SPLIT_MISSING_CATEGORY` | A split entry has no category_id | "All splits must have a category" | `{ "index": number }` |
| `SPLIT_WITH_CATEGORY` | Parent has category_id AND splits | "Transaction with splits must not have a category" | — |
| `SAME_ACCOUNT_TRANSFER` | Transfer payee.account_id = transaction.account_id | "Cannot transfer to the same account" | — |
| `MOVE_SAME_CATEGORY` | from_category_id = to_category_id | "Cannot move money to the same category" | — |
| `MOVE_INVALID_AMOUNT` | Move amount <= 0 | "Move amount must be positive" | — |
| `IMPORT_PARSE_ERROR` | CSV parsing failed | "Failed to parse CSV file" | `{ "row"?: number, "reason": string }` |

### 6.3 Conflict Errors (HTTP 409)

| Code | Condition | Message |
|------|-----------|---------|
| `DUPLICATE_NAME` | Unique name constraint violated | "'{name}' already exists" |
| `DELETE_GUARD` | Entity has dependent records | "Cannot delete: has {count} {dependents}" |
| `ALREADY_LOCKED` | Month already locked | "Month {month} is already locked" |
| `MONTH_LOCKED` | Attempting write to locked month | "Month {month} is locked" |

### 6.4 Not Found Errors (HTTP 404)

| Code | Condition | Message |
|------|-----------|---------|
| `NOT_FOUND` | Entity ID does not exist | "{entity_type} not found" |
| `MONTH_NOT_LOCKED` | Attempting to unlock a month that isn't locked | "Month {month} is not locked" |

### 6.5 Server Errors (HTTP 500)

| Code | Condition | Message |
|------|-----------|---------|
| `INTERNAL_ERROR` | Unexpected failure (DB error, panic) | "Internal server error" |
| `SSE_BROADCAST_FAILED` | SSE broadcast failed (non-fatal, logged) | (not returned to client — internal only) |

---

<!-- @backend:performance -->
## 7. Performance & Scaling

### 7.1 Volume Assumptions (single-tenant)

| Entity | Expected Volume | Growth Rate |
|--------|----------------|-------------|
| Accounts | 5-15 | Static |
| Payees | 50-500 | ~2/week |
| Category Groups | 5-15 | Static |
| Categories | 20-80 | Rare |
| Transactions | 5,000-50,000 | ~30-100/month |
| Split Entries | 500-5,000 | ~10% of transactions |
| Assignments | 500-5,000 | categories × months |
| Schedules | 10-50 | Rare |
| Import Rules | 10-100 | Rare |

### 7.2 Hot Paths

| Path | Frequency | Optimization |
|------|-----------|-------------|
| GET /api/hydrate | Once per app load | Single query per table; no joins. Consider streaming JSON for large datasets. |
| GET /api/transactions (filtered) | Every account view | Composite index on (account_id, date). Pagination with limit/offset. |
| PUT /api/assignments | Every budget cell edit | Upsert via INSERT OR REPLACE. Single row operation. |
| POST /api/schedules/generate | Every app load | Index on (next_due) WHERE paused=0. Loop generates in single DB transaction. |
| GET /api/events (SSE) | Persistent connection | Event buffer in memory; no DB polling. Async broadcast via channel. |

### 7.3 Expensive Queries

| Query | When | Cost | Mitigation |
|-------|------|------|------------|
| Full hydration (all tables) | App startup | O(total_records) | Acceptable for <50k records. Stream response if >10MB. |
| Transaction list with filters | Account view | O(n) where n = account transactions | Indexed by (account_id, date); limit default 500 |
| Export (full dump) | Manual trigger (rare) | O(total_records) | Same as hydration; acceptable for single-tenant |
| CSV import (batch insert) | Manual trigger | O(rows × rules) for rule matching | Batch inserts in single transaction; 1000-row chunks |
| Schedule generation | App startup | O(due_schedules × missed_occurrences) | Usually <10 schedules, <5 missed each |

### 7.4 Pagination Strategy

- **Transactions:** limit/offset with default limit=500. Frontend uses virtual scroll so typically requests all for an account.
- **Other entities:** No pagination needed (all <500 records in single-tenant). Full table returned.
- **Hydration:** No pagination — full dump. If total records exceed 100k, consider chunked streaming.

[ASSUMED: Single-tenant volume never exceeds 100k total records. No pagination on non-transaction endpoints.]

### 7.5 Connection Handling

- **SQLite:** Single writer, multiple readers. Write operations serialized via Rust's `tokio::sync::Mutex` or SQLite WAL mode.
- **SSE:** One persistent connection per tab/device. Server maintains connection pool. Heartbeat every 30s to detect stale connections. Max connections: 10 (single user, few devices/tabs).
- **Request timeout:** 30s for normal requests, 60s for CSV import, no timeout for SSE.

### 7.6 SQLite Configuration

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

---

<!-- @backend:acceptance-criteria -->
## 8. Acceptance Criteria

Testable assertions for the backend API. Each maps to a feature from the PRD.

### 8.1 Authentication (F7: Auth)

- [ ] POST /auth/login with valid credentials returns 200 + session cookie
- [ ] POST /auth/login with invalid credentials returns 401
- [ ] Requests without session cookie return 401 (except /auth/login, /auth/check)
- [ ] Expired sessions return 401 with SESSION_EXPIRED code
- [ ] POST /auth/logout invalidates the session

### 8.2 Accounts (F3: Accounts View)

- [ ] POST /api/accounts creates account + auto-creates payee with type='account'
- [ ] POST /api/accounts with duplicate name (case-insensitive) returns 409
- [ ] DELETE /api/accounts/:id with transactions returns 409 DELETE_GUARD
- [ ] DELETE /api/accounts/:id without transactions soft-deletes (sets deleted_at)
- [ ] GET /api/accounts excludes soft-deleted accounts
- [ ] PUT /api/accounts/reorder updates sort_order for all listed accounts

### 8.3 Transactions (F2: Transactions View)

- [ ] POST /api/transactions with amount=0 returns 422 INVALID_AMOUNT
- [ ] POST /api/transactions with splits where sum != amount returns 422 SPLIT_SUM_MISMATCH
- [ ] POST /api/transactions with transfer payee creates mirror transaction with opposite amount
- [ ] Mirror transaction has bidirectional linked_id
- [ ] PATCH /api/transactions/:id on transfer propagates date/amount/memo to mirror
- [ ] DELETE /api/transactions/:id on transfer also deletes mirror
- [ ] POST /api/transactions/bulk with action=delete removes all listed + their mirrors
- [ ] POST /api/transactions/bulk with action=categorize sets category_id on all listed
- [ ] PUT /api/transactions/:id/splits replaces existing splits atomically

### 8.4 Assignments (F1: Budget View)

- [ ] PUT /api/assignments upserts (creates if new, updates if exists for category+month)
- [ ] PUT /api/assignments for a locked month returns 409 MONTH_LOCKED
- [ ] POST /api/assignments/move adjusts two assignments atomically
- [ ] POST /api/assignments/move with from=to returns 422
- [ ] POST /api/assignments/move with amount<=0 returns 422

### 8.5 Schedules (F4: Scheduled Transactions)

- [ ] POST /api/schedules sets next_due = start_date
- [ ] POST /api/schedules/generate creates transactions for all due non-paused schedules
- [ ] Generated transactions have cleared=0
- [ ] After generation, schedule.next_due advances to next occurrence
- [ ] Paused schedules (paused=1) are skipped by generate
- [ ] Schedule past end_date does not generate and does not advance
- [ ] Multiple missed occurrences generate multiple transactions
- [ ] DELETE /api/schedules/:id does not affect previously generated transactions

### 8.6 Categories (F6: Settings — Categories)

- [ ] POST /api/categories with duplicate name in same group returns 409
- [ ] DELETE /api/categories/:id with referencing transactions returns 409 DELETE_GUARD
- [ ] DELETE /api/category-groups/:id with child categories returns 409 DELETE_GUARD
- [ ] PATCH /api/categories/:id with group_id moves category to new group
- [ ] target_type=null clears target_amount and target_date

### 8.7 Month Locks (F10: Month Lock)

- [ ] POST /api/month-locks creates lock record
- [ ] POST /api/month-locks for already-locked month returns 409
- [ ] DELETE /api/month-locks/:month removes lock
- [ ] DELETE /api/month-locks/:month for unlocked month returns 404
- [ ] Locked month blocks PUT /api/assignments for that month
- [ ] Locked month blocks POST /api/assignments/move for that month
- [ ] Locked month does NOT block transaction CRUD for that month

### 8.8 Import / Export (F5: Import View)

- [ ] POST /api/import/csv parses CSV and creates transactions in target account
- [ ] Import applies matching import_rules to set payee_id/category_id
- [ ] Import returns count of imported, skipped, and per-row errors
- [ ] GET /api/export returns all entity tables as JSON
- [ ] Export includes all 10 entity types + exported_at timestamp

### 8.9 SSE (F9: Data Layer — real-time sync)

- [ ] GET /api/events returns text/event-stream content type
- [ ] Creating any entity broadcasts entity_created event
- [ ] Updating any entity broadcasts entity_updated event with full new state
- [ ] Deleting any entity broadcasts entity_deleted event with id
- [ ] Heartbeat events sent every 30 seconds
- [ ] Reconnection with Last-Event-ID replays buffered events
- [ ] SSE requires valid session cookie (401 without)

### 8.10 Hydration (F9: Data Layer — startup)

- [ ] GET /api/hydrate returns all entity tables in single response
- [ ] Response includes server_time for client clock-sync reference
- [ ] All entities include full field set (no partial objects)

### 8.11 Import Rules (F7: Import Rules)

- [ ] POST /api/import-rules creates rule with tokens
- [ ] During import, rules matched case-insensitively against descriptions
- [ ] First matching rule (by created_at ASC) wins
- [ ] Rule can set payee_id only, category_id only, or both

### 8.12 Cross-cutting

- [ ] All mutation endpoints broadcast corresponding SSE events
- [ ] All amounts stored and returned as integer cents
- [ ] All timestamps are ISO-8601
- [ ] Foreign key violations return appropriate error (not raw SQL error)
- [ ] Concurrent writes are serialized (no data corruption under parallel requests)
- [ ] Response times: single-entity CRUD < 50ms, hydration < 500ms for 50k records, CSV import < 5s for 1000 rows
