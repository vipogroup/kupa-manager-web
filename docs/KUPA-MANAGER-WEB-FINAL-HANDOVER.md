# מסמך מסירה סופי — Kupa Manager Web

## A. מצב נוכחי

- תאריך: 2026-07-15
- Production URL: https://kupa-manager-web.vercel.app
- GitHub URL: https://github.com/vipogroup/kupa-manager-web
- Branch: master
- Final Git SHA: (יושלם ב-commit הסופי; ראה גם `docs/kupa-manager-web-final-status.json`)
- Vercel Production SHA: חייב להיות זהה ל-GitHub HEAD אחרי Deploy
- Project ID: `prj_bMJOT38sqNQxMkA9yPBBMQrLn0OD`
- Org ID: `team_We2Gv8A8bZpVXbI1bXPAj6nC`
- Private Store ID: `store_laQ1JqCA9U5WVes8`
- אין Public Store בפרודקשן (הוסר בשלב 4B; גיבוי מקומי של Public נשמר)

## B. נתיבי עבודה

- Web path: `C:\Users\ALFA DPM\Downloads\ממשקים חדשים\kupa-manager-web`
- Windows canonical path: `C:\Users\ALFA DPM\Downloads\ממשקים חדשים\ממשק ניהול הוצאות הכנסות 2\Kupa_Manager_Windows_v1_5_LAUNCH_FIXED`
- Web source backup root: `C:\Users\ALFA DPM\Downloads\ממשקים חדשים\Kupa_Manager_Web_Source_Backups`
- Windows source backup: `C:\Users\ALFA DPM\Downloads\ממשקים חדשים\Kupa_Manager_Windows_Source_Backups\KupaManager-Windows-Source-2.8.0-Schema14-20260715-133103`
- Cloud backups: `C:\Users\ALFA DPM\Downloads\ממשקים חדשים\Kupa_Manager_Web_Cloud_Backups`
  - Public archive: `PublicBlob-Backup-20260715-151906`
  - Private final: `PrivateBlob-Final-Backup-*` (נוצר בשלב מסירה)

DataRoot של Windows (`%LOCALAPPDATA%\KupaManager`) — אסור לגעת בלי הוראה מפורשת.

## C. מה עובד ב-Web

- התחברות (Session Cookie)
- הכנסות / הוצאות (יצירה, עריכה, מחיקה, סנכרון)
- לקוחות
- מוצרים
- הזמנות (טיוטה / אישור / ביטול / העתקה)
- מלאי בסיסי (תנועות ידניות; הזמנות לא משנות מלאי)
- משלוחים לפי אזור (ממרכז הזמנה מאושרת)
- מדבקות A4 (18 לעמוד, Preview + הדפסה/PDF)
- סנכרון ידני בין מכשירים (Save / Load / Refresh)

מסכים בפועל: בית, הכנסות, הוצאות, לקוחות, מוצרים, הזמנות, מלאי, משלוחים, סנכרון, התחברות.

## D. התנהגות הסנכרון

- שמור לענן — כותב ל-Private Blob עם הגדלת revision
- טען מהענן — קורא את העותק העדכני
- Refresh — טוען מחדש מהענן
- אין Real-time
- Conflict 409 — כאשר baseRevision אינו תואם לענן
- Revision — מונה מונוטוני בענן
- Cloud backups — גיבויי revision ב-Private Blob (retention)
- Offline — עריכה מקומית ב-browser storage עד Save

## E. מודל נתונים (תמצית)

- Customers, Products, Orders, Inventory Movements, Deliveries
- Counters למספור (לקוח/מוצר/הזמנה/תנועה/משלוח)
- Snapshot envelope בסנכרון (data + revision + metadata)
- Snapshots במשלוחים/הזמנות (לקוח, כתובת, פריטים, סכום)

## F. אבטחה

- Login + Session (HttpOnly, Secure בפרודקשן, SameSite=Strict)
- Private Blob בלבד
- נתיב Workspace מבוסס HMAC (לא קוד גולמי בנתיב)
- CSRF / Origin validation לפעולות mutating
- Rate limits
- Payload limit + JSON validation
- Security headers
- שמות משתני סביבה (ללא ערכים):  
  `KUPA_ADMIN_USERNAME`, `KUPA_ADMIN_PASSWORD_HASH`, `KUPA_SESSION_SECRET`,  
  `KUPA_WORKSPACE_NAMESPACE_SECRET`, `KUPA_PRIVATE_READ_WRITE_TOKEN`

## G. מה לא קיים

- Real-time sync
- סנכרון אוטומטי Windows ↔ Web
- משתמשים והרשאות מרובים
- הפחתת מלאי אוטומטית
- נהגים / מסלולים / GPS
- AI / OCR
- אפליקציית מובייל native

## H. מגבלות ידועות

- שתי התראות npm audit moderate (next/postcss) — מתועדות; אין `npm audit fix --force`
- בדיקות הדפסה פיזיות / iPhone / Android — ידניות (ראה Checklist)
- סנכרון דורש Save / Refresh ידני
- Warning lint היסטורי תוקן במסירה אם הופיע; יש להריץ lint לפני שינוי

## I. הוראות המשך

1. פתח את תיקיית Web למעלה
2. `npm ci`
3. `npm run dev` לפיתוח מקומי (דורש env מקומי לא-tracked)
4. `npm test` / `npm run lint` / `npm run build`
5. Git: עבודה על feature branch → PR → merge ל-master
6. Deployment: דחיפה ל-GitHub בלבד (אין Vercel CLI production deploy)
7. אימות SHA: GitHub HEAD = origin/master = Vercel Production commit SHA
8. לפני שינוי גדול: גיבוי מקור + גיבוי Private Blob

## J. סדר שדרוגים עתידי מומלץ

1. Role-based users  
2. Better audit logs  
3. Real-time synchronization  
4. Automatic stock issue  
5. Delivery statuses  
6. Proof of delivery  
7. Reports  
8. Windows/Web migration or shared backend  

## K. כללי בטיחות להמשך

- אין Secrets ב-Git
- בדיקות רק ב-Test Workspace
- גיבוי לפני Migration
- Regression לפני Deploy
- SHA match חובה
- אין שינוי ב-Windows בלי הוראה מפורשת
