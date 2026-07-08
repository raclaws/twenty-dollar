# Backend Spec: Twenty-Dollar React v2 — Schema & Endpoints

**Version**: 2.0  
**Date**: 2026-07-08  
**Depends on**: 01-prd.md, 02a-feature-flows.md, 02b-feature-data.md  
**Runtime**: Rust + Axum, port 3001, SQLite  

---

<!-- @backend:summary -->
## 1. Feature Summary

The Rust backend (port 3001) provides a REST API + SSE event stream enabling the React frontend to:

- **Persist** all 8 entities (Account, Payee, CategoryGroup, Category, Transaction, SplitEntry, Assignment, Schedule) plus ImportRule and month-lock state
- **Compute** nothing — all budget math (RTA, available, activity) is frontend-derived from raw entity data
- **Sync** state across tabs/devices via Server-Sent Events (entity CRUD broadcasts)
- **Authenticate** a single tenant via cookie-based session (no multi-user)
- **Generate** transactions from due Schedules on demand
- **Import** CSV transaction batches into a target account
- **Export** full database as JSON

The backend is a thin CRUD + event layer. It owns data integrity (FK constraints, delete guards, unique checks) but delegates all budget logic to the client.

---

<!-- @backend:data-model -->
## 2. Data Model

SQLite database. All tables use UUID primary keys (TEXT). Timestamps are ISO-8601 strings. Amounts are INTEGER (cents).

### 2.1 accounts

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `name` | TEXT | NOT NULL, UNIQUE (case-insensitive among active) |
| `type` | TEXT | NOT NULL, CHECK(type IN ('checking','savings','cash','credit')) |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 |
| `created_at` | TEXT | NOT NULL, ISO-8601 |
| `deleted_at` | TEXT | NULLABLE, ISO-8601 (soft delete) |

**Indexes:** `idx_accounts_sort` ON (sort_order), `idx_accounts_deleted` ON (deleted_at)  
**Delete guard:** Cannot set deleted_at if transactions reference this account.

### 2.2 payees

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `name` | TEXT | NOT NULL, UNIQUE |
| `type` | TEXT | NOT NULL, CHECK(type IN ('external','account')) |
| `account_id` | TEXT | NULLABLE, FK -> accounts(id) |
| `created_at` | TEXT | NOT NULL, ISO-8601 |

**Indexes:** `idx_payees_name` ON (name), `idx_payees_account` ON (account_id) WHERE account_id IS NOT NULL  
**Constraint:** When type='account', account_id must reference a valid Account.

### 2.3 category_groups

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `name` | TEXT | NOT NULL, UNIQUE |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 |

**Indexes:** `idx_category_groups_sort` ON (sort_order)  
**Delete guard:** Cannot delete if categories reference this group.

### 2.4 categories

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `group_id` | TEXT | NOT NULL, FK -> category_groups(id) |
| `name` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 |
| `target_type` | TEXT | NULLABLE, CHECK(target_type IN ('monthly','by_date','savings')) |
| `target_amount` | INTEGER | NULLABLE, cents |
| `target_date` | TEXT | NULLABLE, ISO date |

**Indexes:** `idx_categories_group` ON (group_id, sort_order)  
**Unique:** UNIQUE(group_id, name) — name unique within group  
**Delete guard:** Cannot delete if transactions or split_entries reference this category.

### 2.5 transactions

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `account_id` | TEXT | NOT NULL, FK -> accounts(id) |
| `payee_id` | TEXT | NOT NULL, FK -> payees(id) |
| `category_id` | TEXT | NULLABLE, FK -> categories(id) |
| `date` | TEXT | NOT NULL, ISO date (YYYY-MM-DD) |
| `amount` | INTEGER | NOT NULL, cents (negative=outflow, positive=inflow) |
| `memo` | TEXT | NULLABLE |
| `cleared` | INTEGER | NOT NULL, DEFAULT 0, CHECK(cleared IN (0,1)) |
| `reconciled_at` | TEXT | NULLABLE, ISO-8601 |
| `linked_id` | TEXT | NULLABLE, FK -> transactions(id) |
| `created_at` | TEXT | NOT NULL, ISO-8601 |

**Indexes:**
- `idx_txn_account_date` ON (account_id, date)
- `idx_txn_category_date` ON (category_id, date) WHERE category_id IS NOT NULL
- `idx_txn_payee` ON (payee_id)
- `idx_txn_linked` ON (linked_id) WHERE linked_id IS NOT NULL
- `idx_txn_date` ON (date)

**Constraint:** When split_entries exist for this transaction, category_id MUST be NULL.

### 2.6 split_entries

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `transaction_id` | TEXT | NOT NULL, FK -> transactions(id) ON DELETE CASCADE |
| `category_id` | TEXT | NOT NULL, FK -> categories(id) |
| `amount` | INTEGER | NOT NULL, cents |
| `memo` | TEXT | NULLABLE |

**Indexes:** `idx_splits_txn` ON (transaction_id), `idx_splits_category` ON (category_id)  
**Constraint:** SUM(amount) of all splits for a transaction MUST equal parent transaction.amount.

### 2.7 assignments

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `category_id` | TEXT | NOT NULL, FK -> categories(id) |
| `month` | TEXT | NOT NULL, format YYYY-MM |
| `amount` | INTEGER | NOT NULL, cents |

**Indexes:** `idx_assignments_cat_month` ON (category_id, month)  
**Unique:** UNIQUE(category_id, month) — one assignment per category per month (upsert semantics).

### 2.8 schedules

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `account_id` | TEXT | NOT NULL, FK -> accounts(id) |
| `payee_id` | TEXT | NOT NULL, FK -> payees(id) |
| `category_id` | TEXT | NULLABLE, FK -> categories(id) |
| `amount` | INTEGER | NOT NULL, cents (signed) |
| `memo` | TEXT | NULLABLE |
| `frequency` | TEXT | NOT NULL, CHECK(frequency IN ('weekly','biweekly','monthly','yearly')) |
| `start_date` | TEXT | NOT NULL, ISO date |
| `end_date` | TEXT | NULLABLE, ISO date |
| `next_due` | TEXT | NOT NULL, ISO date |
| `paused` | INTEGER | NOT NULL, DEFAULT 0, CHECK(paused IN (0,1)) |
| `created_at` | TEXT | NOT NULL, ISO-8601 |

**Indexes:** `idx_schedules_next_due` ON (next_due) WHERE paused = 0

### 2.9 import_rules

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, UUID |
| `tokens` | TEXT | NOT NULL (match pattern for transaction descriptions) |
| `payee_id` | TEXT | NULLABLE, FK -> payees(id) |
| `category_id` | TEXT | NULLABLE, FK -> categories(id) |
| `created_at` | TEXT | NOT NULL, ISO-8601 |

**Indexes:** `idx_import_rules_tokens` ON (tokens)

### 2.10 month_locks

| Column | Type | Constraints |
|--------|------|-------------|
| `month` | TEXT | PK, format YYYY-MM |
| `locked_at` | TEXT | NOT NULL, ISO-8601 |

### 2.11 sessions (auth)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK, session token |
| `user_id` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL, ISO-8601 |
| `expires_at` | TEXT | NOT NULL, ISO-8601 |

[ASSUMED: Single user record created at deploy time; no users table exposed via API]

---

<!-- @backend:endpoints -->
## 3. API Endpoints

Base URL: `http://localhost:3001/api`  
Auth: Cookie-based session. All endpoints except `POST /auth/login` require valid session cookie.  
Content-Type: `application/json` (request and response)  
Error shape: `{ "error": { "code": string, "message": string, "details"?: object } }`

### 3.1 Authentication

#### POST /auth/login
Authenticate and receive session cookie.

- **Request:** `{ "username": string, "password": string }`
- **Response 200:** `{ "ok": true }` + Set-Cookie header
- **Response 401:** `{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid username or password" } }`

#### POST /auth/logout
Invalidate session.

- **Request:** (empty)
- **Response 200:** `{ "ok": true }` + Clear-Cookie header

#### GET /auth/check
Verify session validity (used on app startup).

- **Response 200:** `{ "authenticated": true, "user_id": string }`
- **Response 401:** `{ "authenticated": false }`

---

### 3.2 Accounts

#### GET /api/accounts
List all active accounts.

- **Response 200:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "name": "Checking",
      "type": "checking",
      "sort_order": 0,
      "created_at": "2026-01-01T00:00:00Z",
      "deleted_at": null
    }
  ]
}
```

#### POST /api/accounts
Create account. Auto-creates corresponding Payee (type='account').

- **Request:** `{ "name": string, "type": "checking"|"savings"|"cash"|"credit" }`
- **Response 201:**
```json
{
  "account": { ...full account object },
  "payee": { ...auto-created payee object }
}
```
- **Response 409:** `DUPLICATE_NAME` — name already exists (case-insensitive)
- **Response 422:** `VALIDATION_ERROR` — missing/invalid fields

#### PATCH /api/accounts/:id
Update account fields.

- **Request:** `{ "name"?: string, "type"?: string, "sort_order"?: number }`
- **Response 200:** `{ "account": { ...updated } }`
- **Response 404:** `NOT_FOUND`
- **Response 409:** `DUPLICATE_NAME`

#### DELETE /api/accounts/:id
Soft-delete account (sets deleted_at).

- **Response 200:** `{ "ok": true }`
- **Response 404:** `NOT_FOUND`
- **Response 409:** `DELETE_GUARD` — account has transactions

#### PUT /api/accounts/reorder
Batch update sort_order.

- **Request:** `{ "order": [{ "id": string, "sort_order": number }] }`
- **Response 200:** `{ "ok": true }`

---

### 3.3 Payees

#### GET /api/payees
List all payees.

- **Response 200:**
```json
{
  "payees": [
    {
      "id": "uuid",
      "name": "Grocery Store",
      "type": "external",
      "account_id": null,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/payees
Create payee.

- **Request:** `{ "name": string, "type"?: "external"|"account", "account_id"?: string }`
- **Response 201:** `{ "payee": { ... } }`
- **Response 409:** `DUPLICATE_NAME`

#### PATCH /api/payees/:id
Update payee.

- **Request:** `{ "name"?: string }`
- **Response 200:** `{ "payee": { ...updated } }`

#### DELETE /api/payees/:id
Delete payee.

- **Response 200:** `{ "ok": true }`
- **Response 409:** `DELETE_GUARD` — payee has transactions [OPEN: orphan or reassign?]

---

### 3.4 Category Groups

#### GET /api/category-groups
List all groups with nested categories.

- **Response 200:**
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Bills",
      "sort_order": 0,
      "categories": [
        {
          "id": "uuid",
          "group_id": "uuid",
          "name": "Rent",
          "sort_order": 0,
          "target_type": "monthly",
          "target_amount": 150000,
          "target_date": null
        }
      ]
    }
  ]
}
```

#### POST /api/category-groups
Create group.

- **Request:** `{ "name": string }`
- **Response 201:** `{ "group": { ... } }`
- **Response 409:** `DUPLICATE_NAME`

#### PATCH /api/category-groups/:id
Update group.

- **Request:** `{ "name"?: string, "sort_order"?: number }`
- **Response 200:** `{ "group": { ...updated } }`

#### DELETE /api/category-groups/:id
Delete group.

- **Response 200:** `{ "ok": true }`
- **Response 409:** `DELETE_GUARD` — group has categories

#### PUT /api/category-groups/reorder
Batch reorder groups.

- **Request:** `{ "order": [{ "id": string, "sort_order": number }] }`
- **Response 200:** `{ "ok": true }`

---

### 3.5 Categories

#### POST /api/categories
Create category within a group.

- **Request:** `{ "group_id": string, "name": string, "target_type"?: string, "target_amount"?: number, "target_date"?: string }`
- **Response 201:** `{ "category": { ... } }`
- **Response 409:** `DUPLICATE_NAME` — name exists within group

#### PATCH /api/categories/:id
Update category (including target fields and group reassignment).

- **Request:** `{ "name"?: string, "group_id"?: string, "sort_order"?: number, "target_type"?: string|null, "target_amount"?: number|null, "target_date"?: string|null }`
- **Response 200:** `{ "category": { ...updated } }`

#### DELETE /api/categories/:id
Delete category.

- **Response 200:** `{ "ok": true }`
- **Response 409:** `DELETE_GUARD` — category has transactions or split_entries

#### PUT /api/categories/reorder
Batch reorder within group.

- **Request:** `{ "group_id": string, "order": [{ "id": string, "sort_order": number }] }`
- **Response 200:** `{ "ok": true }`

---

### 3.6 Transactions

#### GET /api/transactions
List transactions with optional filters.

- **Query params:**
  - `account_id` (optional) — filter by account
  - `category_id` (optional) — filter by category
  - `date_from` (optional) — ISO date, inclusive
  - `date_to` (optional) — ISO date, inclusive
  - `cleared` (optional) — 0 or 1
  - `limit` (optional, default 500) — pagination
  - `offset` (optional, default 0) — pagination

- **Response 200:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "account_id": "uuid",
      "payee_id": "uuid",
      "category_id": "uuid|null",
      "date": "2026-01-15",
      "amount": -5000,
      "memo": "Groceries",
      "cleared": 1,
      "reconciled_at": null,
      "linked_id": null,
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 1234
}
```

#### POST /api/transactions
Create transaction. For transfers (payee.type='account'), auto-creates mirror transaction.

- **Request:**
```json
{
  "account_id": "uuid",
  "payee_id": "uuid",
  "category_id": "uuid|null",
  "date": "2026-01-15",
  "amount": -5000,
  "memo": "optional",
  "cleared": 0,
  "splits": [
    { "category_id": "uuid", "amount": -3000, "memo": "optional" },
    { "category_id": "uuid", "amount": -2000, "memo": null }
  ]
}
```
- `splits` is optional. If provided, `category_id` on parent must be null and sum(splits.amount) must equal parent amount.
- **Response 201:**
```json
{
  "transaction": { ...full object },
  "splits": [ ...if created ],
  "mirror": { ...if transfer, the linked transaction }
}
```
- **Response 422:** `VALIDATION_ERROR` — invalid fields, split sum mismatch, zero amount

#### PATCH /api/transactions/:id
Update transaction fields. Propagates to mirror if transfer.

- **Request:** `{ "date"?: string, "payee_id"?: string, "category_id"?: string|null, "amount"?: number, "memo"?: string|null, "cleared"?: 0|1 }`
- **Response 200:** `{ "transaction": { ...updated }, "mirror"?: { ...if transfer } }`
- **Response 404:** `NOT_FOUND`

#### DELETE /api/transactions/:id
Delete transaction. Cascades to split_entries. Deletes mirror if transfer.

- **Response 200:** `{ "ok": true, "deleted_mirror": boolean }`
- **Response 404:** `NOT_FOUND`

#### POST /api/transactions/bulk
Bulk operations on multiple transactions.

- **Request:**
```json
{
  "ids": ["uuid", "uuid"],
  "action": "delete"|"clear"|"unclear"|"categorize",
  "category_id": "uuid (required for categorize action)"
}
```
- **Response 200:** `{ "affected": number }`
- **Response 422:** `VALIDATION_ERROR` — invalid action or missing category_id for categorize

#### PUT /api/transactions/:id/splits
Replace all splits for a transaction.

- **Request:** `{ "splits": [{ "category_id": string, "amount": number, "memo"?: string }] }`
- **Response 200:** `{ "splits": [...created] }`
- **Response 422:** `SPLIT_SUM_MISMATCH` — splits don't sum to transaction amount

---

### 3.7 Assignments

#### GET /api/assignments
List all assignments, optionally filtered by month.

- **Query params:**
  - `month` (optional) — YYYY-MM format
  - `category_id` (optional)

- **Response 200:**
```json
{
  "assignments": [
    { "id": "uuid", "category_id": "uuid", "month": "2026-01", "amount": 50000 }
  ]
}
```

#### PUT /api/assignments
Upsert assignment (create or update for category+month pair).

- **Request:** `{ "category_id": string, "month": string, "amount": number }`
- **Response 200:** `{ "assignment": { ...upserted } }`
- **Response 422:** `VALIDATION_ERROR` — invalid month format, missing fields

#### POST /api/assignments/move
Move money between categories (adjusts two assignments atomically).

- **Request:** `{ "from_category_id": string, "to_category_id": string, "month": string, "amount": number }`
- **Response 200:**
```json
{
  "from": { ...updated assignment },
  "to": { ...updated assignment }
}
```
- **Response 422:** `VALIDATION_ERROR` — same category, zero/negative amount
- **Response 409:** `MONTH_LOCKED` — target month is locked

---

### 3.8 Schedules

#### GET /api/schedules
List all schedules.

- **Response 200:**
```json
{
  "schedules": [
    {
      "id": "uuid",
      "account_id": "uuid",
      "payee_id": "uuid",
      "category_id": "uuid|null",
      "amount": -10000,
      "memo": null,
      "frequency": "monthly",
      "start_date": "2026-01-01",
      "end_date": null,
      "next_due": "2026-02-01",
      "paused": 0,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/schedules
Create schedule.

- **Request:** `{ "account_id": string, "payee_id": string, "category_id"?: string, "amount": number, "memo"?: string, "frequency": string, "start_date": string, "end_date"?: string }`
- `next_due` is auto-set to `start_date` on creation.
- **Response 201:** `{ "schedule": { ... } }`

#### PATCH /api/schedules/:id
Update schedule.

- **Request:** `{ "payee_id"?: string, "category_id"?: string|null, "amount"?: number, "memo"?: string|null, "frequency"?: string, "end_date"?: string|null, "paused"?: 0|1 }`
- **Response 200:** `{ "schedule": { ...updated } }`

#### DELETE /api/schedules/:id
Delete schedule. Does NOT delete previously generated transactions.

- **Response 200:** `{ "ok": true }`

#### POST /api/schedules/generate
Generate transactions for all due (non-paused) schedules where next_due <= today.

- **Request:** (empty body, or `{ "as_of"?: "YYYY-MM-DD" }` to override "today")
- **Response 200:**
```json
{
  "generated": [
    {
      "schedule_id": "uuid",
      "transaction": { ...created transaction },
      "new_next_due": "2026-03-01"
    }
  ],
  "count": 3
}
```

---

### 3.9 Import Rules

#### GET /api/import-rules
List all import rules.

- **Response 200:**
```json
{
  "rules": [
    { "id": "uuid", "tokens": "NETFLIX", "payee_id": "uuid|null", "category_id": "uuid|null", "created_at": "..." }
  ]
}
```

#### POST /api/import-rules
Create rule.

- **Request:** `{ "tokens": string, "payee_id"?: string, "category_id"?: string }`
- **Response 201:** `{ "rule": { ... } }`

#### PATCH /api/import-rules/:id
Update rule.

- **Request:** `{ "tokens"?: string, "payee_id"?: string|null, "category_id"?: string|null }`
- **Response 200:** `{ "rule": { ...updated } }`

#### DELETE /api/import-rules/:id
Delete rule.

- **Response 200:** `{ "ok": true }`

---

### 3.10 Month Locks

#### GET /api/month-locks
List all locked months.

- **Response 200:** `{ "locks": [{ "month": "2026-01", "locked_at": "..." }] }`

#### POST /api/month-locks
Lock a month.

- **Request:** `{ "month": "YYYY-MM" }`
- **Response 201:** `{ "lock": { "month": "2026-01", "locked_at": "..." } }`
- **Response 409:** `ALREADY_LOCKED`

#### DELETE /api/month-locks/:month
Unlock a month.

- **Response 200:** `{ "ok": true }`
- **Response 404:** `NOT_FOUND` — month was not locked

---

### 3.11 Import / Export

#### POST /api/import/csv
Import transactions from CSV for a target account.

- **Content-Type:** `multipart/form-data`
- **Fields:**
  - `file`: CSV file
  - `account_id`: target account UUID
  - `column_map`: JSON string mapping CSV columns to fields: `{ "date": number, "amount": number, "payee"?: number, "memo"?: number, "category"?: number }`
- **Response 200:**
```json
{
  "imported": 45,
  "skipped": 2,
  "errors": [
    { "row": 12, "reason": "Invalid date format" }
  ]
}
```
- **Response 422:** `VALIDATION_ERROR` — missing account_id or file

[OPEN: Duplicate detection strategy — date+amount+payee hash to skip duplicates, or always import?]

#### GET /api/export
Export full database as JSON.

- **Response 200:**
```json
{
  "accounts": [...],
  "payees": [...],
  "category_groups": [...],
  "categories": [...],
  "transactions": [...],
  "split_entries": [...],
  "assignments": [...],
  "schedules": [...],
  "import_rules": [...],
  "month_locks": [...],
  "exported_at": "2026-07-08T12:00:00Z"
}
```

---

### 3.12 Server-Sent Events (SSE)

#### GET /api/events
SSE stream for real-time sync. Requires valid session cookie.

- **Connection:** `EventSource` with credentials
- **Event format:**
```
event: entity_created
data: {"type":"transaction","entity":{...full object},"timestamp":"..."}

event: entity_updated
data: {"type":"account","entity":{...full object},"timestamp":"..."}

event: entity_deleted
data: {"type":"transaction","id":"uuid","timestamp":"..."}

event: heartbeat
data: {"timestamp":"..."}
```

- **Event types:** `entity_created`, `entity_updated`, `entity_deleted`, `heartbeat`
- **Entity types in events:** `account`, `payee`, `category_group`, `category`, `transaction`, `split_entry`, `assignment`, `schedule`, `import_rule`, `month_lock`
- **Heartbeat interval:** every 30 seconds
- **Reconnection:** Client uses `Last-Event-ID` header; server replays missed events if available

[ASSUMED: Server maintains a short event buffer (last 100 events) for replay on reconnect. Events older than buffer are lost; client should full-hydrate if reconnect gap is too large.]

---

### 3.13 Hydration (bulk fetch)

#### GET /api/hydrate
Full-table dump for startup hydration. Returns all entities in one response.

- **Response 200:**
```json
{
  "accounts": [...],
  "payees": [...],
  "category_groups": [...],
  "categories": [...],
  "transactions": [...],
  "split_entries": [...],
  "assignments": [...],
  "schedules": [...],
  "import_rules": [...],
  "month_locks": [...],
  "server_time": "2026-07-08T12:00:00Z"
}
```

[ASSUMED: Full hydration is acceptable for single-tenant volume (<50k records). No incremental/delta sync in v2.]

---

<!-- @backend:rules -->
## 4. Business Rules Catalog

Rules the backend MUST enforce. Cited by PRD feature name.

### 4.1 Account Rules (F3: Accounts View)

| ID | Rule | Enforcement |
|----|------|-------------|
| ACC-1 | Account name must be unique among active accounts (case-insensitive) | UNIQUE constraint + WHERE deleted_at IS NULL check on INSERT/UPDATE |
| ACC-2 | Account type must be one of: checking, savings, cash, credit | CHECK constraint |
| ACC-3 | Cannot delete account that has transactions | DELETE endpoint checks COUNT(transactions) > 0 before soft-delete |
| ACC-4 | Creating an account auto-creates a Payee with type='account' and account_id set | POST /api/accounts handler creates both in a transaction |
| ACC-5 | Soft-deleted accounts are excluded from GET /api/accounts (unless include_deleted=true) | WHERE deleted_at IS NULL filter |

### 4.2 Transaction Rules (F2: Transactions View)

| ID | Rule | Enforcement |
|----|------|-------------|
| TXN-1 | Amount must be non-zero integer (cents) | Validation on POST/PATCH; reject amount=0 |
| TXN-2 | When splits exist, parent category_id MUST be NULL | Validate on POST; reject if both category_id and splits provided |
| TXN-3 | Split amounts must sum to parent transaction amount exactly | SUM check on POST /api/transactions and PUT /api/transactions/:id/splits |
| TXN-4 | Each split must have a category_id | Validation on split entries |
| TXN-5 | Transfer semantics: when payee.type='account', create mirror transaction in linked account | POST handler checks payee type, creates mirror with opposite amount, bidirectional linked_id |
| TXN-6 | Editing transfer propagates date/amount/memo to mirror | PATCH handler detects linked_id, updates mirror fields |
| TXN-7 | Deleting transfer deletes mirror transaction | DELETE handler checks linked_id, cascades |
| TXN-8 | linked_id must be bidirectional (A.linked_id=B.id AND B.linked_id=A.id) | Enforced on creation; integrity check on update |
| TXN-9 | Bulk categorize cannot target split transactions | Validate in POST /api/transactions/bulk |

### 4.3 Assignment Rules (F1: Budget View)

| ID | Rule | Enforcement |
|----|------|-------------|
| ASN-1 | One assignment per category per month (upsert) | UNIQUE(category_id, month) + INSERT OR REPLACE |
| ASN-2 | Assignment amount can be zero (explicit zero allocation) | No minimum check on amount |
| ASN-3 | Cannot create/update assignment for a locked month | Check month_locks table before write |
| ASN-4 | Move Money is atomic: decrease from + increase to in single transaction | DB transaction wrapping both updates |
| ASN-5 | Move Money: from != to, amount > 0 | Validation in POST /api/assignments/move |

### 4.4 Schedule Rules (F4: Scheduled Transactions)

| ID | Rule | Enforcement |
|----|------|-------------|
| SCH-1 | next_due auto-set to start_date on creation | POST handler sets next_due = start_date |
| SCH-2 | Generate only processes schedules where paused=0 AND next_due <= as_of_date | Query filter in POST /api/schedules/generate |
| SCH-3 | After generating, advance next_due based on frequency | Calculate next occurrence: weekly(+7d), biweekly(+14d), monthly(+1mo), yearly(+1yr) |
| SCH-4 | If end_date is set and next computed next_due > end_date, do not advance (schedule completed) | Post-generation check |
| SCH-5 | Generated transactions get cleared=0 | Hardcoded on creation |
| SCH-6 | Deleting schedule does NOT delete previously generated transactions | DELETE only removes schedule record |
| SCH-7 | If app offline for weeks, generate ALL missed occurrences on next generate call | Loop: while next_due <= as_of_date, generate + advance |

### 4.5 Category Rules (F6: Settings — Categories)

| ID | Rule | Enforcement |
|----|------|-------------|
| CAT-1 | Category name unique within its group | UNIQUE(group_id, name) |
| CAT-2 | Cannot delete category with transactions referencing it | COUNT check before delete |
| CAT-3 | Cannot delete category with split_entries referencing it | COUNT check before delete |
| CAT-4 | Cannot delete group with categories in it | COUNT check before delete |
| CAT-5 | target_date only valid when target_type='by_date' | Validation: if target_type != 'by_date', target_date must be null |
| CAT-6 | target_amount required when target_type is not null | Validation check |

### 4.6 Month Lock Rules (F10: Month Lock)

| ID | Rule | Enforcement |
|----|------|-------------|
| LCK-1 | Locked month prevents assignment creation/update for that month | Check in PUT /api/assignments |
| LCK-2 | Locked month prevents move-money for that month | Check in POST /api/assignments/move |
| LCK-3 | Locking does NOT prevent transaction creation/edit in that month | No lock check on transaction endpoints |
| LCK-4 | Lock/unlock is idempotent (lock already-locked = 409, unlock not-locked = 404) | Appropriate status codes |

### 4.7 Import Rules (F7: Import Rules)

| ID | Rule | Enforcement |
|----|------|-------------|
| IMP-1 | Token matching is case-insensitive substring match against transaction description/memo | Applied during POST /api/import/csv processing |
| IMP-2 | First matching rule wins (ordered by creation) | Rules applied in created_at ASC order |
| IMP-3 | Rule can set payee_id, category_id, or both | Both fields nullable independently |

### 4.8 Transfer Rules (F4: Transfers — derived from Transaction transfer semantics)

| ID | Rule | Enforcement |
|----|------|-------------|
| XFR-1 | Transfer = transaction where payee has type='account' | No separate transfer table; identified by payee.type |
| XFR-2 | Mirror transaction has: opposite amount, same date, same memo, linked_id pointing back | Enforced on creation |
| XFR-3 | Mirror account determined by payee.account_id | Lookup payee to find target account |
| XFR-4 | Cannot transfer to same account | Validate payee.account_id != transaction.account_id |
| XFR-5 | Transfer transactions have category_id = NULL | Enforced on creation (transfers are not categorized) |

### 4.9 Auth Rules (F7: Auth)

| ID | Rule | Enforcement |
|----|------|-------------|
| AUTH-1 | All API endpoints (except /auth/login, /auth/check) require valid session cookie | Middleware check |
| AUTH-2 | Session expires after configured duration | expires_at check on each request |
| AUTH-3 | Invalid/expired session returns 401 | Consistent error response |
| AUTH-4 | Single tenant — no user isolation needed | No user_id filtering on queries |

---
