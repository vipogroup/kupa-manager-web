# Unified Web Desktop App — Manual Checklist

Production URL: https://kupa-manager-web.vercel.app  
Web Canonical Account Workspace = single source of truth · Windows 3.1.0 = primary desktop UI on that cloud

## Checklist

1. פתיחת האתר במחשב (Chrome או Edge).
2. התקנה כאפליקציה (כפתור או תפריט הדפדפן).
3. פתיחה מאייקון שולחן העבודה / Start.
4. Login עם החשבון העסקי.
5. ודא **20 מוצרים**.
6. ודא מלאי כולל **238**.
7. יצירת לקוח בדיקה במחשב (או חשבון בדיקה).
8. בדיקה בטלפון — אותו לקוח מופיע לאחר רענון / חזרה לאפליקציה.
9. יצירת הזמנה בטלפון.
10. בדיקה במחשב — ההזמנה מופיעה.
11. שינוי מלאי במחשב.
12. בדיקה בטלפון — המלאי מעודכן.
13. בדיקת Conflict (שינוי במכשיר אחר לפני שמירה) — 409, אין דריסה שקטה.
14. בדיקת offline — pending / הודעה ברורה, ללא Success שקרי.
15. Logout — אין נתונים עסקיים ממטמון SW.
16. פתיחה מחדש + Login — אותם נתונים.
17. בדיקת Android (הוסף למסך הבית).
18. בדיקת iPhone (Safari → הוסף למסך הבית).
19. בדיקת Chrome.
20. בדיקת Edge.

## Notes

- מידע עסקי משותף: להזין בלשוניות Windows הרגילות (מחוברות לענן) או ב-Web/מובייל — אותו Canonical Account Workspace. מודולים עם באנר «מקומי בלבד» נשארים מקומיים.
- אין Workspace Code.
- `deviceId` לאבוחון בלבד — לא בוחר מאגר.
