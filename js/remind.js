/* remind.js — תזכורות ספירת העומר: חישוב מועדי התזכורת וייצור קובץ יומן (ICS)

   הרעיון: הדפדפן אינו יכול לתזמן התראה לעתיד — אין לכך API באף דפדפן
   (Notification Triggers של כרום ננטש, ול־Safari אין תזכורות מקומיות כלל).
   לכן האפליקציה אינה מתזמנת בעצמה, אלא מייצרת קובץ יומן תקני שהמשתמש
   מייבא ליומן של הטלפון — ומערכת ההפעלה היא שמתריעה. זה עובד במסך נעול,
   בלי רשת, ובלי חשבון או הרשאה כלשהי.

   הערת זמנים: הספירה היא בלילה, וליל יום N לעומר הוא הערב שבו נפתח היום
   העברי — כלומר הערב של היום הלועזי הקודם. משום כך מועד התזכורת ליום N
   הוא ‎abs(ט"ז בניסן) + N − 2‎ ולא ‎+ N − 1‎. */
var Remind = (function (H, Hol) {
  'use strict';

  var DOMAIN = 'heb-cal.co.il';
  var SEASONS = 3;          // כמה תקופות ספירה נכנסות לקובץ אחד
  var EVENT_MINUTES = 15;   // אורך האירוע ביומן; התזכורת עצמה בתחילתו

  function dow(abs) { return ((abs % 7) + 7) % 7; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * ימים שבהם הערב הוא ליל יום טוב, בתוך תקופת הספירה.
   * בארץ — שביעי של פסח בלבד; בחו״ל גם שני ימי יום טוב שני של גלויות.
   * שבועות אינו ברשימה: הספירה האחרונה היא בליל ה׳ בסיוון, ושבועות
   * (ו׳ בסיוון) כבר מחוץ לתקופה.
   */
  function isYomTovNight(hebDay, israel) {
    if (hebDay === 21) return true;                        // שביעי של פסח
    if (!israel && (hebDay === 16 || hebDay === 22)) return true;
    return false;
  }

  /** תקופת הספירה של שנה עברית אחת: 49 מועדי תזכורת, לפני הסינון */
  function seasonOf(hy, o) {
    var start = H.hebToAbs(hy, 1, 16);   // ט"ז בניסן — היום הראשון לעומר
    var out = [];
    for (var n = 1; n <= 49; n++) {
      var abs = start + n - 2;           // ערב הספירה
      if (o.fromAbs != null && abs < o.fromAbs) continue;
      if (o.skipShabbat) {
        if (dow(abs) === 5) continue;                        // ליל שבת
        var opens = H.absToHeb(abs + 1);                     // היום העברי שנפתח בערב הזה
        if (opens.m === 1 && isYomTovNight(opens.d, o.israel)) continue;
      }
      out.push({ hy: hy, n: n, abs: abs });
    }
    return out;
  }

  /**
   * שנת הספירה הבאה: אם תקופת השנה הנוכחית כבר חלפה כולה — השנה הבאה.
   * (ניסן הוא חודש 1 אך חל אחרי תשרי באותה שנה עברית, ולכן בסתיו
   * השנה ה"נוכחית" היא זו שספירתה כבר מאחורינו.)
   */
  function nextSeasonYear(fromAbs) {
    var hy = H.absToHeb(fromAbs).y;
    var lastReminder = H.hebToAbs(hy, 1, 16) + 47;   // ערב הספירה ה־49
    return fromAbs > lastReminder ? hy + 1 : hy;
  }

  /** כל מועדי התזכורת, לאורך כמה תקופות ספירה */
  function omerReminders(opts) {
    var o = opts || {};
    var from = o.fromAbs != null ? o.fromAbs : 0;
    var count = o.seasons || SEASONS;
    var first = nextSeasonYear(from);
    var out = [];
    for (var i = 0; i < count; i++) {
      out = out.concat(seasonOf(first + i, {
        fromAbs: from, skipShabbat: o.skipShabbat !== false, israel: o.israel !== false
      }));
    }
    return out;
  }

  /** טווח השנים בגימטריה, למשל "תשפ״ז–תשפ״ט" */
  function seasonsLabel(reminders) {
    if (!reminders.length) return '';
    var a = reminders[0].hy, b = reminders[reminders.length - 1].hy;
    return a === b ? H.yearHeb(a) : H.yearHeb(a) + '–' + H.yearHeb(b);
  }

  /* ================= ICS ================= */

  /** ‎\ ; , ושורה חדשה — תווים בעלי משמעות בתקן, ויש לברוח מהם */
  function escText(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** פיצול למחרוזות של נקודת־קוד אחת, כדי לא לחתוך זוג surrogate */
  function codePoints(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { out.push(s.slice(i, i + 2)); i += 2; }
      else { out.push(s.charAt(i)); i++; }
    }
    return out;
  }

  function utf8Len(ch) {
    var c = ch.codePointAt ? ch.codePointAt(0) : ch.charCodeAt(0);
    if (c < 0x80) return 1;
    if (c < 0x800) return 2;
    if (c < 0x10000) return 3;
    return 4;
  }

  /**
   * קיפול שורות לפי התקן: עד 75 אוקטטים לשורה, וההמשך פותח ברווח.
   * המדידה היא באוקטטים ולא בתווים — טקסט עברי הוא דו־בתי ב־UTF-8,
   * ומדידה בתווים הייתה יוצרת שורות ארוכות מן המותר. כמו כן אין לחתוך
   * באמצע רצף UTF-8, ולכן מקפלים בגבול נקודת־קוד.
   */
  function fold(line) {
    var chars = codePoints(line);
    var out = '', len = 0;
    for (var i = 0; i < chars.length; i++) {
      var w = utf8Len(chars[i]);
      if (len + w > 75) { out += '\r\n '; len = 1; }   // הרווח הפותח נספר גם הוא
      out += chars[i];
      len += w;
    }
    return out;
  }

  /** חותמת UTC, למשל 20260910T061500Z */
  function stampUtc(dt) {
    return dt.getUTCFullYear() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate()) + 'T' +
      pad2(dt.getUTCHours()) + pad2(dt.getUTCMinutes()) + pad2(dt.getUTCSeconds()) + 'Z';
  }

  /**
   * שעה "צפה" — בלי אזור זמן ובלי Z. משמעותה בתקן היא «השעה הזאת לפי
   * השעון המקומי», וזו בדיוק הסמנטיקה הנכונה כאן: תזכורת ב־20:30 היא
   * ב־20:30 היכן שהמשתמש נמצא. כך גם נחסך גוש VTIMEZONE עם כללי שעון
   * קיץ, שכל טעות בו הייתה מזיזה את כל התזכורות בשעה.
   */
  function floating(abs, hh, mm) {
    var g = H.absToGreg(abs);
    return g.y + pad2(g.m) + pad2(g.d) + 'T' + pad2(hh) + pad2(mm) + '00';
  }

  function parseTime(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return { h: 20, m: 30 };
    var h = +m[1], mi = +m[2];
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return { h: 20, m: 30 };
    return { h: h, m: mi };
  }

  function addMinutes(hh, mm, add) {
    var t = hh * 60 + mm + add;
    return { h: Math.floor(t / 60) % 24, m: t % 60, over: Math.floor(t / 1440) };
  }

  /**
   * קובץ יומן עם כל התזכורות.
   * ה־UID קבוע לכל ספירה ולכל שנה, ולכן ייבוא חוזר של קובץ מעודכן
   * (למשל אחרי שינוי השעה) מעדכן את האירועים הקיימים במקום לשכפל אותם.
   */
  function buildIcs(reminders, opts) {
    var o = opts || {};
    var t = parseTime(o.time);
    var now = stampUtc(new Date());
    var version = o.version ? '//' + o.version : '';
    var L = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//' + DOMAIN + '//Luach' + version + '//HE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escText('לוח — ספירת העומר'),
      'X-WR-CALDESC:' + escText('תזכורת יומית לספירת העומר, מתוך היישום «לוח» — ' + DOMAIN)
    ];

    for (var i = 0; i < reminders.length; i++) {
      var r = reminders[i];
      var end = addMinutes(t.h, t.m, EVENT_MINUTES);
      var text = Hol.omerText(r.n);
      L.push('BEGIN:VEVENT');
      L.push('UID:omer-' + r.hy + '-' + r.n + '@' + DOMAIN);
      L.push('DTSTAMP:' + now);
      L.push('DTSTART:' + floating(r.abs, t.h, t.m));
      L.push('DTEND:' + floating(r.abs + end.over, end.h, end.m));
      L.push('SUMMARY:' + escText('ספירת העומר · היום ' + r.n + ' לעומר'));
      L.push('DESCRIPTION:' + escText(text + '.'));
      L.push('TRANSP:TRANSPARENT');   // אינו תופס את היומן כ"עסוק"
      L.push('BEGIN:VALARM');
      L.push('ACTION:DISPLAY');
      L.push('TRIGGER:-PT0M');
      L.push('DESCRIPTION:' + escText(text));
      L.push('END:VALARM');
      L.push('END:VEVENT');
    }

    L.push('END:VCALENDAR');

    var out = [];
    for (var j = 0; j < L.length; j++) out.push(fold(L[j]));
    return out.join('\r\n') + '\r\n';
  }

  return {
    SEASONS: SEASONS,
    dow: dow,
    seasonOf: seasonOf,
    nextSeasonYear: nextSeasonYear,
    omerReminders: omerReminders,
    seasonsLabel: seasonsLabel,
    parseTime: parseTime,
    escText: escText,
    fold: fold,
    buildIcs: buildIcs
  };
})(typeof HDate !== 'undefined' ? HDate : require('./hdate.js'),
   typeof Holidays !== 'undefined' ? Holidays : require('./holidays.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = Remind;
