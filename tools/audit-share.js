/* בדיקת מסירת קובץ היומן — «הוספה ליומן».
 *
 *   python3 -m http.server 8000 &
 *   node tools/audit-share.js
 *   node tools/audit-share.js http://localhost:8000
 *
 * דורש playwright-core ודפדפן Chromium מקומי (ראו PW_CHROME).
 *
 * למה הבדיקה הזאת קיימת: מסירת הקובץ היא הנקודה שאי אפשר לאמת כאן מקצה
 * לקצה, שכן ההתנהגות הסופית היא של מערכת ההפעלה. הגרסה הראשונה ניסתה
 * navigator.share ונפלה להורדה — ותרחיש הכשל היה שקט לחלוטין. אחר כך הוצגו
 * שתי הדרכים יחד, וכך התברר במכשיר אמיתי שהשיתוף פשוט נכשל (אנדרואיד:
 * הקריאה נדחתה, וההודעה הפנתה להורדה). לכן נשארה ההורדה בלבד.
 *
 * מה שנבדק כאן: שההורדה היא הפעולה היחידה, שהיא קישור אמיתי שהמשתמש לוחץ
 * עליו — ולא a.click() מתוכנת, שעלול להיחסם בלי כל סימן — ושהקובץ שיורד
 * הוא ICS תקין. כן נבדק שאין יותר קריאה ל-navigator.share גם כשהדפדפן
 * מציע אותה, כדי שהמסלול שנכשל לא יחזור בהיסח הדעת.
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

/** shareable: האם הדפדפן מציע Web Share עם קבצים */
async function openExport(browser, shareable) {
  var ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, acceptDownloads: true
  });
  var page = await ctx.newPage();
  await page.addInitScript(function (canShare) {
    window.__shared = 0;
    if (!canShare) {
      try { delete navigator.canShare; delete navigator.share; } catch (e) { }
      return;
    }
    Object.defineProperty(navigator, 'canShare', {
      value: function () { return true; }, configurable: true
    });
    Object.defineProperty(navigator, 'share', {
      value: function () { window.__shared++; return Promise.resolve(); }, configurable: true
    });
  }, shareable);

  /* הודעות נאספות בצד Node: קריאה אל תוך הדף בזמן שדיאלוג מודאלי פתוח
     תוקעת את שניהם. */
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

  for (var i = 0; i < 2; i++) {
    var shareable = (i === 1);
    var where = shareable ? 'עם Web Share' : 'בלי Web Share';

    var page = await openExport(browser, shareable);
    var a = await actions(page);

    // ההורדה היא הפעולה היחידה — גם כשהדפדפן מציע שיתוף
    ok(a.length === 1, where + ': ' + a.length + ' פעולות במקום אחת — ' + a);
    ok(/^a\.btn-main:הורדת הקובץ$/.test(a[0] || ''), where + ': הפעולה אינה קישור הורדה ראשי: ' + a[0]);
    ok(await page.getAttribute('#sheet-body .btn-row a', 'download') === 'omer.ics',
      where + ': חסר download="omer.ics"');

    var pair = await Promise.all([
      page.waitForEvent('download'), page.click('#sheet-body .btn-row a')
    ]);
    ok(pair[0].suggestedFilename() === 'omer.ics',
      where + ': שם הקובץ שירד: ' + pair[0].suggestedFilename());

    var tmp = require('os').tmpdir() + '/audit-share-' + i + '.ics';
    await pair[0].saveAs(tmp);
    var text = require('fs').readFileSync(tmp, 'utf8');
    ok(/^BEGIN:VCALENDAR\r\n/.test(text), where + ': הקובץ אינו נפתח ב־VCALENDAR');
    ok(/END:VCALENDAR\r\n$/.test(text), where + ': הקובץ אינו נסגר ב־VCALENDAR');
    ok(/^X-WR-CALNAME:ספירת העומר$/m.test(text), where + ': שם הלוח שבקובץ אינו «ספירת העומר»');
    ok((text.match(/BEGIN:VEVENT/g) || []).length > 30, where + ': מעט מדי אירועים');
    require('fs').unlinkSync(tmp);

    // המסלול שנכשל במכשיר אמיתי לא יחזור בהיסח הדעת
    ok(await page.evaluate(function () { return window.__shared; }) === 0,
      where + ': נקראה navigator.share');
    ok(page.alerts.length === 0, where + ': הוצגה הודעה: ' + JSON.stringify(page.alerts));

    await page.context().close();
  }

  await browser.close();
  console.log('מסירת הקובץ: ' + checks + ' בדיקות, ' + fails + ' כשלו');
  process.exit(fails ? 1 : 0);
})();
