# Windows Desktop Status (Phase 4A)

**Date:** 2026-07-16  
**Windows version:** 3.1.0  
**Windows schema:** 14  
**DataRoot:** `%LOCALAPPDATA%\KupaManager` — keep for local-only modules, logs, receipts, legacy archive

## Decision

**Canonical Account Workspace (Web APIs / Private Blob) is the single source of truth** for shared business modules.

The PowerShell Windows application (`Kupa_Manager_Windows_v1_5_LAUNCH_FIXED`) is the **primary full desktop management UI**. It keeps its original tabs, forms, design, and customization center. Connected modules read and write through the same cloud backend used by Web, Android, and iPhone.

The installable Web/PWA is **not** a replacement for the Windows UI. Mobile is a small-screen view of the same account data.

## Rules

1. Connected modules (customers, products, inventory stock, orders, deliveries, income, expenses) use the cloud repository from the **existing** Windows tabs — not a separate business database.
2. Do **not** Merge local `kupa-data.json` into the Canonical Account Workspace as an automatic sync.
3. Do **not** treat `kupa-data.json` as source of truth for connected modules.
4. Local-only modules (payments, receipt inbox, OCR, categories, local delivery calendar, reports, inventory locations/reservations, logs, backups) remain in Windows and are labeled **מקומי בלבד**.
5. Mobile UI visibility is controlled from Windows **ניהול והתאמת הממשק → מובייל** via `/api/preferences`.
6. Do **not** delete the Windows project or wipe DataRoot unless the user explicitly requests a destructive operation with backup.

## Recommended user path

1. Open the Windows app (version 3.1.0).
2. Sign in once (DPAPI session when available).
3. Work in the regular tabs — data appears on phone, browser, and other computers under the same account.
4. Use Web/mobile for on-the-go access to the same cloud data.

## Related

- Windows: `docs/WINDOWS-EXISTING-UI-CLOUD-INTEGRATION-MANUAL-CHECKLIST.md`
- Windows: `docs/WINDOWS-LOCAL-ONLY-MODULES-ROADMAP.md`
- Web: `docs/KUPA-MANAGER-WEB-FUTURE-ROADMAP.md`
