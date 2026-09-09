/* holidays.js — חגים, מועדים, צומות, ראשי חודשים, ספירת העומר ופרשת השבוע. */
var Holidays = (function (H) {
  'use strict';

  var PARSHIOT = [
    'בראשית', 'נח', 'לך לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב',
    'מקץ', 'ויגש', 'ויחי', 'שמות', 'וארא', 'בא', 'בשלח', 'יתרו', 'משפטים', 'תרומה',
    'תצווה', 'כי תשא', 'ויקהל', 'פקודי', 'ויקרא', 'צו', 'שמיני', 'תזריע', 'מצורע',
    'אחרי מות', 'קדושים', 'אמור', 'בהר', 'בחוקותי', 'במדבר', 'נשא', 'בהעלותך',
    'שלח לך', 'קורח', 'חוקת', 'בלק', 'פינחס', 'מטות', 'מסעי', 'דברים', 'ואתחנן',
    'עקב', 'ראה', 'שופטים', 'כי תצא', 'כי תבוא', 'ניצבים', 'וילך', 'האזינו',
    'וזאת הברכה'
  ];
  // אינדקסים (0-בסיס) של צמדי הפרשיות המחוברות
  var VAYAKHEL = 21, PEKUDEI = 22, TAZRIA = 26, METZORA = 27, ACHAREI = 28,
    KEDOSHIM = 29, BEHAR = 31, BECHUKOTAI = 32, BAMIDBAR = 33, CHUKAT = 38,
    BALAK = 39, MATOT = 41, MASEI = 42, DEVARIM = 43, NITZAVIM = 50,
    VAYELECH = 51, HAAZINU = 52;

  function isShabbatOff(hy, hm, hd, israel) {
    // שבתות שבהן קוראים קריאת מועד ולא פרשת השבוע
    if (hm === 7) { // תשרי
      if (hd === 1 || hd === 2 || hd === 10) return true;
      if (hd >= 15 && hd <= (israel ? 22 : 23)) return true;
    }
    if (hm === 1 && hd >= 15 && hd <= (israel ? 21 : 22)) return true; // ניסן
    if (hm === 3 && (hd === 6 || (!israel && hd === 7))) return true;  // סיוון
    return false;
  }

  /** כל שבתות "פרשת השבוע" הזמינות במחזור הקריאה של שנה עברית */
  function shabbatotOfYear(hy, israel) {
    var simchat = H.hebToAbs(hy, 7, israel ? 22 : 23);
    var nextSimchat = H.hebToAbs(hy + 1, 7, israel ? 22 : 23);
    var list = [];
    var a = simchat + 1;
    while (((a % 7) + 7) % 7 !== 6) a++; // השבת הראשונה אחרי שמחת תורה
    for (; a < nextSimchat; a += 7) {
      var h = H.absToHeb(a);
      if (!isShabbatOff(h.y, h.m, h.d, israel)) list.push(a);
    }
    return list;
  }

  function shabbatOnOrBefore(abs) { return abs - (((abs % 7) + 7) % 7 === 6 ? 0 : (((abs % 7) + 7) % 7) + 1); }

  /** מפה: abs של שבת -> תיאור הפרשה, לכל שנה עברית */
  var sedraCache = {};
  function sedraForYear(hy, israel) {
    var key = hy + (israel ? 'i' : 'd');
    if (sedraCache[key]) return sedraCache[key];

    var shabbatot = shabbatotOfYear(hy, israel);
    var leap = H.isLeapYear(hy);

    // האם ניצבים־וילך מחוברות: תלוי במספר השבתות שבין ראש השנה לשמחת תורה.
    // שתי שבתות → וילך נקראת לבדה בשבת שובה; שבת אחת → מחברים.
    var lastBeforeRH = shabbatOnOrBefore(H.hebToAbs(hy + 1, 7, 1) - 1);
    var afterRH = 0;
    shabbatot.forEach(function (a) { if (a > lastBeforeRH) afterRH++; });
    var combineNV = afterRH < 2;

    // מספר החיבורים הדרוש: 53 פרשיות (בראשית..האזינו) על פני השבתות הזמינות
    var needed = 53 - shabbatot.length;
    var order = leap
      ? (israel ? [MATOT, BEHAR] : [CHUKAT, MATOT, BEHAR])
      : (israel ? [VAYAKHEL, TAZRIA, ACHAREI, MATOT, BEHAR]
                : [VAYAKHEL, TAZRIA, ACHAREI, MATOT, BEHAR, CHUKAT]);

    var combos = {};
    var remaining = needed;
    if (combineNV) { combos[NITZAVIM] = true; remaining--; }
    for (var i = 0; i < order.length && remaining > 0; i++) {
      combos[order[i]] = true;
      remaining--;
    }

    // בניית רצף הקריאה
    var result = {};
    var idx = 0;
    for (var s = 0; s < shabbatot.length && idx <= HAAZINU; s++) {
      if (combos[idx]) {
        result[shabbatot[s]] = { idx: idx, combined: true, name: PARSHIOT[idx] + '־' + PARSHIOT[idx + 1] };
        idx += 2;
      } else {
        result[shabbatot[s]] = { idx: idx, combined: false, name: PARSHIOT[idx] };
        idx += 1;
      }
    }
    result._meta = {
      complete: idx === HAAZINU + 1, leap: leap, slots: shabbatot.length,
      needed: needed, unplaced: remaining, combineNV: combineNV,
      first: shabbatot[0], last: shabbatot[shabbatot.length - 1],
      anchors: {
        beforeShavuot: shabbatOnOrBefore(H.hebToAbs(hy, 3, 6) - 1),
        chazon: shabbatOnOrBefore(H.hebToAbs(hy, 5, 9)),
        beforeRH: lastBeforeRH
      }
    };
    sedraCache[key] = result;
    return result;
  }

  /** פרשת השבוע עבור שבת מסוימת (abs). מחזיר null אם אין פרשה. */
  function parashaForShabbat(abs, israel) {
    var h = H.absToHeb(abs);
    // מחזור הקריאה מתחיל בשמחת תורה — קובעים לאיזו "שנת קריאה" השבת שייכת
    var hy = h.y;
    var simchat = H.hebToAbs(hy, 7, israel ? 22 : 23);
    if (abs <= simchat) hy = hy - 1;
    var sedra = sedraForYear(hy, israel);
    return sedra[abs] || null;
  }

  /** תיאור השבת הקרובה: פרשה, או שם המועד כשאין קריאת פרשה */
  function upcomingShabbat(abs, israel) {
    var sh = abs + ((6 - (((abs % 7) + 7) % 7)) % 7); // השבת הקרובה (כולל היום אם שבת)
    var p = parashaForShabbat(sh, israel);
    if (p) return { abs: sh, label: 'פרשת ' + p.name, name: p.name, isParasha: true };
    var h = H.absToHeb(sh);
    var items = holidaysFor(h.y, h.m, h.d, israel);
    var name = items.length ? items[0].name : specialShabbat(h.y, h.m, h.d, israel);
    return { abs: sh, label: name ? 'שבת ' + name : 'שבת', name: name || '', isParasha: false };
  }

  /* ---------- חגים ומועדים ---------- */
  function dow(abs) { return ((abs % 7) + 7) % 7; }

  /** מספר החודש העברי הבא */
  function nextMonth(hm, hy) {
    if (hm === 6) return 7;
    if (hm === 12) return H.isLeapYear(hy) ? 13 : 1;
    if (hm === 13) return 1;
    return hm + 1;
  }

  /** רשימת אירועים לתאריך עברי נתון */
  function holidaysFor(hy, hm, hd, israel) {
    var out = [];
    var abs = H.hebToAbs(hy, hm, hd);
    var d = dow(abs);
    var leap = H.isLeapYear(hy);
    var adar = leap ? 13 : 12;
    function add(name, kind) { out.push({ name: name, kind: kind }); }

    // ראש חודש
    if (hd === 1 && hm !== 7) add('ראש חודש ' + H.monthName(hm, hy), 'roshchodesh');
    if (hd === 30) add('ראש חודש ' + H.monthName(nextMonth(hm, hy), hy), 'roshchodesh');

    switch (hm) {
      case 7: // תשרי
        if (hd === 1) add('ראש השנה', 'yomtov');
        if (hd === 2) add('ראש השנה — יום ב׳', 'yomtov');
        if (hd === 3 && d !== 6) add('צום גדליה', 'fast');
        if (hd === 4 && d === 0) add('צום גדליה (נדחה)', 'fast');
        if (hd === 9) add('ערב יום כיפור', 'erev');
        if (hd === 10) add('יום הכיפורים', 'yomtov');
        if (hd === 14) add('ערב סוכות', 'erev');
        if (hd === 15) add('סוכות', 'yomtov');
        if (hd === 16) add(israel ? 'חול המועד סוכות' : 'סוכות — יום ב׳', israel ? 'cholhamoed' : 'yomtov');
        if (hd >= 17 && hd <= 20) add('חול המועד סוכות', 'cholhamoed');
        if (hd === 21) add('הושענא רבה', 'cholhamoed');
        if (hd === 22) add(israel ? 'שמיני עצרת · שמחת תורה' : 'שמיני עצרת', 'yomtov');
        if (hd === 23 && !israel) add('שמחת תורה', 'yomtov');
        break;
      case 9: // כסלו
        if (hd === 24) add('ערב חנוכה', 'erev');
        if (hd >= 25) add('חנוכה — יום ' + H.num2heb(hd - 24, true), 'chanukah');
        break;
      case 10: // טבת
        var kislevLen = H.daysInMonth(9, hy);
        var dayBase = kislevLen === 30 ? 6 : 5;
        if (hd <= (kislevLen === 30 ? 2 : 3)) add('חנוכה — יום ' + H.num2heb(dayBase + hd, true), 'chanukah');
        if (hd === 10) add('צום עשרה בטבת', 'fast');
        break;
      case 11: // שבט
        if (hd === 15) add('ט״ו בשבט', 'minor');
        break;
      case 12: // אדר / אדר א׳
        if (leap) {
          if (hd === 14) add('פורים קטן', 'minor');
          if (hd === 15) add('שושן פורים קטן', 'minor');
        }
        break;
    }

    // פורים ותענית אסתר (אדר בפשוטה, אדר ב׳ במעוברת)
    if (hm === adar) {
      if (hd === 13 && d !== 6) add('תענית אסתר', 'fast');
      if (hd === 11 && d === 4) add('תענית אסתר (מוקדם)', 'fast');
      if (hd === 14) add('פורים', 'minor');
      if (hd === 15) add('שושן פורים', 'minor');
    }

    if (hm === 1) { // ניסן
      if (hd === 14) add('ערב פסח', 'erev');
      if (hd === 15) add('פסח', 'yomtov');
      if (hd === 16) add(israel ? 'חול המועד פסח' : 'פסח — יום ב׳', israel ? 'cholhamoed' : 'yomtov');
      if (hd >= 17 && hd <= 20) add('חול המועד פסח', 'cholhamoed');
      if (hd === 21) add('שביעי של פסח', 'yomtov');
      if (hd === 22 && !israel) add('אחרון של פסח', 'yomtov');
      // יום הזיכרון לשואה ולגבורה
      if (hd === 27 && d !== 5 && d !== 0) add('יום הזיכרון לשואה ולגבורה', 'modern');
      if (hd === 26 && d === 4) add('יום הזיכרון לשואה ולגבורה', 'modern');
      if (hd === 28 && d === 1) add('יום הזיכרון לשואה ולגבורה', 'modern');
    }

    if (hm === 2) { // אייר
      var atz = yomHaatzmautAbs(hy);
      if (abs === atz - 1) add('יום הזיכרון לחללי מערכות ישראל', 'modern');
      if (abs === atz) add('יום העצמאות', 'modern');
      if (hd === 14) add('פסח שני', 'minor');
      if (hd === 18) add('ל״ג בעומר', 'minor');
      if (hd === 28) add('יום ירושלים', 'modern');
    }

    if (hm === 3) { // סיוון
      if (hd === 5) add('ערב שבועות', 'erev');
      if (hd === 6) add('שבועות', 'yomtov');
      if (hd === 7 && !israel) add('שבועות — יום ב׳', 'yomtov');
    }

    if (hm === 4) { // תמוז
      if (hd === 17 && d !== 6) add('צום י״ז בתמוז', 'fast');
      if (hd === 18 && d === 0) add('צום י״ז בתמוז (נדחה)', 'fast');
    }

    if (hm === 5) { // אב
      if (hd === 9 && d !== 6) add('תשעה באב', 'fast');
      if (hd === 10 && d === 0) add('תשעה באב (נדחה)', 'fast');
      if (hd === 15) add('ט״ו באב', 'minor');
    }

    if (hm === 6 && hd === 29) add('ערב ראש השנה', 'erev');

    return out;
  }

  /** כמה נרות מדליקים בצאת היום הזה (0 = לא מדליקים) */
  function chanukahCandles(hy, hm, hd) {
    var kislevLen = H.daysInMonth(9, hy);
    if (hm === 9 && hd >= 24) return hd - 23;
    if (hm === 10) {
      var n = (kislevLen === 30 ? 6 : 5) + hd + 1;
      return n <= 8 ? n : 0;
    }
    return 0;
  }

  /** יום העצמאות — כולל דחיות מפני השבת */
  function yomHaatzmautAbs(hy) {
    var abs = H.hebToAbs(hy, 2, 5);
    var d = dow(abs);
    if (d === 6) return abs - 2;       // חל בשבת → הוקדם ליום ה׳
    if (d === 5) return abs - 1;       // חל בשישי → הוקדם ליום ה׳
    if (d === 1) return abs + 1;       // חל בשני → נדחה ליום ג׳
    return abs;
  }

  /** ספירת העומר — מספר היום, או 0 */
  function omerDay(hy, hm, hd) {
    var abs = H.hebToAbs(hy, hm, hd);
    var start = H.hebToAbs(hy, 1, 16); // ט"ז בניסן = יום ראשון לעומר
    var n = abs - start + 1;
    return (n >= 1 && n <= 49) ? n : 0;
  }

  function omerText(n) {
    if (!n) return '';
    var weeks = Math.floor(n / 7), days = n % 7;
    var s = 'היום ' + (n === 1 ? 'יום אחד' : H.num2heb(n, false) + ' ימים').replace('יום אחד', 'יום אחד');
    if (n === 1) s = 'היום יום אחד';
    else if (n === 2) s = 'היום שני ימים';
    else s = 'היום ' + n + ' ימים';
    if (n >= 7) {
      s += ', שהם ';
      s += weeks === 1 ? 'שבוע אחד' : weeks + ' שבועות';
      if (days) s += ' ו' + (days === 1 ? 'יום אחד' : days + ' ימים');
    }
    return s + ' לעומר';
  }

  /** שבתות מיוחדות */
  function specialShabbat(hy, hm, hd, israel) {
    var abs = H.hebToAbs(hy, hm, hd);
    if (dow(abs) !== 6) return null;
    var leap = H.isLeapYear(hy);
    var adar = leap ? 13 : 12;

    if (hm === 7 && hd > 2 && hd < 10) return 'שבת שובה';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, adar, 1))) return 'שבת שקלים';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, adar, 13))) return 'שבת זכור';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, 1, 1) - 8)) return 'שבת פרה';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, 1, 1))) return 'שבת החודש';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, 1, 15) - 1)) return 'שבת הגדול';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, 5, 9)) ) return 'שבת חזון';
    if (abs === shabbatOnOrBefore(H.hebToAbs(hy, 5, 9)) + 7) return 'שבת נחמו';
    return null;
  }

  /** שבת מברכים החודש (השבת שלפני ראש חודש; אין מברכים את תשרי) */
  function isShabbatMevarchim(hy, hm, hd) {
    if (dow(H.hebToAbs(hy, hm, hd)) !== 6) return false;
    if (hm === 6) return false;
    return hd >= H.daysInMonth(hm, hy) - 6;
  }

  /** תיאור מלא ליום */
  function forDate(hd_, israel) {
    var items = holidaysFor(hd_.hy, hd_.hm, hd_.hd, israel);
    var sp = specialShabbat(hd_.hy, hd_.hm, hd_.hd, israel);
    var par = hd_.dow === 6 ? parashaForShabbat(hd_.abs, israel) : null;
    return {
      items: items,
      special: sp,
      parasha: par,
      omer: omerDay(hd_.hy, hd_.hm, hd_.hd),
      candles: chanukahCandles(hd_.hy, hd_.hm, hd_.hd),
      mevarchim: isShabbatMevarchim(hd_.hy, hd_.hm, hd_.hd)
    };
  }

  return {
    PARSHIOT: PARSHIOT,
    sedraForYear: sedraForYear,
    parashaForShabbat: parashaForShabbat,
    upcomingShabbat: upcomingShabbat, chanukahCandles: chanukahCandles,
    holidaysFor: holidaysFor,
    specialShabbat: specialShabbat,
    isShabbatMevarchim: isShabbatMevarchim, nextMonth: nextMonth,
    omerDay: omerDay, omerText: omerText,
    yomHaatzmautAbs: yomHaatzmautAbs,
    shabbatotOfYear: shabbatotOfYear,
    forDate: forDate
  };
})(typeof HDate !== 'undefined' ? HDate : require('./hdate.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = Holidays;
