# Account Workspace — Multi-Device Manual Checklist

Production: https://kupa-manager-web.vercel.app

Use the **business login** for read-only verification of inventory counts. Prefer a **test account** for any write checks when available.

## Expected cloud baseline (read-only)

- products = 20
- stock total = 238
- customer «סטוק 1» = אחת
- historical order = אחת
- Import ID present (`VIPO-STOCK-SALES-…`)

## Checklist

1. **Login במחשב** (Chrome/Edge) — ודא התחברות תקינה.
2. **לאחר טעינה** — ודא 20 מוצרים ו-238 מלאי (לא מסך ריק לפני הטעינה).
3. **Login בטלפון אחר** — ללא הזנת קוד סביבת עבודה; ודא אותם נתונים.
4. **Login בגלישה בסתר** — אותם 20 מוצרים / 238 מלאי.
5. **נקה localStorage / Site Data** בדפדפן המחשב.
6. **התחבר מחדש** — אותם נתונים (אין סביבת עבודה ריקה חדשה).
7. **מסך סנכרון** — מוצג «הנתונים מסונכרנים לחשבון המחובר»; אין שדה קוד סביבת עבודה.
8. **מכשיר A** — שנה רשומה עסקית קטנה (עדיף בסביבת בדיקה).
9. **ודא Auto Save** — סטטוס «שומר…» ואז «נשמר בענן» / revision עולה.
10. **מכשיר B** — חזור לאפליקציה (focus); ודא עדכון אוטומטי אם אין שינויים מקומיים.
11. **Conflict** — ערוך במקביל בשני מכשירים; שמירה שנייה אמורה לקבל 409 ולהציג הודעה בעברית בלי דריסה שקטה.
12. **Offline** — נתק רשת, שנה רשומה; הצגת «ממתין לסנכרון»; אין Success שקרי; חבר רשת וודא retry.
13. **Logout / Login** — טעינה מחדש מהענן לחשבון.
14. **אין מסך ריק שגוי** — בזמן טעינה מוצג «טוען נתונים מהענן…».

## Pass criteria

- [ ] אותו חשבון = אותו מאגר בכל המכשירים
- [ ] אין תלות בקוד Workspace בדפדפן
- [ ] Auto Load / Auto Save / Conflict 409 תקינים
- [ ] נתוני העסק לא נמחקו / לא שונו שלא לצורך בבדיקות
