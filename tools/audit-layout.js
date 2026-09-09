/* בדיקת פריסה אוטומטית ללוח.
 *
 *   python3 -m http.server 8000 &
 *   node tools/audit-layout.js                    # שתי הבדיקות
 *   node tools/audit-layout.js clip               # חיתוך ודחיסה בלבד
 *   node tools/audit-layout.js days               # גלילה בכרטיס היום בלבד
 *   node tools/audit-layout.js clip http://localhost:8000
 *
 * דורש playwright-core ודפדפן Chromium מקומי (ראו PW_CHROME בהמשך).
 *
 * שתי הבדיקות נכתבו אחרי תקלה שלוש בדיקות קודמות פספסו, ולכן הן בודקות
 * במפורש את מה שפוספס: דחיסת תווית בתוך התא (ולא רק חריגה ממנו), חיתוך
 * הגליף עצמו (דרך מדידת דיו), שני מצבי הלוח, והגדלת טקסט במכשיר.
 * פירוט המלכודות — ב־README, בפרק «מלכודות שכבר נפלנו בהן».
 */
'use strict';

var PW_CHROME = process.env.PW_CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var ROOT = process.argv[3] || 'http://localhost:8000';
var WHICH = process.argv[2] || 'all';

var chromium;
try {
  chromium = require('playwright-core').chromium;
} catch (e) {
  console.error('חסר playwright-core. התקנה: npm i playwright-core');
  process.exit(2);
}

/* חובה לבדוק מעל HTTP. ב־file:// הדפדפן חוסם גישה לכללי ה־CSS, והדמיית
   הגדלת הטקסט נכשלת בשקט — כלומר הבדיקה "עוברת" בלי שבדקה דבר. */
if (ROOT.indexOf('file://') === 0) {
  console.error('יש להריץ מעל שרת HTTP ולא מ־file:// — ראו את ההסבר ב־README.');
  process.exit(2);
}

var SIZES = [[393, 780], [393, 700], [393, 660], [360, 640], [412, 800], [430, 760]];
var SCALES = [1, 1.15, 1.3];
var MODES = ['heb', 'greg'];       // מצב חודש עברי נשכח בעבר ודווקא בו התגלתה התקלה
var MONTHS = 13;

/** מפתח ההגדרות ב־localStorage. שם שגוי כאן מריץ את כל הבדיקה במצב הלוח הלועזי. */
function setMode(mode) {
  var s = JSON.parse(localStorage.getItem('luach.settings') || '{}');
  s.calMode = mode;
  localStorage.setItem('luach.settings', JSON.stringify(s));
}

/** מדמה הגדלת טקסט במכשיר: מכפיל כל font-size בגיליונות הסגנון. */
function scaleFonts(k) {
  if (k === 1) return;
  var walk = function (rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      // ב־Chrome גם כלל רגיל חושף cssRules (כללים מקוננים), ולכן בודקים קודם style
      if (!r.style) { if (r.cssRules) walk(r.cssRules); continue; }
      var fs = r.style.fontSize;
      if (!fs) continue;
      var m = fs.match(/^([\d.]+)px$/);
      if (m) r.style.fontSize = (+m[1] * k).toFixed(2) + 'px';
      else if (fs.indexOf('calc(') === 0) {
        r.style.fontSize = fs.replace(/([\d.]+)px/, function (s, n) {
          return (+n * k).toFixed(2) + 'px';
        });
      }
    }
  };
  // StyleSheetList ו־CSSRuleList אינם ניתנים לאיטרציה ב־for..of בכל גרסה
  for (var i = 0; i < document.styleSheets.length; i++) {
    try { walk(document.styleSheets[i].cssRules); } catch (e) { }
  }
  window.dispatchEvent(new Event('resize'));
}

/** שלוש התקלות שבודקים בתא: חריגה מגבולותיו, דחיסת תווית, וחיתוך גליף. */
function auditGrid() {
  var grid = document.getElementById('grid');
  var bad = [];
  var cvs = document.createElement('canvas').getContext('2d');
  var i;
  for (i = 0; i < grid.children.length; i++) {
    var c = grid.children[i], k = c.children;
    if (!k.length) continue;
    var box = c.getBoundingClientRect();
    var over = Math.max(box.top - k[0].getBoundingClientRect().top,
      k[k.length - 1].getBoundingClientRect().bottom - box.bottom);
    if (over > 0.6) {
      bad.push('חריגה מהתא: ' + c.textContent.trim().replace(/\s+/g, ' ').slice(0, 14) +
        ' +' + over.toFixed(1));
    }
  }
  var labels = grid.querySelectorAll('.lbl');
  for (i = 0; i < labels.length; i++) {
    var l = labels[i], st = getComputedStyle(l);
    if (st.display === 'none') continue;
    var lh = parseFloat(st.lineHeight) || 0;
    // תווית שנדחסה: התיבה נמוכה משורת טקסט אחת, וה־overflow חותך את האותיות
    if (lh > 0 && l.getBoundingClientRect().height < lh * 0.9) {
      bad.push('תווית נמעכה: ' + l.textContent.slice(0, 12));
    }
    cvs.font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
    var m = cvs.measureText(l.textContent);
    var ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (ink > lh + 0.6) {
      bad.push('גליף נחתך: ' + l.textContent.slice(0, 12) +
        ' ' + ink.toFixed(1) + '>' + lh.toFixed(1));
    }
  }
  var cal = document.getElementById('view-cal');
  return {
    bad: bad,
    scroll: cal.scrollHeight - cal.clientHeight,
    cls: grid.className,
    row: getComputedStyle(grid).getPropertyValue('--row-h'),
    title: document.getElementById('month-title').textContent.trim().slice(0, 18)
  };
}

function open(browser, w, h, mode) {
  return browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    .then(function (ctx) {
      return ctx.newPage().then(function (p) {
        return p.goto(ROOT + '/index.html')
          .then(function () { return p.evaluate(setMode, mode); })
          .then(function () { return p.reload(); })
          .then(function () { return p.waitForTimeout(150); })
          .then(function () { return { ctx: ctx, page: p }; });
      });
    });
}

/** חיתוך, דחיסה וגלילה — בכל גודל מסך, בשני מצבי הלוח ובשלוש רמות הגדלת טקסט */
async function auditClipping(browser) {
  var checks = 0, bad = 0;
  for (const [w, h] of SIZES) {
    for (const mode of MODES) {
      for (const k of SCALES) {
        const { ctx, page } = await open(browser, w, h, mode);
        await page.evaluate(scaleFonts, k);
        await page.waitForTimeout(80);
        for (let i = 0; i < MONTHS; i++) {
          const r = await page.evaluate(auditGrid);
          checks++;
          if (r.bad.length || r.scroll > 1) {
            bad++;
            if (bad <= 12) {
              console.log(`${w}x${h} ${mode} x${k} | ${r.title} [${r.cls}] ${r.row} ` +
                `scroll=${r.scroll} | ${r.bad.slice(0, 3).join(' , ')}`);
            }
          }
          await page.click('#m-next');
          await page.waitForTimeout(45);
        }
        await ctx.close();
      }
    }
  }
  console.log(`חיתוך: ${checks} מסכים נבדקו, ${bad} עם תקלה`);
  return bad;
}

/** כרטיס היום: לחיצה על כל יום בחודש, ובדיקה שאין גלילה פנימית */
async function auditDays(browser) {
  var checks = 0, bad = 0;
  for (const [w, h] of [[393, 780], [393, 700], [360, 640]]) {
    for (const mode of MODES) {
      const { ctx, page } = await open(browser, w, h, mode);
      for (let m = 0; m < 14; m++) {
        const n = await page.evaluate(function () {
          return document.getElementById('grid').children.length;
        });
        for (let d = 0; d < n; d++) {
          const r = await page.evaluate(function (d) {
            document.getElementById('grid').children[d].click();
            var body = document.querySelector('.dc-body');
            return {
              card: body.scrollHeight - body.clientHeight,
              day: document.getElementById('grid').children[d].textContent
                .trim().replace(/\s+/g, ' ').slice(0, 16),
              title: document.getElementById('month-title').textContent.trim().slice(0, 16)
            };
          }, d);
          checks++;
          if (r.card > 1) {
            bad++;
            if (bad <= 10) {
              console.log(`${w}x${h} ${mode} | ${r.title} | ${r.day} | גלילה בכרטיס: ${r.card}px`);
            }
          }
        }
        await page.click('#m-next');
        await page.waitForTimeout(40);
      }
      await ctx.close();
    }
  }
  console.log(`כרטיס היום: ${checks} ימים נבדקו, ${bad} עם גלילה`);
  return bad;
}

(async function () {
  var browser;
  try {
    browser = await chromium.launch({ executablePath: PW_CHROME });
  } catch (e) {
    console.error('לא נמצא Chromium ב־' + PW_CHROME + ' — אפשר לקבוע נתיב ב־PW_CHROME');
    process.exit(2);
  }
  var bad = 0;
  if (WHICH === 'all' || WHICH === 'clip') bad += await auditClipping(browser);
  if (WHICH === 'all' || WHICH === 'days') bad += await auditDays(browser);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
