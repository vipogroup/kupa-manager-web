# Windows Legacy Status

**Date:** 2026-07-16  
**Windows version preserved:** 3.0.1  
**Windows schema:** 14  
**DataRoot:** `%LOCALAPPDATA%\KupaManager` — **do not modify**

## Decision

**Kupa Manager Web is the single source of truth** for business data.

The PowerShell Windows application (`Kupa_Manager_Windows_v1_5_LAUNCH_FIXED`) is retained as:

- **Legacy** local tooling
- **Backup / recovery** reference for historical local data
- Optional **diagnostic** cloud tab (read / controlled write APIs)

It is **not** the recommended primary business UI.

## Rules

1. Do **not** enter new business data in local Windows modules (customers, products, orders, inventory, deliveries, income, expenses) as the operating system of record.
2. Do **not** run automatic Migration from Windows DataRoot into Web.
3. Do **not** Merge local `kupa-data.json` with the Canonical Account Workspace.
4. Canonical storage remains: **Authenticated Account Workspace → Vercel Private Blob** via Web APIs.
5. The cloud tab in Windows may remain for diagnostics; prefer the installable Web app on desktop and mobile.
6. Do **not** delete the Windows project or wipe DataRoot unless the user explicitly requests a destructive operation with backup.

## Recommended user path

1. Open https://kupa-manager-web.vercel.app (or the installed PWA).
2. Sign in with the business account.
3. Work normally — data appears on phone, computer, and browser.
4. Keep Windows 3.0.1 installed only as legacy / backup.

## Related

- `docs/UNIFIED-WEB-DESKTOP-APP-MANUAL-CHECKLIST.md`
- `docs/KUPA-MANAGER-WEB-FUTURE-ROADMAP.md` (Windows-only modules to port later)
