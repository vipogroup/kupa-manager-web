# Kupa Manager Web — Future Development Roadmap

## Architectural decision (binding)

**Kupa Manager Web is the single source of truth** for business data.

- Canonical storage: authenticated **Account Workspace** on **Vercel Private Blob**
- Same account → same IDs, counters, revision, customers/products/orders/inventory/deliveries
- `localStorage` / Service Worker may cache **non-sensitive shell assets** only
- Workspace Code is **not** required for operators
- `deviceId` is audit / conflict metadata only — it does **not** select the workspace
- PowerShell Windows **3.1.0** is the primary desktop UI on the Canonical Account Workspace (see `docs/WINDOWS-LEGACY-STATUS.md`) — no automatic Migration/Merge of DataRoot

## Current project state

**Project:** kupa-manager-web  
**Production URL:** https://kupa-manager-web.vercel.app  
**GitHub:** https://github.com/vipogroup/kupa-manager-web  
**Branch:** master  
**Installable Web App:** Manifest + static Service Worker + desktop/mobile layouts

### Current completed modules

- Authentication
- Income
- Expenses
- Customers
- Products
- Orders
- Basic inventory
- Deliveries by area
- A4 delivery labels
- Manual cloud save/load/refresh
- Conflict protection (revision / 409)
- Private Blob storage
- Account-bound sync (desktop + mobile + PWA)
- Installable Web App (PWA) guidance

### Important clarification

**Enter shared business data via Windows regular tabs or Web/mobile** — all use the same Canonical Account Workspace.  
Local-only Windows modules (payments, receipt inbox, etc.) remain local until a future cloud port.

Related: `docs/WINDOWS-LEGACY-STATUS.md`, `docs/KUPA-MANAGER-WEB-FINAL-HANDOVER.md`

---

## Mandatory future development rules

- Every feature must use a **Test Workspace** only.
- No write tests against real business data.
- Every phase must pass **full regression** before merge/deploy.
- Every production deploy must come from **GitHub** only.
- GitHub HEAD must equal `origin/master` must equal Vercel Production SHA.
- No Vercel CLI Production Deploy.
- No secrets in Git.
- No Blob URL exposure to the client.
- No Public Blob Store.
- No migration without a verified backup first.
- No Windows project/DataRoot changes without explicit user instruction.
- No Windows/Web connection without a written Migration plan.
- No automatic stock reduction without a dedicated dedicated phase.
- No Real-time Sync without an advanced Conflict strategy.
- No hard-delete of business records except for rare, documented exceptions.
- Every significant business action must write an **Audit Log** entry (once Audit exists).

---

## Future phases (priority order)

All statuses below: **NOT STARTED**

---

### Phase 1 — Multi-user roles and permissions

**Status:** NOT STARTED  
**Dependencies:** None (first recommended next phase)

**Goal:** Replace single admin login with role-based access for multiple people.

**Build:**
- Roles: Admin, Staff, Read-only
- Session per user
- Identity recorded on session and (later) audit
- Permission checks on UI and API routes

**Do not do in this phase:**
- Real-time sync
- Windows/Web bridge
- Automatic inventory issue
- Multi-business billing

**Risks:**
- Privilege escalation if API does not enforce the same rules as UI
- Breaking existing single-admin sessions

**Required tests:**
- Login/logout per role
- Staff cannot perform Admin-only actions
- Read-only cannot mutate sync/data
- Regression for auth, sync, customers/orders/deliveries

---

### Phase 2 — Full Audit Log foundation

**Status:** NOT STARTED  
**Dependencies:** Phase 1 strongly recommended (user identity)

**Goal:** Append-only trail of who did what, when, and how records changed.

**Build:**
- Who created / edited / cancelled
- Timestamp
- Before / after snapshots (or field-level diffs)
- Immutable store (no delete / no overwrite of audit rows)
- Basic UI or export for review

**Do not do in this phase:**
- OCR / AI
- Hard-delete of business entities “because audit exists”
- Real-time sync

**Risks:**
- PII in audit payloads — must stay Private Blob / secured; never log secrets
- Storage growth

**Required tests:**
- Create/edit/cancel write audit rows
- Audit row cannot be deleted via API
- No secrets in audit content
- Regression of existing modules

---

### Phase 3 — Real-time synchronization

**Status:** NOT STARTED  
**Dependencies:** Phases 1–2 recommended; **advanced conflict design must exist first**

**Goal:** Keep multiple devices closer to live without waiting for manual Save/Refresh.

**Build:**
- Transport choice: WebSocket / SSE / managed realtime
- Reconnect strategy
- Optimistic updates with rollback
- Multi-device consistency guarantees
- Conflict strategy beyond simple 409 (merge / last-write-wins with confirmation / CRDT / field locks — decide before coding)

**Do not do in this phase:**
- Windows automatic sync
- Skipping conflict design
- Auto stock reductions

**Risks:**
- Silent overwrite of another device’s work
- Offline/online race conditions
- Higher server cost / rate limits

**Required tests:**
- Two-device simultaneous edit conflict
- Reconnect after network drop
- No silent overwrite of higher revision
- Full sync regression + security regression

---

### Phase 4 — Windows ↔ Web connection / shared backend

**Status:** NOT STARTED  
**Dependencies:** Clear Migration plan; source + cloud backups; prefer Phases 1–2

**Goal:** Controlled interoperability or shared backend between Windows and Web.

**Build:**
- Shared backend or sync contract
- Schema mapping Windows → Web
- Conflict handling across platforms
- Offline behavior definition
- Migration plan with dry-run and rollback

**Do not do in this phase:**
- Direct Windows changes without explicit instruction and full backup
- One-way overwrite of production data without verify
- Mixing Test Workspace with real DataRoot

**Risks:**
- Data corruption / duplicate counters
- Field semantic mismatches (areas, payments, stock)
- Irreversible migration mistakes

**Required tests:**
- Mapping round-trip on sample/Test data only
- Conflict cases Windows vs Web
- Backup + restore verification before any real cutover
- Confirm Windows/DataRoot untouched unless user approved a change plan

---

### Phase 5 — Advanced inventory

**Status:** NOT STARTED  
**Dependencies:** Basic inventory (done); Audit recommended

**Goal:** Warehouses, locations, transfers, reservations, purchase flow.

**Build:**
- Warehouses and locations
- Transfers between locations
- Reservations
- Stock Issue / Reversal
- Stock take (count)
- Suppliers and purchase orders

**Do not do in this phase:**
- Automatic stock decrease on order create
- GPS / routes

**Risks:**
- Negative stock races
- Broken atomicity between product qty and movements

**Required tests:**
- Transfer / reserve / issue / reverse atomicity
- Concurrent two-device stock updates
- Orders still do not silently mutate stock unless explicitly designed later
- Inventory history immutability where required

---

### Phase 6 — Automatic stock reduction

**Status:** NOT STARTED  
**Dependencies:** Phase 5 (or at least reservations + explicit business event)

**Goal:** Reduce stock only at a defined business event (e.g. Dispatch), atomically.

**Build:**
- Trigger only at Dispatch (or clearly approved event — not on draft/create alone)
- Atomic operation
- Reservation consumption
- Rollback on failure
- Audit of stock changes

**Do not do in this phase:**
- Auto-deduct on mere order creation
- Deduct without reservation strategy if multi-user concurrent
- Silent stock changes from label print / preview

**Risks:**
- Double issue
- Partial failure leaving inconsistent stock

**Required tests:**
- Confirm order alone does not reduce stock
- Dispatch reduces once only
- Failed dispatch rolls back
- Conflict under two devices

---

### Phase 7 — Advanced payments

**Status:** NOT STARTED  
**Dependencies:** Orders/deliveries (done); Audit recommended

**Goal:** Partial payments, balances, refunds path preparation, extra methods.

**Build:**
- Partial payment
- Multiple payments toward one order/delivery
- Remaining balance
- Cancel payment / refund hooks
- Additional payment methods
- Audit every payment event

**Do not do in this phase:**
- Hard-delete payment history
- Fake “paid” without ledger

**Risks:**
- Balance drift vs order totals
- Currency/decimal precision

**Required tests:**
- Partial + full settlement math
- Cancel/refund leaves auditable trail
- Cash-on-delivery path still works
- Sync conflict with payment edits

---

### Phase 8 — Advanced delivery statuses

**Status:** NOT STARTED  
**Dependencies:** Deliveries by area (done)

**Goal:** Richer lifecycle beyond current basic pending/cancel style.

**Build statuses (at least):**
- ready
- outForDelivery
- delivered
- failed
- noAnswer
- refused
- postponed
- returned

**Do not do in this phase:**
- Drivers/routes/GPS
- Auto stock issue unless Phase 6 already done and wired intentionally

**Risks:**
- Illegal status transitions
- Snapshot mutation when status changes

**Required tests:**
- Allowed vs blocked transitions
- Filters/search by new statuses
- No unintended stock/payment side effects
- Label print still non-mutating

---

### Phase 9 — Drivers, vehicles, and routes

**Status:** NOT STARTED  
**Dependencies:** Phase 8 recommended

**Goal:** Assign people/vehicles and plan stops without live GPS yet.

**Build:**
- Drivers
- Vehicles
- Routes
- Stops
- Driver/vehicle conflict checks
- Capacity rules

**Do not do in this phase:**
- GPS tracking
- Native mobile driver app (see Phase 19)

**Risks:**
- Double-booking drivers/vehicles
- Orphan stops after cancel

**Required tests:**
- Conflict detection
- Capacity overflow blocked
- Cancel delivery unassigns safely
- Regression deliveries/labels

---

### Phase 10 — Proof of Delivery (POD)

**Status:** NOT STARTED  
**Dependencies:** Phase 8; private storage; permissions (Phase 1)

**Goal:** Capture delivery evidence securely.

**Build:**
- Recipient name
- Signature
- Time
- Note
- Photo
- Permissions + backup of POD assets (Private only)

**Do not do in this phase:**
- Public Blob for photos
- Client-visible Blob URLs that bypass auth

**Risks:**
- Large binary storage cost
- PII leakage via URLs

**Required tests:**
- Auth required to read/write POD
- No Blob URL leakage in API responses where forbidden
- Status delivered requires/records POD rules as designed
- Backup/restore of POD metadata

---

### Phase 11 — Delivery notes / shipping documents

**Status:** NOT STARTED  
**Dependencies:** Deliveries snapshots (done); printing patterns from labels

**Goal:** Formal delivery documents with numbering and PDF.

**Build:**
- With price / without price variants
- PDF generation
- Document number
- Snapshot freeze
- Preview
- Batch print

**Do not do in this phase:**
- Mutating order/stock from print
- Business data in URL query strings

**Risks:**
- Snapshot drift vs live order
- Layout regressions vs A4 labels

**Required tests:**
- Preview does not change revision/dirty incorrectly
- Number uniqueness
- Batch page breaks
- Regression label print + sessions

---

### Phase 12 — Advanced labels

**Status:** NOT STARTED  
**Dependencies:** A4 labels (done)

**Goal:** More sizes/formats and print operations history.

**Build:**
- A6
- 10×15
- QR
- Barcode
- Package 1 of X
- Print history
- Printer profiles

**Do not do in this phase:**
- OCR/AI on labels
- Cloud selection sync (selection stays local unless redesigned)

**Risks:**
- Breaking existing 3×6 A4 layout
- Silent product truncation (already forbidden — keep continuation rules)

**Required tests:**
- All existing A4 closeout cases still pass
- New sizes page math
- Continuation / clean text rules retained
- Session protection on preview

---

### Phase 13 — Returns and exchanges

**Status:** NOT STARTED  
**Dependencies:** Orders/deliveries; inventory; Audit

**Goal:** Structured return/exchange flow linked to originals.

**Build:**
- Return
- Exchange
- Product condition
- Return to stock rules
- Link to order/delivery
- Full audit

**Do not do in this phase:**
- Silent stock increase without movement
- Hard-delete original order

**Risks:**
- Double stock return
- Broken financial link to payments

**Required tests:**
- Return updates stock via movements only
- Link integrity
- Concurrent conflict
- Audit immutability

---

### Phase 14 — Refunds and credit notes

**Status:** NOT STARTED  
**Dependencies:** Phase 7 payments recommended; Audit

**Goal:** Financial reverse documents without destroying history.

**Build:**
- Refund
- Credit note
- Link to original payment
- No hard delete
- Audit

**Do not do in this phase:**
- Editing paid history in place without trail
- Deleting incomes/expenses to “fix” totals

**Risks:**
- Ledger imbalance
- Tax/reporting confusion if docs are edited after issue

**Required tests:**
- Refund cannot exceed payable rules
- Original payment remains readable
- Totals and reports consistency (when reports exist)
- Sync/revision safety

---

### Phase 15 — Business reports

**Status:** NOT STARTED  
**Dependencies:** Stable data model; payments/inventory richness as needed

**Goal:** Period and entity reporting for business decisions.

**Build reports for:**
- Sales by period
- Customer
- Product
- Inventory
- Inventory movements
- Deliveries
- Collections
- Balances
- Returns

**Do not do in this phase:**
- Writing reports that mutate source data
- Exporting secrets/PII to public channels

**Risks:**
- Wrong aggregates from snapshot vs live fields
- Performance on large workspaces

**Required tests:**
- Known fixture totals
- Empty/filter edge cases
- Permission gating (if multi-user exists)
- No data mutation from report APIs

---

### Phase 16 — Advanced dashboard

**Status:** NOT STARTED  
**Dependencies:** Phase 15 recommended

**Goal:** Operational home with KPIs.

**Build widgets:**
- Sales
- Collections
- Inventory
- Deliveries
- Shortages
- Returns
- User performance (needs multi-user)

**Do not do in this phase:**
- Packing the first viewport with unrelated marketing chrome
- Calling external AI by default

**Risks:**
- Stale caches vs revision
- Overloading mobile layout

**Required tests:**
- Numbers match report engines
- Mobile overflow/safe-area
- Auth on dashboard APIs

---

### Phase 17 — Receipt Inbox / OCR

**Status:** NOT STARTED  
**Dependencies:** Secure storage; human review UX; prefer Audit

**Goal:** Assist expense/document capture without auto-posting.

**Build:**
- Local OCR first
- Mandatory human Review before Save
- No automatic write to ledger
- Cloud OCR only as Opt-in later

**Do not do in this phase:**
- Auto-create expenses from OCR without review
- Uploading all documents to third parties by default

**Risks:**
- Wrong amounts entered if review skipped
- PII sent to cloud OCR unexpectedly

**Required tests:**
- Review gate blocks save
- Opt-in cloud path off by default
- No secrets in OCR logs
- Regression expenses/income flows

---

### Phase 18 — Future AI features

**Status:** NOT STARTED  
**Dependencies:** Secure API key handling; Opt-in; Audit; Review UX

**Goal:** Optional AI assistance without silent data exfiltration.

**Build:**
- Secured API key (server-only env)
- Explicit Opt-in
- Human Review of suggestions
- Audit of AI-assisted actions
- No automatic document upload

**Do not do in this phase:**
- Shipping API keys to the browser
- Auto-apply AI changes to production entities

**Risks:**
- Leakage of customer/business content to vendors
- Cost runaway

**Required tests:**
- Key never appears in client/Git
- Opt-in defaults false
- Reject unreviewed apply
- Audit written for accepted suggestions

---

### Phase 19 — Native mobile app

**Status:** NOT STARTED  
**Dependencies:** Stable API/auth/sync contract; prefer multi-user + conflict strategy

**Goal:** Android/iPhone apps with offline and secure storage.

**Build:**
- Android
- iPhone
- Offline mode
- Sync with cloud
- Push notifications
- Secure local storage

**Do not do in this phase:**
- Treating native as replace-Windows overnight without migration plan
- Storing session secrets insecurely

**Risks:**
- Divergent logic from Web
- Offline conflicts

**Required tests:**
- Offline create then sync
- Token storage security checks
- Parity smoke vs Web for core modules
- Push permission/opt-in behavior

---

### Phase 20 — Notifications

**Status:** NOT STARTED  
**Dependencies:** Reliable events from inventory/orders/deliveries/payments; multi-user helpful

**Goal:** Alert on operational exceptions.

**Build alerts for:**
- Low stock
- Delivery today
- Untouched order
- Sync conflict
- Payment overdue

**Do not do in this phase:**
- Spam without preferences
- Pushing business PII into insecure channels

**Risks:**
- Notification noise causing ignored alerts
- Duplicate notifications after reconnect

**Required tests:**
- Threshold triggers once
- Preference off suppresses
- Conflict alert fires on 409/advanced conflict
- Auth on notification APIs

---

### Phase 21 — Multi-business / multi-account

**Status:** NOT STARTED  
**Dependencies:** Multi-user; strong workspace isolation; billing design

**Goal:** Multiple businesses with hard data separation.

**Build:**
- Multiple businesses/accounts
- Hard data isolation
- Per-business permissions
- Future billing hooks

**Do not do in this phase:**
- Shared mutable counters across businesses
- Accidental cross-tenant list/get

**Risks:**
- Tenant leak (critical security)
- HMAC/path mistakes

**Required tests:**
- Cross-tenant access attempts return deny
- Sync path isolation
- Backup/restore per tenant
- Security + regression suites

---

### Phase 22 — Advanced backups and restore

**Status:** NOT STARTED  
**Dependencies:** Private Blob; admin roles

**Goal:** Operable backup policy beyond current save-time revisions.

**Build:**
- Scheduled backups
- Retention policy UI/config
- Restore UI
- Disaster recovery runbooks
- Backup verification (manifest/SHA)

**Do not do in this phase:**
- Committing backups to Git
- Restore onto production without confirmation and Test dry-run

**Risks:**
- Restoring wrong revision over live data
- Incomplete backups missing POD binaries (if added later)

**Required tests:**
- Schedule creates verifiable archive
- Restore dry-run missing/extra/sha = 0
- Retention does not delete below policy unexpectedly
- Access limited to Admin

---

## Windows-only modules — port plan (do not build now)

Each module below is **NOT STARTED** on Web. Port only after an explicit phase approval.  
No automatic Migration from Windows DataRoot.

### W1 — Order Payments (advanced)

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Orders; Multi-user / Audit recommended |
| Data model | Payment allocations, balance, void rules linked to order IDs |
| Migration | Optional import from Windows `orderPayments` — separate approved plan |
| Tests | Allocation math, void rollback, conflict 409, no silent overwrite |
| Rollback | Disable Web payments UI; keep Blob revision backups |

### W2 — Receipt Inbox + OCR + receipt files

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Private Blob binary policy; Income/Expense link |
| Data model | Receipt drafts, file refs (private), OCR fields, provider gates |
| Migration | Copy files only with verified inventory — never Public Blob |
| Tests | Upload limits, private access, OCR failure paths, logout clears UI cache |
| Rollback | Feature flag off; keep existing money records |

### W3 — Product categories

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Products |
| Data model | Category catalog + product.categoryId; deactivate/in-use rules |
| Migration | Map Windows `productCategories` → Web categories |
| Tests | Uniqueness, in-use delete blocked, product filter |
| Rollback | Hide category UI; products keep unknown fields |

### W4 — Delivery calendar (local Windows calendar UX)

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Deliveries (Web already has deliveries by area) |
| Data model | Calendar views over existing delivery entities — no second store |
| Migration | None if IDs already in cloud; UX only |
| Tests | Day navigation, area filters, no inventory side-effects |
| Rollback | Keep list/label UI |

### W5 — Reports + CSV tools

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Stable entities; optional Audit |
| Data model | Read-only aggregations; export jobs ephemeral |
| Migration | N/A |
| Tests | Totals match store; CSV columns; no PII in logs |
| Rollback | Remove export routes |

### W6 — Inventory locations + reservations

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Inventory movements; conflict design |
| Data model | Locations, reservations, available qty guards |
| Migration | Optional from Windows inventory locations — approved plan only |
| Tests | Negative stock blocked; reservation atomicity; 409 |
| Rollback | Feature flag; keep simple stockQuantity |

### W7 — Advanced UI customization (Windows Global Customization Center parity)

| Field | Value |
|--------|--------|
| Status | NOT STARTED |
| Dependencies | Existing Mobile customization center |
| Data model | Prefs already account-bound via `/api/preferences` |
| Migration | Optional prefs merge — never business entities |
| Tests | Required locked elements; no hide of conflict/auth |
| Rollback | Reset prefs to defaults |

---

## Suggested sequencing summary

1. Multi-user roles  
2. Audit log  
3. Real-time sync (only after conflict design)  
4. Reports / CSV (W5)  
5. Product categories (W3)  
6. Advanced inventory locations/reservations (W6)  
7. Payments (W1)  
8. Receipt Inbox / OCR (W2)  
9. Delivery calendar UX (W4)  
10. Advanced customization parity (W7)  
11. Delivery statuses / drivers / POD (existing later phases)  
12. Native wrappers only if PWA is insufficient  
13. Multi-business  
14. Advanced backup/restore  

---

## CURRENT STOP POINT

Unified installable Web app is the primary business UI.  
Windows 3.1.0 is the primary desktop UI on Canonical Account Workspace (SSoT).

## NEXT RECOMMENDED PHASE

**MULTI-USER ROLES AND AUDIT LOG FOUNDATION**  
(Phases 1–2)

**אין להתחיל שלב זה ללא אישור מפורש מהמשתמש.**  
**אין להתחיל העברת מודולי Windows (W1–W7) ללא אישור מפורש.**
