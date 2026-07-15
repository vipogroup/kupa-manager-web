# Kupa Manager Web

ממשק Web (RTL) לניהול קופה, לקוחות, מוצרים, הזמנות, מלאי בסיסי, משלוחים ומדבקות A4 — לפריסה ב-Vercel.

זה אינו עותק מלא של מערכת Windows.

## הרצה מקומית

```bash
npm ci
npm run dev
```

בדיקות ובנייה:

```bash
npm test
npm run lint
npm run build
```

## Authentication

יש מסך `/login`. בפרודקשן נדרשים (שמות משתנים בלבד):

- `KUPA_ADMIN_USERNAME`
- `KUPA_ADMIN_PASSWORD_HASH`
- `KUPA_SESSION_SECRET`
- `KUPA_WORKSPACE_NAMESPACE_SECRET`
- `KUPA_PRIVATE_READ_WRITE_TOKEN`

אין Public Blob Store בפרודקשן.

## סנכרון בין מכשירים

במסך **סנכרון**: שמור לענן / טען מהענן / רענון. אין סנכרון בזמן אמת. שמירה עם revision ישן מחזירה 409.

## תיעוד מסירה

ראה `docs/KUPA-MANAGER-WEB-FINAL-HANDOVER.md`.
