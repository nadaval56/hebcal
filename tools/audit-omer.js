#!/usr/bin/env node
/* audit-omer.js — בדיקת תזכורות ספירת העומר וקובץ היומן.
   רצה ב־Node בלבד, בלי דפדפן: node tools/audit-omer.js

   הבדיקה המרכזית אינה «האם יש 49 תזכורות» אלא «האם כל תזכורת נופלת בערב
   שבו נפתח היום העברי הנכון». זו הבדיקה היחידה שתופסת הזזה של יום — והיא
   בדיוק המלכודת המתועדת ב־README: מועד התזכורת הוא abs(ט"ז בניסן) + N − 2. */

var H = require('../js/hdate.js');
var Hol = require('../js/holidays.js');
var R = require('../js/remind.js');

var YEARS = 120;              // טווח שנים עבריות לבדיקה
var FIRST = 5780;
var fails = 0, checks = 0;

function fail(msg) { fails++; if (fails <= 25) console.log('  ✗ ' + msg); }
function ok(cond, msg) { checks++; if (!cond) fail(msg); }

/* ---------- 1. מועד התזכורת מול הלוח העברי ---------- */
for (var i = 0; i < YEARS; i++) {
  var hy = FIRST + i;
  var all = R.seasonOf(hy, { skipShabbat: false, israel: true });

  ok(all.length === 49, hy + ': ' + all.length + ' תזכורות במקום 49');

  for (var j = 0; j < all.length; j++) {
    var r = all[j];
    var opens = H.absToHeb(r.abs + 1);          // היום העברי שנפתח בערב הזה

    // ליל יום N לעומר הוא הערב שבו נפתח היום שספירתו N
    ok(Hol.omerDay(opens.y, opens.m, opens.d) === r.n,
      hy + ' יום ' + r.n + ': הערב נפתח יום שספירתו ' +
      Hol.omerDay(opens.y, opens.m, opens.d));

    // ...וזה ט"ז בניסן + (N-1)
    var want = H.absToHeb(H.hebToAbs(hy, 1, 16) + r.n - 1);
    ok(opens.y === want.y && opens.m === want.m && opens.d === want.d,
      hy + ' יום ' + r.n + ': נפתח ' + opens.d + '/' + opens.m +
      ' במקום ' + want.d + '/' + want.m);

    if (j > 0) ok(r.abs === all[j - 1].abs + 1, hy + ' יום ' + r.n + ': אינו עוקב');
  }

  // הספירה האחרונה בליל ה' בסיוון; שבועות (ו' בסיוון) מחוץ לתקופה
  var last = H.absToHeb(all[48].abs + 1);
  ok(last.m === 3 && last.d === 5, hy + ': הספירה ה־49 נפתחת ' + last.d + '/' + last.m);
  for (var k = 0; k < all.length; k++) {
    var o = H.absToHeb(all[k].abs + 1);
    ok(!(o.m === 3 && o.d === 6), hy + ': תזכורת בליל שבועות');
  }
}

/* ---------- 2. הדילוגים ---------- */
/* לא נבדק כאן מספר קבוע: 49 ימים רצופים הם שבעה שבועות שלמים, ולכן יש בהם
   תמיד 7 לילות שבת — אבל ליל יום טוב עשוי ליפול בעצמו בליל שבת, ואז שני
   הדילוגים חופפים והמספר גדל. הבדיקה היא על התכונה: נשמר בדיוק מה שאינו
   ליל שבת ואינו ליל יום טוב — לא פחות (דילוג חסר) ולא יותר (דילוג עודף). */
function isYomTovNight(abs, israel) {
  var o = H.absToHeb(abs + 1);
  if (o.m !== 1) return false;
  if (o.d === 21) return true;                              // שביעי של פסח
  return !israel && (o.d === 16 || o.d === 22);             // יו"ט שני של גלויות
}

for (i = 0; i < YEARS; i++) {
  hy = FIRST + i;
  [true, false].forEach(function (israel) {
    var where = israel ? 'ארץ' : 'חו״ל';
    var all = R.seasonOf(hy, { skipShabbat: false, israel: israel });
    var kept = R.seasonOf(hy, { skipShabbat: true, israel: israel });
    var keptN = {};
    kept.forEach(function (r) { keptN[r.n] = true; });

    var fridays = 0, motzash = 0;
    for (var j = 0; j < all.length; j++) {
      var r = all[j];
      var shabbat = R.dow(r.abs) === 5;                     // ליל שבת = יום שישי
      var yomtov = isYomTovNight(r.abs, israel);
      if (shabbat) fridays++;
      if (R.dow(r.abs) === 6 && !yomtov) motzash++;         // מוצאי שבת

      if (shabbat || yomtov) {
        ok(!keptN[r.n], hy + ' ' + where + ': יום ' + r.n + ' לא דולג');
      } else {
        ok(keptN[r.n], hy + ' ' + where + ': יום ' + r.n + ' דולג בלי סיבה');
      }
    }

    ok(fridays === 7, hy + ' ' + where + ': ' + fridays + ' לילות שבת במקום 7');
    // מוצאי שבת נשמר תמיד — סופרים בו וצריך את התזכורת
    var keptMotzash = kept.filter(function (r) { return R.dow(r.abs) === 6; }).length;
    ok(keptMotzash === motzash,
      hy + ' ' + where + ': ' + keptMotzash + ' מוצאי שבת נשמרו מתוך ' + motzash);
  });
}

/* ---------- 3. שנת הספירה הבאה ---------- */
for (i = 0; i < YEARS; i++) {
  hy = FIRST + i;
  var start = H.hebToAbs(hy, 1, 16);
  ok(R.nextSeasonYear(start - 1) === hy, hy + ': ערב הספירה הראשון שויך לשנה אחרת');
  ok(R.nextSeasonYear(start + 47) === hy, hy + ': ערב הספירה האחרון שויך לשנה אחרת');
  ok(R.nextSeasonYear(start + 48) === hy + 1, hy + ': התקופה שחלפה לא הוחלפה בבאה');
}

/* ---------- 4. הקובץ ---------- */
var rem = R.omerReminders({ fromAbs: H.dateToAbs(new Date()), israel: true, skipShabbat: true });
var ics = R.buildIcs(rem, { time: '20:30', version: 'test' });

ok(rem.length > 0, 'אין תזכורות כלל');
ok(/^BEGIN:VCALENDAR\r\n/.test(ics), 'הקובץ אינו נפתח ב־VCALENDAR');
ok(/END:VCALENDAR\r\n$/.test(ics), 'הקובץ אינו נסגר ב־VCALENDAR');
ok(!/[^\r]\n/.test(ics), 'יש שורה שאינה מסתיימת ב־CRLF');
ok((ics.match(/BEGIN:VEVENT/g) || []).length === rem.length, 'מספר VEVENT אינו תואם');
ok((ics.match(/BEGIN:VEVENT/g) || []).length ===
  (ics.match(/END:VEVENT/g) || []).length, 'VEVENT לא מאוזן');
ok((ics.match(/BEGIN:VALARM/g) || []).length === rem.length, 'לא לכל אירוע יש התראה');

var lines = ics.split('\r\n');
var long = lines.filter(function (l) { return Buffer.byteLength(l, 'utf8') > 75; });
ok(long.length === 0, long.length + ' שורות מעל 75 אוקטטים');

var uids = ics.match(/^UID:.*$/gm) || [];
ok(new Set(uids).size === uids.length, 'יש UID כפול');

/* ה־UID חייב להיות יציב בין ייצוא לייצוא, וגם אחרי שינוי השעה — אחרת
   ייבוא חוזר משכפל את כל האירועים במקום לעדכן אותם. */
var again = (R.buildIcs(rem, { time: '20:30', version: 'test' }).match(/^UID:.*$/gm) || []);
ok(String(again) === String(uids), 'ה־UID אינו יציב בין שני ייצואים זהים');
var other = (R.buildIcs(rem, { time: '21:15', version: 'test' }).match(/^UID:.*$/gm) || []);
ok(String(other) === String(uids), 'שינוי השעה שינה את ה־UID');

// ביטול הקיפול חייב להחזיר את הטקסט העברי בשלמותו
var un = ics.replace(/\r\n[ \t]/g, '');
ok(un.indexOf('�') === -1, 'רצף UTF-8 נחתך בקיפול');
for (i = 0; i < rem.length; i++) {
  var want = 'DESCRIPTION:' + R.escText(Hol.omerText(rem[i].n));
  ok(un.indexOf(want) !== -1, 'נוסח הספירה ליום ' + rem[i].n + ' אינו שלם בקובץ');
}

// שעה צפה: בלי TZID ובלי Z
ok(/^DTSTART:\d{8}T\d{6}$/m.test(un), 'DTSTART אינו שעה צפה');
ok(!/DTSTART;TZID/.test(un), 'יש TZID — נדרש גוש VTIMEZONE');
ok(!/^DTSTART:.*Z$/m.test(un), 'DTSTART ב־UTC במקום שעה מקומית');

// כל התזכורות בשעה שנבחרה, ובעתיד
var starts = un.match(/^DTSTART:(\d{8})T(\d{6})$/gm) || [];
ok(starts.length === rem.length, 'מספר DTSTART אינו תואם');
ok(starts.every(function (s) { return /T203000$/.test(s); }), 'לא כל התזכורות ב־20:30');
var todayStr = (function () {
  var g = H.absToGreg(H.dateToAbs(new Date()));
  return '' + g.y + (g.m < 10 ? '0' : '') + g.m + (g.d < 10 ? '0' : '') + g.d;
})();
ok(starts.every(function (s) { return s.slice(8, 16) >= todayStr; }), 'יש תזכורת בעבר');

console.log('ספירת העומר: ' + checks + ' בדיקות, ' + fails + ' כשלו');
process.exit(fails ? 1 : 0);
