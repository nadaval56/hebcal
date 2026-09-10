/* בדיקת מסירת קובץ היומן — שני מסלולי «הוספה ליומן».
 *
 *   python3 -m http.server 8000 &
 *   node tools/audit-share.js
 *   node tools/audit-share.js http://localhost:8000
 *
 * דורש playwright-core ודפדפן Chromium מקומי (ראו PW_CHROME).
 *
 * למה הבדיקה הזאת קיימת: מסירת הקובץ היא הנקודה היחידה בתכונה שאי אפשר
 * לאמת כאן מקצה לקצה, שכן ההתנהגות הסופית היא של מערכת ההפעלה — ובאייפון,
 * ביישום המותקן על מסך הבית, ידוע שהורדה רגילה אינה אמינה. הגרסה הראשונה
 * הייתה שרשרת נפילה: מנסים navigator.share, ואם אין — מורידים. תרחיש הכשל
 * שלה היה שקט לחלוטין: לוחצים, ולא קורה דבר.
 *
 * לכן שתי הדרכים מוצגות יחד ואין נפילה שקטה ביניהן, וההורדה היא קישור
 * אמיתי שהמשתמש לוחץ עליו בעצמו — ולא a.click() מתוכנת, שעלול להיחסם
 * בלי כל סימן. את חלון השיתוף של מערכת ההפעלה אי אפשר לבדוק כאן, אבל
 * אפשר לבדוק את הצד שלנו בחוזה: שהקריאה יוצאת עם קובץ אחד, בשם ובסוג
 * הנכונים, ושכל אחת מארבע התוצאות האפשריות מטופלת.
 */
'use strict';

var PW_CHROME = process.env.PW_CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var ROOT = process.argv[2] || 'http://localhost:8000';

var chromium;
try {
  chromium = require('playwright-core').chromium;
} catch (e) {
  console.error('חסר playwright-core. התקנה: npm i playwright-core');
  process.exit(2);
}

var fails = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.log('  ✗ ' + msg); }
}

/** mode: 'none' (אין Web Share), 'ok', 'abort', 'error' */
async function openExport(browser, mode) {
  var ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, acceptDownloads: true
  });
  var page = await ctx.newPage();
  await page.addInitScript(function (m) {
    window.__shared = [];
    if (m === 'none') {
      try { delete navigator.canShare; delete navigator.share; } catch (e) { }
      return;
    }
    Object.defineProperty(navigator, 'canShare', {
      value: function (d) { return !!(d && d.files && d.files.length); }, configurable: true
    });
    Object.defineProperty(navigator, 'share', {
      value: function (d) {
        window.__shared.push({
          n: d.files.length, name: d.files[0].name,
          type: d.files[0].type, size: d.files[0].size
        });
        if (m === 'ok') return Promise.resolve();
        var e = new Error('share'); e.name = (m === 'abort') ? 'AbortError' : 'NotAllowedError';
        return Promise.reject(e);
      }, configurable: true
    });
  }, mode);

  /* ההודעות נאספות בצד Node ולא בתוך הדף: קריאה אל תוך הדף בזמן שדיאלוג
     מודאלי פתוח תוקעת את שניהם. */
  page.alerts = [];
  page.on('dialog', function (d) { page.alerts.push(d.message()); d.dismiss(); });

  await page.goto(ROOT + '/index.html');
  await page.waitForTimeout(600);
  await page.click('[data-view="set"]');
  await page.waitForTimeout(300);
  await page.click('#set-reminders .setting:nth-child(1)');   // הדלקת התזכורות
  await page.waitForTimeout(400);
  await page.click('#set-reminders .setting:last-child');     // «הוספה ליומן»
  await page.waitForTimeout(500);
  return page;
}

function actions(page) {
  return page.$$eval('#sheet-body .btn-row > *', function (n) {
    return n.map(function (e) {
      return e.tagName.toLowerCase() + '.' + e.className + ':' + e.textContent.trim();
    });
  });
}

(async function () {
  var browser;
  try {
    browser = await chromium.launch({ executablePath: PW_CHROME });
  } catch (e) {
    console.error('לא נמצא Chromium ב־' + PW_CHROME + ' — אפשר לקבוע נתיב ב־PW_CHROME');
    process.exit(2);
  }

  // ללא Web Share (שולחן עבודה): הורדה בלבד, והיא הפעולה הראשית
  var page = await openExport(browser, 'none');
  var a = await actions(page);
  ok(a.length === 1, 'ללא שיתוף: ' + a.length + ' פעולות במקום אחת');
  ok(/^a\.btn-main:/.test(a[0] || ''), 'ההורדה אינה קישור ראשי: ' + a[0]);
  ok(await page.getAttribute('#sheet-body .btn-row a', 'download') === 'omer.ics',
    'חסר download="omer.ics"');
  var pair = await Promise.all([
    page.waitForEvent('download'), page.click('#sheet-body .btn-row a')
  ]);
  ok(pair[0].suggestedFilename() === 'omer.ics', 'שם הקובץ שירד: ' + pair[0].suggestedFilename());
  await page.context().close();

  // עם Web Share: שתי הפעולות יחד, והשיתוף ראשי
  page = await openExport(browser, 'ok');
  a = await actions(page);
  ok(a.length === 2, 'עם שיתוף: ' + a.length + ' פעולות במקום שתיים');
  ok(/^button\.btn-main:/.test(a[0] || ''), 'השיתוף אינו הפעולה הראשית: ' + a[0]);
  ok(/^a\.btn-alt:/.test(a[1] || ''), 'ההורדה אינה מוצגת לצדו: ' + a[1]);
  await page.click('#sheet-body .btn-row button');
  await page.waitForTimeout(400);
  var sent = await page.evaluate(function () { return window.__shared; });
  ok(sent.length === 1, 'נשלחו ' + sent.length + ' קריאות שיתוף במקום אחת');
  ok(sent[0] && sent[0].n === 1, 'נשלח יותר מקובץ אחד');
  ok(sent[0] && sent[0].name === 'omer.ics', 'שם הקובץ בשיתוף: ' + (sent[0] || {}).name);
  ok(sent[0] && /^text\/calendar/.test(sent[0].type), 'סוג הקובץ: ' + (sent[0] || {}).type);
  ok(sent[0] && sent[0].size > 5000, 'הקובץ ריק או קצר: ' + (sent[0] || {}).size);
  await page.context().close();

  // ביטול המשתמש: בשקט — בלי הודעה, ובלי הורדה מאחורי גבו
  page = await openExport(browser, 'abort');
  await page.click('#sheet-body .btn-row button');
  await page.waitForTimeout(400);
  ok(page.alerts.length === 0, 'ביטול הציג הודעה: ' + JSON.stringify(page.alerts));
  ok((await actions(page)).length === 2, 'החלון נסגר אחרי ביטול');
  await page.context().close();

  // כשל אמיתי: נאמר למשתמש, והחלון נשאר פתוח עם ההורדה
  page = await openExport(browser, 'error');
  await page.click('#sheet-body .btn-row button');
  await page.waitForTimeout(400);
  ok(page.alerts.length === 1, 'כשל בשיתוף לא הוצג למשתמש');
  ok(/להוריד את הקובץ/.test(page.alerts[0] || ''), 'ההודעה אינה מפנה להורדה');
  ok((await actions(page)).length === 2, 'ההורדה אינה זמינה אחרי הכשל');
  await page.context().close();

  await browser.close();
  console.log('מסירת הקובץ: ' + checks + ' בדיקות, ' + fails + ' כשלו');
  process.exit(fails ? 1 : 0);
})();
