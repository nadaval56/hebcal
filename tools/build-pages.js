#!/usr/bin/env node
/* build-pages.js — מייצר את הדפים הסטטיים למנועי חיפוש, ואת sitemap.xml.

     zmanim/index.html          רשימת היישובים
     zmanim/<slug>/index.html   זמני השבוע וזמני השבתות הקרובות ביישוב
     chagim/index.html          רשימת החגים והמועד הקרוב של כל אחד
     chagim/<slug>/index.html   תאריכי החג בשנים הקרובות, ובצומות — שעות הצום
     parasha/index.html         פרשות השבוע ומועד קריאתן
     parasha/<slug>/index.html  כניסת השבת ויציאתה בשבת שבה הפרשה נקראת
     chametz/index.html         סוף זמן אכילת חמץ וביעורו, בשלוש שיטות

   החישובים נעשים באותם קבצים שהאפליקציה משתמשת בהם (js/*.js), כך שהזמנים
   בדפים זהים לזמנים באפליקציה בהגדרות ברירת המחדל. הדפים תלויים בתאריך,
   ולכן GitHub Action מריץ את הסקריפט מחדש פעם בשבוע (.github/workflows/pages.yml).

   הרצה:  node tools/build-pages.js            (מהיום)
          node tools/build-pages.js 2026-11-01 (מתאריך נתון — לבדיקות) */
'use strict';
process.env.TZ = 'Asia/Jerusalem';

var fs = require('fs');
var path = require('path');
var HDate = require('../js/hdate.js');
var Zmanim = require('../js/zmanim.js');
var Holidays = require('../js/holidays.js');
var Cities = require('../js/cities.js');
var SLUGS = require('./slugs.js');
var CHAGIM = require('./holidays-info.js');
var PARASHOT = require('./parashot-info.js');

var ROOT = path.join(__dirname, '..');
var SITE = 'https://heb-cal.co.il/';
var WEEK_DAYS = 7;      // שורות בטבלת הזמנים של כל יישוב
var SHABBATOT = 4;      // שבתות קרובות בכל יישוב
var OCCURRENCES = 3;    // מופעים קרובים בכל דף חג

/* ---------- תאריך הבסיס ---------- */
var arg = process.argv[2];
var TODAY = arg ? HDate.gregToAbs.apply(null, arg.split('-').map(Number)) : HDate.dateToAbs(new Date());
var todayH = HDate.make(TODAY);
var ISO_TODAY = iso(todayH);

/* ---------- עזרים ---------- */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function iso(h) { return h.gy + '-' + pad2(h.gm) + '-' + pad2(h.gd); }
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function gregStr(h, year) { return h.gd + ' ב' + HDate.GREG_MONTHS[h.gm - 1] + (year ? ' ' + h.gy : ''); }
function hebStr(h, year) { return h.dayHebMarks + ' ' + h.monthName + (year ? ' ' + h.yearHeb : ''); }
function dayName(h) { return HDate.DAY_NAMES_FULL[h.dow]; }
function timeFmt(tz) {
  var f = new Intl.DateTimeFormat('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return function (d) { return d ? f.format(d) : '—'; };
}
function appLink(params) {
  return '/?' + Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
}
function write(rel, html) {
  var file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
/** מנהג הדלקת הנרות — כמו בבחירת יישוב באפליקציה (js/app.js, candleCustom):
 *  ירושלים 40, חיפה 30, שאר הארץ 20, חו״ל 18 */
function candleMinutes(city) {
  return city.name === 'ירושלים' ? 40 : city.name === 'חיפה' ? 30 : city.tz === Cities.IL ? 20 : 18;
}
function candleNote(min) {
  return min + ' דקות לפני השקיעה' + (min === 40 ? ' (מנהג ירושלים)' : min === 30 ? ' (מנהג חיפה)' : '');
}
function inIsrael(city) { return city.region === 'ישראל'; }
/** "ב" לפני שם יישוב: "בירושלים", "בתל אביב–יפו" */
function inCity(city) { return 'ב' + city.name; }

/* ---------- תבנית עמוד ---------- */
/**
 * o: { url, title, description, crumbs:[[label,href]], appHref, appLabel, body }
 * appHref — קישור קטן בסרגל העליון שפותח את האפליקציה במקום המתאים.
 */
function page(o) {
  var crumbs = o.crumbs.map(function (c, i) {
    return i === o.crumbs.length - 1
      ? '<span aria-current="page">' + esc(c[0]) + '</span>'
      : '<a href="' + c[1] + '">' + esc(c[0]) + '</a>';
  }).join('<span class="sep" aria-hidden="true">›</span>');
  var ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: o.crumbs.map(function (c, i) {
      return { '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1].replace(/^\//, '') };
    })
  };
  return '<!DOCTYPE html>\n' +
    '<html lang="he" dir="rtl">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<title>' + esc(o.title) + '</title>\n' +
    '<meta name="description" content="' + esc(o.description) + '">\n' +
    '<link rel="canonical" href="' + SITE + o.url + '">\n' +
    '<meta name="theme-color" content="#f4f2ec" media="(prefers-color-scheme: light)">\n' +
    '<meta name="theme-color" content="#1c1b19" media="(prefers-color-scheme: dark)">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:site_name" content="לוח עברי">\n' +
    '<meta property="og:locale" content="he_IL">\n' +
    '<meta property="og:url" content="' + SITE + o.url + '">\n' +
    '<meta property="og:title" content="' + esc(o.title) + '">\n' +
    '<meta property="og:description" content="' + esc(o.description) + '">\n' +
    '<meta property="og:image" content="' + SITE + 'assets/og.png">\n' +
    '<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">\n' +
    '<link rel="apple-touch-icon" href="/assets/icon-180.png">\n' +
    '<link rel="preload" href="/assets/fonts/heebo-hebrew.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<link rel="stylesheet" href="/css/pages.css">\n' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n' +
    '</head>\n<body>\n' +
    '<header class="top"><div class="wrap">' +
    '<a class="brand" href="/"><img src="/assets/icon.svg" alt="" width="22" height="22">לוח עברי</a>' +
    (o.appHref ? '<a class="open" href="' + esc(o.appHref) + '">' + esc(o.appLabel || 'פתיחה בלוח') + ' ←</a>' : '') +
    '</div></header>\n' +
    '<main class="wrap">\n' +
    '<nav class="crumbs" aria-label="מיקום בדף">' + crumbs + '</nav>\n' +
    o.body +
    '</main>\n' +
    '<footer class="wrap foot">' +
    '<nav><a href="/">לוח שנה עברי</a> · <a href="/zmanim/">זמני היום לפי יישוב</a> · ' +
    '<a href="/parasha/">פרשת השבוע</a> · <a href="/chagim/">חגים ומועדים</a></nav>' +
    '<p>הזמנים מחושבים לפי מיקום גאוגרפי. יש לנהוג לחומרא בכמה דקות בכל זמן. עודכן ב־' +
    gregStr(todayH, true) + '.</p>' +
    '</footer>\n' +
    '</body>\n</html>\n';
}

/* ---------- דפי יישובים ---------- */
var cities = Cities.list.map(function (c) {
  var slug = SLUGS[c.name];
  if (!slug) throw new Error('חסרה כתובת ב־tools/slugs.js ליישוב: ' + c.name);
  return { city: c, slug: slug };
});

function nearby(entry, n) {
  var c = entry.city;
  return cities.filter(function (x) { return x !== entry && x.city.region === c.region; })
    .map(function (x) {
      var d = Math.pow(x.city.lat - c.lat, 2) +
        Math.pow((x.city.lng - c.lng) * Math.cos(c.lat * Math.PI / 180), 2);
      return { e: x, d: d };
    })
    .sort(function (a, b) { return a.d - b.d; })
    .slice(0, n).map(function (x) { return x.e; });
}

function cityPage(entry) {
  var c = entry.city, il = inIsrael(c), fmt = timeFmt(c.tz);
  var opts = { candles: candleMinutes(c) };
  var tzeitOpt = Zmanim.findOptById(Zmanim.TZEIT_OPTS, Zmanim.DEFAULTS.tzeit);
  var shabOpt = Zmanim.findOptById(Zmanim.SHABBAT_END_OPTS, Zmanim.DEFAULTS.shabbatEnd);

  // זמני היום — היום הראשון במלואו
  var first = Zmanim.compute(todayH.date, c, opts);
  var groups = {};
  first.list.forEach(function (z) { (groups[z.group] = groups[z.group] || []).push(z); });
  var full = '';
  Object.keys(groups).forEach(function (g) {
    full += '<h3>' + esc(g) + '</h3><ul class="zlist">' + groups[g].map(function (z) {
      return '<li><span class="k">' + esc(z.label) + '<small>' + esc(z.note) + '</small></span>' +
        '<span class="v">' + fmt(z.time) + '</span></li>';
    }).join('') + '</ul>';
  });

  // השבוע
  var rows = '';
  for (var i = 0; i < WEEK_DAYS; i++) {
    var h = HDate.make(TODAY + i), z = Zmanim.compute(h.date, c, opts);
    rows += '<tr' + (h.dow === 6 ? ' class="sh"' : '') + '><th scope="row">' + esc(HDate.DAY_NAMES[h.dow]) +
      ' <span>' + h.gd + '.' + h.gm + '</span><small>' + esc(hebStr(h)) + '</small></th>' +
      '<td>' + fmt(z.sunrise) + '</td><td>' + fmt(z.gra(3)) + '</td>' +
      '<td>' + fmt(z.sunset) + '</td><td>' + fmt(z.tzeit) + '</td></tr>';
  }

  // שבתות
  var shab = '', nextShabbat = null;
  for (var k = 0; k < SHABBATOT; k++) {
    var up = Holidays.upcomingShabbat(TODAY + 7 * k, il);
    var fri = HDate.make(up.abs - 1), sat = HDate.make(up.abs);
    var zf = Zmanim.compute(fri.date, c, opts), zs = Zmanim.compute(sat.date, c, opts);
    if (!nextShabbat) nextShabbat = { label: up.label, candles: fmt(zf.candles), end: fmt(zs.tzeitShabbat) };
    var par = Holidays.parashaForShabbat(up.abs, il);
    var label = par ? '<a href="/parasha/' + PARASHOT[par.idx][0] + '/">' + esc(up.label) + '</a>' : esc(up.label);
    shab += '<tr><th scope="row">' + label + '<small>' + esc(hebStr(sat)) + ' · ' +
      esc(gregStr(sat)) + '</small></th><td>' + fmt(zf.candles) + '</td><td>' + fmt(zs.tzeitShabbat) +
      '</td><td>' + fmt(zs.tzeit72) + '</td></tr>';
  }

  var near = nearby(entry, 6).map(function (x) {
    return '<a href="/zmanim/' + x.slug + '/">' + esc(x.city.name) + '</a>';
  }).join('');

  var body =
    '<h1>זמני היום ' + esc(inCity(c)) + '</h1>\n' +
    '<p class="lead">זמני היום ההלכתיים ' + esc(inCity(c)) + ' לשבוע הקרוב, וזמני כניסת השבת ויציאתה. ' +
    'בשבת הקרובה (' + esc(nextShabbat.label) + '): הדלקת נרות ב־' + nextShabbat.candles +
    ' וצאת השבת ב־' + nextShabbat.end + '.</p>\n' +

    '<section><h2>זמני כניסת שבת ויציאתה ' + esc(inCity(c)) + '</h2>' +
    '<div class="card"><table class="t"><thead><tr><th>שבת</th><th>הדלקת נרות</th><th>צאת השבת</th>' +
    '<th>רבנו תם</th></tr></thead><tbody>' + shab + '</tbody></table></div>' +
    '<p class="note">הדלקת נרות ' + candleNote(opts.candles) + '. צאת השבת ' + esc(shabOpt.label) + '; רבנו תם — 72 דקות אחרי השקיעה.</p></section>\n' +

    '<section><h2>זמני היום ' + esc(inCity(c)) + ' — ' + esc(dayName(todayH)) + ', ' +
    esc(hebStr(todayH)) + '</h2><div class="card">' + full + '</div></section>\n' +

    '<section><h2>זמני השבוע</h2><div class="card"><table class="t week"><thead><tr><th>יום</th>' +
    '<th>הנץ</th><th>סוף ק״ש<small>גר״א</small></th><th>שקיעה</th><th>צאת הכוכבים</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="note">צאת הכוכבים ' + esc(tzeitOpt.label) +
    '. הנץ והשקיעה בגובה פני הים. בלוח עצמו אפשר לבחור שיטות חישוב אחרות ולנווט לכל תאריך.</p></section>\n' +

    (near ? '<section><h2>יישובים סמוכים</h2><div class="chips">' + near + '</div></section>\n' : '');

  write('zmanim/' + entry.slug + '/index.html', page({
    url: 'zmanim/' + entry.slug + '/',
    title: 'זמני היום ' + inCity(c) + ' — כניסת שבת, הנץ ושקיעה | לוח עברי',
    description: 'זמני היום ' + inCity(c) + ': עלות השחר, הנץ החמה, סוף זמן קריאת שמע ותפילה, שקיעה ' +
      'וצאת הכוכבים, וזמני הדלקת נרות וצאת השבת לשבתות הקרובות.',
    crumbs: [['לוח עברי', '/'], ['זמני היום', '/zmanim/'], [c.name, '/zmanim/' + entry.slug + '/']],
    appHref: appLink({ city: c.name, view: 'zman' }),
    appLabel: 'בלוח המלא',
    body: body
  }));
}

function citiesIndex() {
  var regions = [];
  cities.forEach(function (x) {
    var r = regions.filter(function (g) { return g.name === x.city.region; })[0];
    if (!r) regions.push(r = { name: x.city.region, items: [] });
    r.items.push(x);
  });
  var body = '<h1>זמני היום וזמני שבת לפי יישוב</h1>\n' +
    '<p class="lead">בחרו יישוב כדי לראות את זמני היום ההלכתיים לשבוע הקרוב — עלות השחר, הנץ החמה, ' +
    'סוף זמן קריאת שמע, שקיעה וצאת הכוכבים — ואת זמני כניסת השבת ויציאתה.</p>\n' +
    regions.map(function (r) {
      return '<section><h2>' + esc(r.name === 'ישראל' ? 'ישראל' : 'חו״ל — ' + r.name) + '</h2><div class="chips">' +
        r.items.map(function (x) { return '<a href="/zmanim/' + x.slug + '/">' + esc(x.city.name) + '</a>'; }).join('') +
        '</div></section>\n';
    }).join('');
  write('zmanim/index.html', page({
    url: 'zmanim/',
    title: 'זמני היום וזמני כניסת שבת לפי יישוב | לוח עברי',
    description: 'זמני היום ההלכתיים וזמני כניסת השבת ויציאתה ביותר מ־100 יישובים בארץ ובעולם: ' +
      'ירושלים, תל אביב, בני ברק, חיפה, ניו יורק, לונדון ועוד.',
    crumbs: [['לוח עברי', '/'], ['זמני היום', '/zmanim/']],
    appHref: appLink({ view: 'zman' }),
    appLabel: 'בלוח המלא',
    body: body
  }));
}

/* ---------- טבלאות לפי ערים ראשיות ---------- */
var MAIN = ['ירושלים', 'תל אביב–יפו', 'חיפה', 'באר שבע', 'בני ברק', 'פתח תקווה', 'ראשון לציון', 'אשדוד',
  'נתניה', 'רחובות', 'מודיעין–מכבים–רעות', 'בית שמש', 'אלעד', 'מודיעין עילית', 'ביתר עילית', 'צפת',
  'טבריה', 'אילת'].map(function (n) {
  return cities.filter(function (x) { return x.city.name === n; })[0];
});
/**
 * טבלה: שורה לכל עיר ראשית, עמודה לכל זמן.
 * cols: [[כותרת, function (city, fmt) → Date]]
 */
function mainTable(cols) {
  return '<div class="card"><table class="t"><thead><tr><th>עיר</th>' +
    cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
    MAIN.map(function (x) {
      var fmt = timeFmt(x.city.tz);
      return '<tr><th scope="row"><a href="/zmanim/' + x.slug + '/">' + esc(x.city.name) + '</a></th>' +
        cols.map(function (c) { return '<td>' + fmt(c[1](x.city)) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}
function zman(abs, city) { return Zmanim.compute(HDate.make(abs).date, city, { candles: candleMinutes(city) }); }
var TZEIT_LABEL = Zmanim.findOptById(Zmanim.TZEIT_OPTS, Zmanim.DEFAULTS.tzeit).label;
var SHAB_LABEL = Zmanim.findOptById(Zmanim.SHABBAT_END_OPTS, Zmanim.DEFAULTS.shabbatEnd).label;

/** שעות הצום לפי ערים. abs = יום הצום עצמו (אחרי דחייה, אם נדחה) */
function fastSection(chag, abs) {
  var h = HDate.make(abs), title = esc(chag.name) + ' ' + esc(h.yearHeb), cols, note;
  if (chag.fast === 'yk') {
    cols = [['הדלקת נרות', function (c) { return zman(abs - 1, c).candles; }],
      ['כניסת החג<small>שקיעה</small>', function (c) { return zman(abs - 1, c).sunset; }],
      ['צאת החג', function (c) { return zman(abs, c).tzeitShabbat; }]];
    note = 'הצום מתחיל בשקיעה שבערב יום הכיפורים, ונהוג להוסיף עליו מן החול — לכן מקדימים ' +
      'להפסיק לאכול ולהדליק נרות לפני השקיעה. צאת החג ' + SHAB_LABEL + ', כמו במוצאי שבת.';
  } else if (chag.fast === 'night') {
    cols = [['תחילת הצום<small>שקיעה</small>', function (c) { return zman(abs - 1, c).sunset; }],
      ['סיום הצום', function (c) { return zman(abs, c).tzeit; }]];
    note = 'הצום מתחיל בשקיעת החמה בערב שלפניו ומסתיים בצאת הכוכבים, ' + TZEIT_LABEL + '.';
  } else {
    cols = [['תחילת הצום<small>עלות השחר</small>', function (c) { return zman(abs, c).alot72; }],
      ['סיום הצום', function (c) { return zman(abs, c).tzeit; }]];
    note = 'צום קל: מתחיל בעלות השחר (72 דקות לפני הנץ) ומסתיים בצאת הכוכבים, ' + TZEIT_LABEL +
      '. מותר לאכול לפני עלות השחר רק למי שהתכוון לכך לפני השינה.';
  }
  return '<section><h2>שעות ' + title + ' — תחילת הצום וסיומו</h2>' + mainTable(cols) +
    '<p class="note">' + esc(note) + ' זמנים לשאר היישובים — בדף זמני היום של כל יישוב.</p></section>\n';
}

/* ---------- דפי חגים ---------- */
/** מופעי החג מהיום והלאה: [{start, end}] — ימים רצופים הם מופע אחד */
function occurrences(chag, n) {
  var out = [], cur = null;
  for (var a = TODAY - 10; a < TODAY + 400 * (n + 1) && out.length < n + 1; a++) {
    var h = HDate.absToHeb(a);
    var hit = Holidays.holidaysFor(h.y, h.m, h.d, true).some(function (x) { return chag.match.test(x.name); });
    if (hit) {
      if (cur && cur.end === a - 1) cur.end = a;
      else out.push(cur = { start: a, end: a });
    }
  }
  return out.filter(function (o) { return o.end >= TODAY; }).slice(0, n);
}

/** "יום ב׳, 20 בדצמבר 2026" ליום אחד; "5 עד 12 בדצמבר 2026" לטווח */
function occText(o) {
  var s = HDate.make(o.start), e = HDate.make(o.end);
  if (o.start === o.end) {
    return { heb: hebStr(s, true), greg: HDate.DAY_NAMES[s.dow] + ', ' + gregStr(s, true) };
  }
  return {
    heb: hebStr(s) + ' – ' + hebStr(e, true),
    greg: (s.gm === e.gm ? s.gd + ' עד ' + gregStr(e, true) : gregStr(s, s.gy !== e.gy) + ' – ' + gregStr(e, true))
  };
}

function chagPage(chag, i) {
  var occ = occurrences(chag, OCCURRENCES);
  var next = occ[0], nh = HDate.make(next.start), nt = occText(next);
  var rows = occ.map(function (o) {
    var t = occText(o), s = HDate.make(o.start);
    return '<tr><th scope="row">' + esc(s.yearHeb) + '<small>' + s.gy + '</small></th><td>' + esc(t.heb) +
      '</td><td>' + esc(t.greg) + '</td></tr>';
  }).join('');
  var prev = CHAGIM[(i + CHAGIM.length - 1) % CHAGIM.length], nxt = CHAGIM[(i + 1) % CHAGIM.length];

  var body =
    '<h1>' + esc(chag.name) + ' ' + esc(nh.yearHeb) + ' (' + nh.gy + ')</h1>\n' +
    '<p class="lead">' + esc(chag.name) + ' ' + esc(nh.yearHeb) + ': ' + esc(nt.greg) + ' — ' + esc(nt.heb) +
    '.</p>\n' +
    '<section><h2>מתי ' + esc(chag.name) + ' בשנים הקרובות</h2><div class="card"><table class="t dates">' +
    '<thead><tr><th>שנה</th><th>תאריך עברי</th><th>תאריך לועזי</th></tr></thead><tbody>' + rows +
    '</tbody></table></div><p class="note">התאריכים לפי לוח ארץ ישראל. מועדים מתחילים בשקיעה של ' +
    'הערב שלפניהם.</p></section>\n' +
    (chag.fast ? fastSection(chag, next.start) : '') +
    (chag.slug === 'pesach' ? '<section><h2>סוף זמן אכילת חמץ וביעורו</h2><p><a href="/chametz/">' +
      'סוף זמן אכילת חמץ ושריפת חמץ ' + esc(nh.yearHeb) + '</a> — בשלוש שיטות, לפי ערים.</p></section>\n' : '') +
    '<section><h2>על ' + esc(chag.name) + '</h2><p>' + esc(chag.text) + '</p></section>\n' +
    '<nav class="pager"><a href="/chagim/' + prev.slug + '/">→ ' + esc(prev.name) + '</a>' +
    '<a href="/chagim/' + nxt.slug + '/">' + esc(nxt.name) + ' ←</a></nav>\n';

  var jeru = MAIN[0].city, fmtJ = timeFmt(jeru.tz);
  write('chagim/' + chag.slug + '/index.html', page({
    url: 'chagim/' + chag.slug + '/',
    title: chag.fast
      ? chag.name + ' ' + nh.yearHeb + ' — מתי, ושעות תחילת הצום וסיומו | לוח עברי'
      : 'מתי ' + chag.name + ' ' + nh.gy + '? ' + chag.name + ' ' + nh.yearHeb + ' — תאריכים | לוח עברי',
    description: chag.name + ' ' + nh.yearHeb + ': ' + nt.greg + ' (' + nt.heb + '). ' +
      (chag.fast
        ? 'סיום הצום בירושלים ב־' + fmtJ(chag.fast === 'yk' ? zman(next.start, jeru).tzeitShabbat : zman(next.start, jeru).tzeit) +
          '. שעות תחילת הצום וסיומו בערים המרכזיות.'
        : 'תאריכי ' + chag.name + ' בשנים הקרובות, בעברי ובלועזי, והסבר קצר על המועד.'),
    crumbs: [['לוח עברי', '/'], ['חגים ומועדים', '/chagim/'], [chag.name, '/chagim/' + chag.slug + '/']],
    appHref: appLink({ date: iso(nh) }),
    appLabel: 'בלוח השנה',
    body: body
  }));
  return { chag: chag, next: next };
}

function chagimIndex(list) {
  var rows = list.slice().sort(function (a, b) { return a.next.start - b.next.start; }).map(function (x) {
    var t = occText(x.next);
    return '<tr><th scope="row"><a href="/chagim/' + x.chag.slug + '/">' + esc(x.chag.name) + '</a></th>' +
      '<td>' + esc(t.heb) + '</td><td>' + esc(t.greg) + '</td></tr>';
  }).join('');
  var body = '<h1>חגים ומועדים — לוח החגים</h1>\n' +
    '<p class="lead">החגים, הצומות והמועדים הקרובים, לפי סדר הופעתם, עם התאריך העברי והלועזי.</p>\n' +
    '<section><div class="card"><table class="t dates"><thead><tr><th>מועד</th><th>תאריך עברי</th>' +
    '<th>תאריך לועזי</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="note">התאריכים לפי לוח ארץ ישראל. מועדים מתחילים בשקיעה של הערב שלפניהם.</p></section>\n';
  write('chagim/index.html', page({
    url: 'chagim/',
    title: 'לוח חגים ' + todayH.yearHeb + ' — מתי החגים השנה | לוח עברי',
    description: 'מתי החגים השנה? תאריכי ראש השנה, יום כיפור, סוכות, חנוכה, פורים, פסח, שבועות, ' +
      'הצומות ושאר המועדים — בעברי ובלועזי.',
    crumbs: [['לוח עברי', '/'], ['חגים ומועדים', '/chagim/']],
    appHref: '/',
    appLabel: 'לוח השנה',
    body: body
  }));
}

/* ---------- פרשות השבוע ---------- */
/** השבת הקרובה (מהיום) שבה נקראת הפרשה idx, לבדה או מחוברת. בארץ ישראל. */
function parashaShabbat(idx) {
  var first = Holidays.upcomingShabbat(TODAY, true).abs;
  for (var a = first; a < first + 7 * 60; a += 7) {
    var p = Holidays.parashaForShabbat(a, true);
    if (p && (p.idx === idx || (p.combined && p.idx + 1 === idx))) return { abs: a, p: p };
  }
  return null;
}

function parashaPage(info, idx) {
  var name = Holidays.PARSHIOT[idx], slug = info[0];
  var r = parashaShabbat(idx), abs = r.abs, sat = HDate.make(abs), fri = HDate.make(abs - 1);
  var full = r.p.combined ? r.p.name : name;
  var other = r.p.combined ? Holidays.PARSHIOT[r.p.idx === idx ? idx + 1 : idx - 1] : null;
  var special = Holidays.specialShabbat(sat.hy, sat.hm, sat.hd, true);
  var jeru = MAIN[0].city, tlv = MAIN[1].city;
  var zj = zman(abs - 1, jeru), zt = zman(abs - 1, tlv), fmtJ = timeFmt(jeru.tz);

  var table = mainTable([
    ['הדלקת נרות', function (c) { return zman(abs - 1, c).candles; }],
    ['צאת השבת', function (c) { return zman(abs, c).tzeitShabbat; }],
    ['רבנו תם', function (c) { return zman(abs, c).tzeit72; }]
  ]);
  var prev = idx > 0 ? PARASHOT[idx - 1] : null, nxt = idx < PARASHOT.length - 1 ? PARASHOT[idx + 1] : null;

  var body =
    '<h1>פרשת ' + esc(full) + ' ' + esc(sat.yearHeb) + ' — כניסת שבת ויציאתה</h1>\n' +
    '<p class="lead">פרשת ' + esc(full) + ' נקראת בשבת ' + esc(hebStr(sat, true)) + ', ' + esc(gregStr(sat, true)) +
    (special ? ' (' + esc(special) + ')' : '') + '. כניסת השבת ביום שישי, ' + esc(gregStr(fri)) + ': בירושלים ' +
    fmtJ(zj.candles) + ', בתל אביב ' + timeFmt(tlv.tz)(zt.candles) + '. צאת השבת בירושלים ' +
    fmtJ(zman(abs, jeru).tzeitShabbat) + '.</p>\n' +
    (other ? '<p class="note">השנה פרשת ' + esc(name) + ' מחוברת לפרשת ' + esc(other) + ' ונקראות יחד.</p>\n' : '') +
    '<section><h2>זמני כניסת השבת ויציאתה — פרשת ' + esc(full) + '</h2>' + table +
    '<p class="note">הדלקת נרות 20 דקות לפני השקיעה; בירושלים 40 ובחיפה 30, לפי המנהג. צאת השבת ' +
    esc(SHAB_LABEL) + '; רבנו תם — 72 דקות אחרי השקיעה. לשאר היישובים — <a href="/zmanim/">זמני היום ' +
    'לפי יישוב</a>.</p></section>\n' +
    '<section><h2>על פרשת ' + esc(name) + '</h2><p>' + esc(info[1]) + '</p></section>\n' +
    '<nav class="pager">' + (prev ? '<a href="/parasha/' + prev[0] + '/">→ פרשת ' + esc(Holidays.PARSHIOT[idx - 1]) + '</a>' : '<span></span>') +
    (nxt ? '<a href="/parasha/' + nxt[0] + '/">פרשת ' + esc(Holidays.PARSHIOT[idx + 1]) + ' ←</a>' : '') + '</nav>\n';

  write('parasha/' + slug + '/index.html', page({
    url: 'parasha/' + slug + '/',
    title: 'כניסת שבת פרשת ' + full + ' ' + sat.yearHeb + ' — זמני הדלקת נרות וצאת השבת | לוח עברי',
    description: 'פרשת ' + full + ' ' + sat.yearHeb + ', שבת ' + gregStr(sat, true) + ': הדלקת נרות בירושלים ' +
      fmtJ(zj.candles) + ', צאת השבת ' + fmtJ(zman(abs, jeru).tzeitShabbat) +
      '. זמני כניסת השבת ויציאתה בכל הערים המרכזיות.',
    crumbs: [['לוח עברי', '/'], ['פרשת השבוע', '/parasha/'], [name, '/parasha/' + slug + '/']],
    appHref: appLink({ date: iso(sat) }),
    appLabel: 'בלוח השנה',
    body: body
  }));
  return { idx: idx, slug: slug, abs: abs, full: full };
}

function parashaIndex(list) {
  var cur = Holidays.upcomingShabbat(TODAY, true);
  var sorted = list.slice().sort(function (a, b) { return a.abs - b.abs || a.idx - b.idx; });
  var rows = sorted.map(function (x) {
    var s = HDate.make(x.abs);
    return '<tr' + (x.abs === cur.abs ? ' class="sh"' : '') + '><th scope="row"><a href="/parasha/' + x.slug + '/">' +
      esc(Holidays.PARSHIOT[x.idx]) + '</a>' + (x.full !== Holidays.PARSHIOT[x.idx] ? '<small>' + esc(x.full) + '</small>' : '') +
      '</th><td>' + esc(hebStr(s, true)) + '</td><td>' + esc(gregStr(s, true)) + '</td></tr>';
  }).join('');
  var body = '<h1>פרשת השבוע — ' + esc(cur.label) + '</h1>\n' +
    '<p class="lead">השבת הקרובה: ' + esc(cur.label) + ', ' + esc(gregStr(HDate.make(cur.abs), true)) +
    '. לכל פרשה — זמני כניסת השבת ויציאתה בשבת שבה היא נקראת, בערים המרכזיות.</p>\n' +
    '<section><div class="card"><table class="t dates"><thead><tr><th>פרשה</th><th>שבת</th><th>תאריך</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div><p class="note">לפי סדר הקריאה בארץ ישראל.</p></section>\n';
  write('parasha/index.html', page({
    url: 'parasha/',
    title: 'פרשת השבוע ' + cur.label.replace(/^פרשת /, '') + ' — וכל פרשות השנה | לוח עברי',
    description: 'פרשת השבוע: ' + cur.label + '. מתי נקראת כל פרשה, וזמני כניסת השבת ויציאתה בכל שבת.',
    crumbs: [['לוח עברי', '/'], ['פרשת השבוע', '/parasha/']],
    appHref: '/',
    appLabel: 'לוח השנה',
    body: body
  }));
}

/* ---------- סוף זמן אכילת חמץ ---------- */
/**
 * שיטת הגר״מ אליהו (כפי שמחושבת ב־zman.info, ונבדקה מול הזמנים שפורסמו לפסח תשפ״ו
 * בהפרש של עד דקה): היום ההלכתי מעלות השחר — שעה וחצי זמנית (גר״א) לפני הנץ —
 * ועד צאת הכוכבים, כשהשמש 6.5 מעלות מתחת לאופק. הנץ והשקיעה בגובה פני הים.
 */
function eliyahuHours(abs, city, hours) {
  var date = HDate.make(abs).date, L = { lat: city.lat, lng: city.lng, elevation: 0 };
  var sr = Zmanim.sunrise(date, L), ss = Zmanim.sunset(date, L);
  var alot = new Date(sr.getTime() - 1.5 * (ss - sr) / 12), tzeit = Zmanim.degreesAfter(date, L, 6.5);
  return new Date(alot.getTime() + (tzeit - alot) / 12 * hours);
}

function chametzPage() {
  var hy = todayH.hy;
  var abs = HDate.hebToAbs(hy, 1, 14);
  if (abs < TODAY) abs = HDate.hebToAbs(hy + 1, 1, 14);
  var h = HDate.make(abs), jeru = MAIN[0].city, fmtJ = timeFmt(jeru.tz), zj = zman(abs, jeru);
  function cols(hours) {
    return [['גר״א', function (c) { return zman(abs, c).gra(hours); }],
      ['מגן אברהם', function (c) { return zman(abs, c).mga(hours); }],
      ['הרב אליהו', function (c) { return eliyahuHours(abs, c, hours); }]];
  }
  var shabbat = h.dow === 6;
  var body =
    '<h1>סוף זמן אכילת חמץ ושריפת חמץ ' + esc(h.yearHeb) + '</h1>\n' +
    '<p class="lead">ערב פסח ' + esc(h.yearHeb) + ' חל ב' + esc(HDate.DAY_NAMES_FULL[h.dow]) + ', ' +
    esc(hebStr(h)) + ' — ' + esc(gregStr(h, true)) + '. בירושלים: סוף זמן אכילת חמץ ' + fmtJ(zj.mga(4)) +
    ' (מגן אברהם) או ' + fmtJ(zj.gra(4)) + ' (גר״א); סוף זמן ביעור חמץ ' + fmtJ(zj.mga(5)) + ' או ' +
    fmtJ(zj.gra(5)) + '.</p>\n' +
    (shabbat ? '<p class="note">השנה ערב פסח חל בשבת: שורפים את החמץ ביום שישי, ובשבת בבוקר מבטלים את ' +
      'החמץ עד סוף הזמן שבטבלה השנייה.</p>\n' : '') +
    '<section><h2>סוף זמן אכילת חמץ</h2>' + mainTable(cols(4)) +
    '<p class="note">סוף השעה הרביעית של היום.</p></section>\n' +
    '<section><h2>סוף זמן ביעור חמץ</h2>' + mainTable(cols(5)) +
    '<p class="note">סוף השעה החמישית של היום — עד אז שורפים את החמץ ומבטלים אותו.</p></section>\n' +
    '<section><h2>השיטות</h2>' +
    '<p>את היום מחלקים לשתים עשרה «שעות זמניות», והשאלה היא מאיזו נקודה מתחילים לספור:</p>' +
    '<p><b>הגר״א</b> — מהנץ החמה ועד השקיעה. זה הזמן המאוחר מבין השלושה.</p>' +
    '<p><b>מגן אברהם</b> — מעלות השחר, 72 דקות לפני הנץ, ועד צאת הכוכבים, 72 דקות אחרי השקיעה. ' +
    'מוקדם בכרבע שעה עד חצי שעה מהגר״א, ורבים נוהגים להחמיר כמותו בזמני החמץ.</p>' +
    '<p><b>שיטת הרב מרדכי אליהו</b> — גם היא מעלות השחר ועד צאת הכוכבים, אבל עלות השחר מוקדמת יותר ' +
    '(שעה וחצי זמנית לפני הנץ) וצאת הכוכבים קרובה לשקיעה (השמש 6.5 מעלות מתחת לאופק). כך השעות ' +
    'מתחילות מוקדם, והזמן מוקדם בכשלושת רבעי שעה עד שעה מהגר״א — המחמיר מבין השלושה.</p>' +
    '<p class="note">הזמנים מחושבים בגובה פני הים ומעוגלים כלפי מטה. כדאי לסיים מעט לפני הזמן ' +
    'שבטבלה, ובכל שאלה לשאול את רב הקהילה.</p></section>\n' +
    '<nav class="pager"><a href="/chagim/pesach/">→ פסח ' + esc(h.yearHeb) + '</a><span></span></nav>\n';

  write('chametz/index.html', page({
    url: 'chametz/',
    title: 'סוף זמן אכילת חמץ ושריפת חמץ ' + h.yearHeb + ' (' + h.gy + ') — לפי ערים | לוח עברי',
    description: 'ערב פסח ' + h.yearHeb + ', ' + gregStr(h, true) + '. סוף זמן אכילת חמץ בירושלים ' + fmtJ(zj.mga(4)) +
      ' (מג״א) / ' + fmtJ(zj.gra(4)) + ' (גר״א), וסוף זמן שריפת חמץ — לפי הגר״א, מגן אברהם ושיטת הרב מרדכי אליהו.',
    crumbs: [['לוח עברי', '/'], ['חגים ומועדים', '/chagim/'], ['פסח', '/chagim/pesach/'], ['סוף זמן חמץ', '/chametz/']],
    appHref: appLink({ date: iso(h), view: 'zman' }),
    appLabel: 'בלוח המלא',
    body: body
  }));
}

/* ---------- מפת האתר ---------- */
function sitemap(urls) {
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) {
      return '  <url>\n    <loc>' + SITE + u + '</loc>\n    <lastmod>' + ISO_TODAY + '</lastmod>\n  </url>\n';
    }).join('') + '</urlset>\n');
}

/* ---------- הרצה ---------- */
cities.forEach(cityPage);
citiesIndex();
chagimIndex(CHAGIM.map(chagPage));
parashaIndex(PARASHOT.map(parashaPage));
chametzPage();
sitemap([''].concat(
  ['zmanim/'], cities.map(function (x) { return 'zmanim/' + x.slug + '/'; }),
  ['parasha/'], PARASHOT.map(function (p) { return 'parasha/' + p[0] + '/'; }),
  ['chagim/'], CHAGIM.map(function (c) { return 'chagim/' + c.slug + '/'; }),
  ['chametz/']
));
console.log('נוצרו ' + cities.length + ' דפי יישובים, ' + PARASHOT.length + ' דפי פרשות ו־' + CHAGIM.length +
  ' דפי חגים, מתאריך ' + ISO_TODAY);
