/* hdate.js — המרת תאריכים עבריים/לועזיים, שמות חודשים וגימטריה.
   מבוסס על האלגוריתם הקלאסי של לוח השנה העברי (מולד + דחיות). */
var HDate = (function () {
  'use strict';

  var HEB_EPOCH = -1373428; // היסט לימים מוחלטים (RD)

  var MONTH_NAMES = {
    1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
    7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
    12: 'אדר', 13: 'אדר ב׳'
  };
  var MONTH_NAME_LEAP_12 = 'אדר א׳';

  var GREG_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  var DAY_NAMES = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
  var DAY_NAMES_FULL = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי',
    'יום חמישי', 'יום שישי', 'שבת קודש'];

  function isGregLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /* --- ימים מוחלטים (RD) --- */
  function gregToAbs(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 719163;
  }
  function absToGreg(abs) {
    var dt = new Date((abs - 719163) * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  function absToDate(abs) { // Date מקומי בחצות
    var g = absToGreg(abs);
    return new Date(g.y, g.m - 1, g.d);
  }
  function dateToAbs(dt) { return gregToAbs(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }

  /* --- שנה עברית --- */
  function isLeapYear(y) { return ((7 * y + 1) % 19) < 7; }
  function monthsInYear(y) { return isLeapYear(y) ? 13 : 12; }

  function elapsedDays(year) {
    var monthsElapsed = Math.floor((235 * year - 234) / 19);
    var partsElapsed = 12084 + 13753 * monthsElapsed;
    var day = monthsElapsed * 29 + Math.floor(partsElapsed / 25920);
    if (((3 * (day + 1)) % 7) < 3) day += 1; // דחיית מולד זקן / לא אד"ו ראש
    return day;
  }
  function calendarElapsedDays(year) {
    var last = elapsedDays(year - 1);
    var present = elapsedDays(year);
    var next = elapsedDays(year + 1);
    if (next - present === 356) return present + 2;      // דחיית גטר"ד
    if (present - last === 382) return present + 1;      // דחיית בט"ו תקפ"ט
    return present;
  }
  function newYearAbs(year) { return calendarElapsedDays(year) + HEB_EPOCH + 1; } // א׳ תשרי
  function daysInYear(year) { return newYearAbs(year + 1) - newYearAbs(year); }
  function longCheshvan(year) { return daysInYear(year) % 10 === 5; }   // 355 / 385
  function shortKislev(year) { return daysInYear(year) % 10 === 3; }    // 353 / 383

  function daysInMonth(month, year) {
    if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
    if (month === 12 && !isLeapYear(year)) return 29;
    if (month === 8 && !longCheshvan(year)) return 29;
    if (month === 9 && shortKislev(year)) return 29;
    return 30;
  }

  function monthName(month, year) {
    if (month === 12 && isLeapYear(year)) return MONTH_NAME_LEAP_12;
    if (month === 13) return MONTH_NAMES[13];
    return MONTH_NAMES[month];
  }

  /* --- המרות --- */
  function hebToAbs(year, month, day) {
    var m, abs = day;
    if (month < 7) { // חודשי ניסן..אדר — אחרי תשרי בשנה
      var last = monthsInYear(year);
      for (m = 7; m <= last; m++) abs += daysInMonth(m, year);
      for (m = 1; m < month; m++) abs += daysInMonth(m, year);
    } else {
      for (m = 7; m < month; m++) abs += daysInMonth(m, year);
    }
    return abs + calendarElapsedDays(year) + HEB_EPOCH;
  }

  function absToHeb(abs) {
    var year = Math.floor((abs + -HEB_EPOCH) / 366);
    while (abs >= newYearAbs(year + 1)) year++;
    while (abs < newYearAbs(year)) year--;
    var month = (abs < hebToAbs(year, 1, 1)) ? 7 : 1;
    while (abs > hebToAbs(year, month, daysInMonth(month, year))) month++;
    var day = abs - hebToAbs(year, month, 1) + 1;
    return { y: year, m: month, d: day };
  }

  /* --- גימטריה --- */
  var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

  function gematriyaDigits(n) {
    var s = '';
    if (n >= 1000) { s += ONES[Math.floor(n / 1000)] + '׳'; n = n % 1000; }
    s += HUNDREDS[Math.floor(n / 100)];
    n = n % 100;
    if (n === 15) return s + 'טו';
    if (n === 16) return s + 'טז';
    return s + TENS[Math.floor(n / 10)] + ONES[n % 10];
  }

  /** מספר בגימטריה. marks=true מוסיף גרש/גרשיים. */
  function num2heb(n, marks) {
    var s = gematriyaDigits(n);
    if (!marks) return s;
    if (s.length === 1) return s + '׳';
    return s.slice(0, -1) + '״' + s.slice(-1);
  }

  /** שנה עברית בגימטריה — בלי האלפים (5786 → תשפ״ו) */
  function yearHeb(year, marks) { return num2heb(year % 1000, marks !== false); }

  /* --- אובייקט תאריך נוח --- */
  function fromDate(dt) {
    var abs = dateToAbs(dt);
    return make(abs);
  }
  function fromGreg(y, m, d) { return make(gregToAbs(y, m, d)); }
  function fromHeb(y, m, d) { return make(hebToAbs(y, m, d)); }

  function make(abs) {
    var h = absToHeb(abs);
    var g = absToGreg(abs);
    return {
      abs: abs,
      hy: h.y, hm: h.m, hd: h.d,
      gy: g.y, gm: g.m, gd: g.d,
      dow: ((abs % 7) + 7) % 7, // 0=ראשון
      date: absToDate(abs),
      monthName: monthName(h.m, h.y),
      dayHeb: num2heb(h.d, false),
      dayHebMarks: num2heb(h.d, true),
      yearHeb: yearHeb(h.y),
      isLeap: isLeapYear(h.y),
      /** "כ״ז אלול תשפ״ו" */
      toString: function () {
        return num2heb(h.d, true) + ' ' + monthName(h.m, h.y) + ' ' + yearHeb(h.y);
      }
    };
  }

  /** מולד החודש. מחזיר יום בשבוע (0=ראשון), שעה ודקות בשעון, וחלקים. */
  function molad(hy, hm) {
    var monthsToTishrei = Math.floor((235 * hy - 234) / 19);
    var offset = (hm >= 7) ? (hm - 7) : (hm - 7 + monthsInYear(hy));
    var parts = 31524 + (monthsToTishrei + offset) * 765433;
    var abs = Math.floor(parts / 25920) + HEB_EPOCH;
    var rem = parts % 25920;
    var jewishHour = Math.floor(rem / 1080);   // שעות מ־18:00
    var chalakim = rem % 1080;
    return {
      abs: abs,
      dow: ((abs % 7) + 7) % 7,
      hour: (jewishHour + 18) % 24,
      minute: Math.floor(chalakim / 18),
      chalakim: chalakim % 18
    };
  }

  /** נוסח הכרזת המולד */
  function moladText(hy, hm) {
    var m = molad(hy, hm);
    return 'המולד: ' + DAY_NAMES[m.dow] + ', ' + m.hour + ':' +
      (m.minute < 10 ? '0' : '') + m.minute + ' ו־' + m.chalakim + ' חלקים';
  }

  /** מספר החודש של אדר הרלוונטי (12 בפשוטה, 13 במעוברת) */
  function adarMonth(year) { return isLeapYear(year) ? 13 : 12; }

  return {
    HEB_EPOCH: HEB_EPOCH,
    MONTH_NAMES: MONTH_NAMES, GREG_MONTHS: GREG_MONTHS,
    DAY_NAMES: DAY_NAMES, DAY_NAMES_FULL: DAY_NAMES_FULL,
    isGregLeap: isGregLeap, gregToAbs: gregToAbs, absToGreg: absToGreg,
    absToDate: absToDate, dateToAbs: dateToAbs,
    isLeapYear: isLeapYear, monthsInYear: monthsInYear, daysInYear: daysInYear,
    daysInMonth: daysInMonth, monthName: monthName, newYearAbs: newYearAbs,
    hebToAbs: hebToAbs, absToHeb: absToHeb, adarMonth: adarMonth,
    molad: molad, moladText: moladText,
    num2heb: num2heb, yearHeb: yearHeb,
    fromDate: fromDate, fromGreg: fromGreg, fromHeb: fromHeb, make: make
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HDate;
