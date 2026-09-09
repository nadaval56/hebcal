/* בדיקת הגדרות התצוגה — מה נראה בלוח, בכרטיס היום ובהדפסה.
 *
 *   python3 -m http.server 8000 &
 *   node tools/audit-settings.js                  # כל הצירופים
 *   node tools/audit-settings.js http://localhost:8000
 *
 * דורש playwright-core ודפדפן Chromium מקומי (ראו PW_CHROME).
 *
 * שלוש הגדרות נבדקות יחד, בכל שמונת הצירופים:
 *   evShow      — הצגת אירועים בלוח, בכרטיס היום ובהדפסה
 *   evEdit      — הרשאת הוספה, עריכה ומחיקה
 *   showParasha — הצגת פרשת השבוע בתאי הלוח ובהדפסה
 *
 * הבדיקה נכתבה אחרי שהתברר שהגדרת פרשת השבוע לא באה לידי ביטוי בהדפסה
 * כלל: המסך נבדק, ההדפסה לא — ולכן כאן שניהם נבדקים מאותה טבלת אמת.
 * בנוסף נבדק במפורש ששינוי הגדרה אינו נוגע באירועים השמורים.
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
if (ROOT.indexOf('file://') === 0) {
  console.error('יש להריץ מעל שרת HTTP ולא מ־file:// — ראו את ההסבר ב־README.');
  process.exit(2);
}

var EV_TEXT = 'בדיקת אירוע אישי';

/** ההגדרות הנבדקות, ואירוע על כל יום בטווח החודש המוצג */
function seed(cfg) {
  var s = JSON.parse(localStorage.getItem('luach.settings') || '{}');
  s.calMode = 'greg';
  s.evShow = cfg.show;
  s.evEdit = cfg.edit;
  s.showParasha = cfg.par;
  localStorage.setItem('luach.settings', JSON.stringify(s));
  var o = {}, d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
  d.setDate(d.getDate() - 20);
  for (var i = 0; i < 70; i++) {
    o[d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())] =
      [{ id: 'chk' + i, text: cfg.text, time: '19:30' }];
    d.setDate(d.getDate() + 1);
  }
  localStorage.setItem('luach.events', JSON.stringify(o));
  return localStorage.getItem('luach.events');
}

/**
 * שמות הפרשיות והשבתות המיוחדות בדיוק בתאים המוצגים — כולל ימי הגלישה
 * מן החודש הקודם והבא, שגם הם מודפסים. הטווח נגזר מכותרת החודש עצמה,
 * ולכן הבדיקה נכונה בכל חודש שבו היא רצה.
 */
function monthNames() {
  var israel = JSON.parse(localStorage.getItem('luach.settings') || '{}').israel !== false;
  var t = document.querySelector('#month-title .greg').textContent.trim().split(' ');
  var gm = HDate.GREG_MONTHS.indexOf(t[0]) + 1;
  var gy = +t[t.length - 1];
  var first = HDate.gregToAbs(gy, gm, 1);
  var count = new Date(gy, gm, 0).getDate();
  var dow = ((first % 7) + 7) % 7;
  var start = first - dow;
  var total = Math.ceil((dow + count) / 7) * 7;
  var out = { par: [], special: [] };
  for (var i = 0; i < total; i++) {
    var info = Holidays.forDate(HDate.make(start + i), israel);
    if (info.parasha) out.par.push(info.parasha.name);
    if (info.special) out.special.push(info.special);
  }
  return out;
}

/** מצב המסך וההדפסה בצירוף ההגדרות הנוכחי */
function probe(text) {
  window.print = function () { };
  document.getElementById('act-print').click();
  var pr = document.getElementById('print-area');
  var lines = function (sel) {
    return [].slice.call(pr.querySelectorAll(sel)).map(function (e) { return e.textContent; });
  };
  return {
    evLabels: document.querySelectorAll('#grid .lbl.evt').length,
    evDots: document.querySelectorAll('#grid .cell.evdot').length,
    cardRow: !!document.querySelector('#daycard .dc-events'),
    addChip: !!document.querySelector('#daycard [data-ev-add]'),
    chips: document.querySelectorAll('#daycard [data-ev]').length,
    printEv: lines('.pr-l.ev').filter(function (t) { return t.indexOf(text) >= 0; }).length,
    printPar: lines('.pr-l.par').join('|'),
    stored: localStorage.getItem('luach.events')
  };
}

function open(browser, cfg) {
  return browser.newContext({ viewport: { width: 393, height: 800 }, deviceScaleFactor: 2 })
    .then(function (ctx) {
      return ctx.newPage().then(function (p) {
        return p.goto(ROOT + '/index.html')
          .then(function () { return p.evaluate(seed, cfg); })
          .then(function (stored) {
            return p.reload()
              .then(function () { return p.waitForTimeout(200); })
              .then(function () { return { ctx: ctx, page: p, stored: stored }; });
          });
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

  var bad = 0, checks = 0;
  var want = function (name, cond, msg) {
    checks++;
    if (!cond) { bad++; console.log('✗ ' + name + ' — ' + msg); }
  };

  for (const show of [false, true]) {
    for (const edit of [false, true]) {
      for (const par of [false, true]) {
        const cfg = { show: show, edit: edit, par: par, text: EV_TEXT };
        const name = `הצגה=${show ? 'כן' : 'לא'} כתיבה=${edit ? 'כן' : 'לא'} פרשה=${par ? 'כן' : 'לא'}`;
        const { ctx, page, stored } = await open(browser, cfg);
        const names = await page.evaluate(monthNames);
        const r = await page.evaluate(probe, EV_TEXT);

        // אירועים — תצוגה בלבד
        want(name, (r.evLabels > 0) === show, `תוויות אירוע בלוח: ${r.evLabels}`);
        want(name, show || r.evDots === 0, `נקודות אירוע כשההצגה כבויה: ${r.evDots}`);
        want(name, r.cardRow === show, `שורת אירועים בכרטיס: ${r.cardRow}`);
        want(name, (r.printEv > 0) === show, `שורות אירוע בהדפסה: ${r.printEv}`);
        want(name, !show || r.chips > 0, 'אין שבבי אירוע בכרטיס אף שההצגה דלוקה');

        // אירועים — הרשאת כתיבה
        want(name, r.addChip === (show && edit), `שבב «+ אירוע»: ${r.addChip}`);

        // פרשת השבוע בהדפסה — לפי ההגדרה, בדיוק כמו בתאי הלוח
        const anyPar = names.par.some(function (n) { return r.printPar.indexOf(n) >= 0; });
        want(name, anyPar === par, `שמות פרשיות בהדפסה: ${anyPar}`);
        // שבת מיוחדת אינה פרשה, ומודפסת בשני המצבים
        if (names.special.length) {
          want(name, names.special.some(function (n) { return r.printPar.indexOf(n) >= 0; }),
            'שבת מיוחדת נעדרת מן ההדפסה');
        }

        // שום הגדרה אינה נוגעת בנתונים השמורים
        want(name, r.stored === stored, 'האירועים השמורים השתנו בעקבות הגדרה');

        await ctx.close();
      }
    }
  }

  // מסלול מלא: הוספה, ואז כיבוי הכתיבה — הנתונים נשארים והעריכה נחסמת
  {
    const { ctx, page } = await open(browser, { show: true, edit: true, par: true, text: EV_TEXT });
    page.on('dialog', function (d) { d.accept(); });
    const sel = await page.evaluate(function () {
      var c = document.querySelectorAll('#grid .cell');
      for (var i = 0; i < c.length; i++) if (c[i].classList.contains('sel')) return i;
      return -1;
    });
    await page.locator('#grid .cell').nth(sel).click();     // לחיצה חוזרת = הוספה
    await page.waitForTimeout(320);
    want('מסלול', (await page.locator('#sheet.open').count()) === 1, 'חלון ההוספה לא נפתח');
    await page.fill('#sheet-body input[type="text"]', 'אירוע חדש לבדיקה');
    await page.click('#sheet-body .btn-main');
    await page.waitForTimeout(250);
    const saved = function () {
      return page.evaluate(function () {
        return localStorage.getItem('luach.events').indexOf('אירוע חדש לבדיקה') >= 0;
      });
    };
    want('מסלול', await saved(), 'האירוע לא נשמר');

    await page.evaluate(function () {
      var s = JSON.parse(localStorage.getItem('luach.settings'));
      s.evEdit = false;
      localStorage.setItem('luach.settings', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForTimeout(250);
    want('מסלול', (await page.locator('#daycard [data-ev-add]').count()) === 0,
      'שבב ההוספה נשאר אף שהכתיבה כבויה');
    await page.locator('#daycard [data-ev]').first().click();
    await page.waitForTimeout(320);
    want('מסלול', (await page.locator('#sheet-title').textContent()) === 'אירועי היום',
      'לחיצה על שבב בלי הרשאת כתיבה פתחה חלון עריכה');
    want('מסלול', (await page.locator('#sheet-body .row-del').count()) === 0,
      'כפתור מחיקה מופיע בלי הרשאת כתיבה');
    want('מסלול', (await page.locator('#sheet-body .btn-main').count()) === 0,
      'כפתור הוספה מופיע בלי הרשאת כתיבה');
    want('מסלול', await saved(), 'האירוע נמחק בעקבות כיבוי הכתיבה');
    await ctx.close();
  }

  await browser.close();
  console.log(`הגדרות: ${checks} בדיקות, ${bad} כשלו`);
  process.exit(bad ? 1 : 0);
})();
